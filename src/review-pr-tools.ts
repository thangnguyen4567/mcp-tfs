import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as Diff from 'diff';
import { TfsClient } from './tfs-client.js';
import { summarizeChanges } from './review-engine.js';
import { CreateThreadRequest } from './models.js';

const VOTE_MAP = {
    approve: 10,
    approve_with_suggestions: 5,
    reset: 0,
    waiting_for_author: -5,
    reject: -10,
} as const;

type VoteLabel = keyof typeof VOTE_MAP;

export function registerPullRequestTools(server: McpServer, tfs: TfsClient, defaultRepoId?: string, _defaultProjectId?: string): void {

    // ─── Helper ──────────────────────────────────────────────────────────────

    function resolveRepoId(repoId?: string): string {
        const id = repoId || defaultRepoId;
        if (!id) throw new Error('repositoryId is required (or set TFS_DEFAULT_REPO_ID in env)');
        return id;
    }

    // ─── Tool: list_repositories ─────────────────────────────────────────────

    server.tool(
        'list_repositories',
        'Liệt kê tất cả Git repositories trong TFS collection',
        {},
        async () => {
            const repos = await tfs.listRepositories();
            const text = repos
                .map((r) => `• [${r.id}] ${r.name} (project: ${r.project.name}, default branch: ${r.defaultBranch || 'N/A'})`)
                .join('\n');
            return {
                content: [{ type: 'text', text: `Tìm thấy ${repos.length} repositories:\n\n${text}` }],
            };
        }
    );

    // ─── Tool: list_pull_requests ────────────────────────────────────────────

    server.tool(
        'list_pull_requests',
        'Lấy danh sách Pull Requests trong repository',
        {
            repositoryId: z.string().optional().describe('ID của repository (mặc định lấy từ env TFS_DEFAULT_REPO_ID)'),
            status: z
                .enum(['active', 'completed', 'abandoned', 'all'])
                .optional()
                .default('active')
                .describe('Trạng thái PR: active | completed | abandoned | all'),
            top: z.number().optional().default(20).describe('Số PR tối đa trả về'),
        },
        async ({ repositoryId, status = 'active', top = 20 }) => {
            const repoId = resolveRepoId(repositoryId);
            const prs = await tfs.listPullRequests(repoId, status, top);

            if (prs.length === 0) {
                return { content: [{ type: 'text', text: `Không có PR nào với status: ${status}` }] };
            }

            const text = prs
                .map((pr) => {
                    const reviewerInfo = pr.reviewers
                        .map((r) => {
                            const voteLabel =
                                r.vote === 10 ? '✅' : r.vote === 5 ? '👍' : r.vote === -5 ? '⏳' : r.vote === -10 ? '❌' : '⚪';
                            return `${r.displayName} ${voteLabel}`;
                        })
                        .join(', ');

                    return [
                        `### PR #${pr.pullRequestId}: ${pr.title}`,
                        `  Status: ${pr.status} | Draft: ${pr.isDraft ? 'Yes' : 'No'}`,
                        `  Author: ${pr.createdBy.displayName}`,
                        `  Branch: ${pr.sourceRefName} → ${pr.targetRefName}`,
                        `  Created: ${new Date(pr.creationDate).toLocaleDateString('vi-VN')}`,
                        reviewerInfo ? `  Reviewers: ${reviewerInfo}` : '',
                        pr.description ? `  Description: ${pr.description.substring(0, 100)}${pr.description.length > 100 ? '...' : ''}` : '',
                    ]
                        .filter(Boolean)
                        .join('\n');
                })
                .join('\n\n');

            return {
                content: [{ type: 'text', text: `## Pull Requests (${status}) — ${prs.length} PR\n\n${text}` }],
            };
        }
    );

    // ─── Tool: get_pr_changes ────────────────────────────────────────────────

    server.tool(
        'get_pr_changes',
        'Lấy danh sách files thay đổi trong Pull Request',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            repositoryId: z.string().optional().describe('ID của repository'),
            iterationId: z.number().optional().describe('ID của iteration (mặc định: iteration mới nhất)'),
        },
        async ({ pullRequestId, repositoryId, iterationId }) => {
            const repoId = resolveRepoId(repositoryId);
            const changes = await tfs.getPrChanges(repoId, pullRequestId, iterationId);
            const entries = changes.changeEntries || [];

            if (entries.length === 0) {
                return { content: [{ type: 'text', text: 'Không có files thay đổi nào.' }] };
            }

            const summary = summarizeChanges(entries);
            const grouped = { frontend: [] as typeof summary, backend: [] as typeof summary, other: [] as typeof summary };
            for (const s of summary) grouped[s.type].push(s);

            const formatGroup = (label: string, items: typeof summary) => {
                if (items.length === 0) return '';
                return `### ${label} (${items.length})\n` + items.map((i) => `  [${i.changeType}] ${i.path}`).join('\n');
            };

            const text = [
                `## Files thay đổi trong PR #${pullRequestId} (${summary.length} files)`,
                '',
                formatGroup('🎨 Frontend', grouped.frontend),
                formatGroup('⚙️ Backend', grouped.backend),
                formatGroup('📄 Other', grouped.other),
            ]
                .filter(Boolean)
                .join('\n\n');

            return { content: [{ type: 'text', text }] };
        }
    );

    // ─── Tool: get_pr_file_diff ──────────────────────────────────────────────

    server.tool(
        'get_pr_file_diff',
        'Lấy diff line-by-line của 1 file trong Pull Request (so sánh trước và sau thay đổi)',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            filePath: z.string().describe('Đường dẫn file cần xem diff (VD: /src/app/feature/feature.component.ts)'),
            repositoryId: z.string().optional().describe('ID của repository'),
            contextLines: z.number().optional().default(3).describe('Số dòng context xung quanh mỗi thay đổi (default: 3)'),
        },
        async ({ pullRequestId, filePath, repositoryId, contextLines = 3 }) => {
            const repoId = resolveRepoId(repositoryId);
            const fileDiff = await tfs.getFileDiff(repoId, pullRequestId, filePath);

            const { beforeContent, afterContent, sourceCommit, targetCommit } = fileDiff;

            // Tính unified diff
            const patch = Diff.createPatch(
                filePath,
                beforeContent,
                afterContent,
                `target (${targetCommit.substring(0, 8)})`,
                `source  (${sourceCommit.substring(0, 8)})`,
                { context: contextLines }
            );

            // Parse patch thành line objects để hiển thị đẹp
            const parsedDiff = Diff.parsePatch(patch);
            const hunk = parsedDiff[0];

            if (!hunk || hunk.hunks.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `## ${filePath}\n\n✅ Không có thay đổi nào trong file này.`,
                    }],
                };
            }

            // Thống kê
            let addedLines = 0;
            let removedLines = 0;
            const lineDetails: string[] = [];

            for (const h of hunk.hunks) {
                lineDetails.push(`\n@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);

                let oldLine = h.oldStart;
                let newLine = h.newStart;

                for (const line of h.lines) {
                    if (line.startsWith('+')) {
                        lineDetails.push(`  [+${String(newLine).padStart(4)}] ${line}`);
                        newLine++;
                        addedLines++;
                    } else if (line.startsWith('-')) {
                        lineDetails.push(`  [-${String(oldLine).padStart(4)}] ${line}`);
                        oldLine++;
                        removedLines++;
                    } else {
                        lineDetails.push(`  [ ${String(newLine).padStart(4)}] ${line}`);
                        oldLine++;
                        newLine++;
                    }
                }
            }

            const isNewFile = beforeContent === '';
            const isDeleted = afterContent === '';
            const fileStatus = isNewFile ? '🆕 File mới' : isDeleted ? '🗑️ File bị xóa' : '✏️ File thay đổi';

            const summary = [
                `## Diff: ${filePath}`,
                `${fileStatus} | +${addedLines} dòng thêm | -${removedLines} dòng xóa`,
                `Source: \`${sourceCommit.substring(0, 8)}\` ← Target: \`${targetCommit.substring(0, 8)}\``,
                '',
                '```diff',
                ...lineDetails,
                '```',
            ].join('\n');

            return { content: [{ type: 'text', text: summary }] };
        }
    );

    // ─── Tool: get_pr_threads ────────────────────────────────────────────────

    server.tool(
        'get_pr_threads',
        'Lấy tất cả comment threads trong Pull Request',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            repositoryId: z.string().optional().describe('ID của repository'),
            includeDeleted: z.boolean().optional().default(false).describe('Bao gồm threads đã xóa'),
        },
        async ({ pullRequestId, repositoryId, includeDeleted = false }) => {
            const repoId = resolveRepoId(repositoryId);
            let threads = await tfs.getPrThreads(repoId, pullRequestId);

            if (!includeDeleted) {
                threads = threads.filter((t) => !t.isDeleted);
            }

            if (threads.length === 0) {
                return { content: [{ type: 'text', text: 'Không có comment nào trong PR này.' }] };
            }

            const statusLabel: Record<string, string> = {
                '1': 'Active 💬',
                '2': 'Fixed ✅',
                '3': 'WontFix 🚫',
                '4': 'Closed 🔒',
                '5': 'ByDesign 📐',
                '6': 'Pending ⏳',
            };

            const text = threads
                .map((t) => {
                    const activeComments = t.comments.filter((c) => !c.isDeleted);
                    if (activeComments.length === 0) return '';

                    const firstComment = activeComments[0];
                    const file = t.threadContext?.filePath ? `📄 ${t.threadContext.filePath}` : '📝 General';
                    const line = t.threadContext?.rightFileStart ? ` (line ${t.threadContext.rightFileStart.line})` : '';
                    const status = statusLabel[String(t.status)] || `Status ${t.status}`;

                    const commentsText = activeComments
                        .map((c) => `  **${c.author.displayName}:** ${c.content}`)
                        .join('\n');

                    return [`### Thread #${t.id} — ${status}`, `${file}${line}`, commentsText].join('\n');
                })
                .filter(Boolean)
                .join('\n\n---\n\n');

            return {
                content: [{ type: 'text', text: `## Threads trong PR #${pullRequestId} (${threads.length})\n\n${text}` }],
            };
        }
    );

    // ─── Tool: create_review_comment ─────────────────────────────────────────

    server.tool(
        'create_review_comment',
        'Tạo comment review trên một file hoặc PR (general comment)',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            repositoryId: z.string().optional().describe('ID của repository'),
            content: z.string().describe('Nội dung comment'),
            filePath: z.string().optional().describe('Đường dẫn file cần comment (bỏ trống cho general comment)'),
            line: z.number().optional().describe('Số dòng cần comment'),
            status: z
                .enum(['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'])
                .optional()
                .default('active')
                .describe('Trạng thái thread'),
        },
        async ({ pullRequestId, repositoryId, content, filePath, line, status = 'active' }) => {
            const repoId = resolveRepoId(repositoryId);

            const statusMap = { active: 1, fixed: 2, wontFix: 3, closed: 4, byDesign: 5, pending: 6 };

            const request: CreateThreadRequest = {
                comments: [{ parentCommentId: 0, content, commentType: 1 }],
                status: statusMap[status],
            };

            if (filePath) {
                request.threadContext = { filePath };
                if (line) {
                    request.threadContext.rightFileStart = { line, offset: 1 };
                    request.threadContext.rightFileEnd = { line, offset: 1 };
                }
            }

            const thread = await tfs.createThread(repoId, pullRequestId, request);

            const location = filePath ? `file ${filePath}${line ? ` (line ${line})` : ''}` : 'PR (general)';
            return {
                content: [
                    {
                        type: 'text',
                        text: `✅ Đã tạo comment thread #${thread.id} tại ${location}\n\nContent: ${content}`,
                    },
                ],
            };
        }
    );

    // ─── Tool: get_pr_unresolved_comments ───────────────────────────────────

    server.tool(
        'get_pr_unresolved_comments',
        'Lấy danh sách các comment cần resolve (status: active/pending) trong Pull Request',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            repositoryId: z.string().optional().describe('ID của repository'),
        },
        async ({ pullRequestId, repositoryId }) => {
            const repoId = resolveRepoId(repositoryId);
            const allThreads = await tfs.getPrThreads(repoId, pullRequestId);

            // Chỉ lấy thread chưa deleted và có status active (1) hoặc pending (6)
            const unresolvedThreads = allThreads.filter(
                (t) => !t.isDeleted && (t.status === '1' || t.status === '6')
            );

            if (unresolvedThreads.length === 0) {
                return {
                    content: [{ type: 'text', text: `✅ PR #${pullRequestId} không còn comment nào cần resolve.` }],
                };
            }

            const statusLabel: Record<string, string> = {
                '1': 'Active 💬',
                '6': 'Pending ⏳',
            };

            const text = unresolvedThreads
                .map((t) => {
                    const activeComments = t.comments.filter((c) => !c.isDeleted);
                    if (activeComments.length === 0) return '';

                    const firstComment = activeComments[0];
                    const file = t.threadContext?.filePath ? `📄 \`${t.threadContext.filePath}\`` : '📝 General';
                    const line = t.threadContext?.rightFileStart ? ` (line ${t.threadContext.rightFileStart.line})` : '';
                    const status = statusLabel[t.status] ?? `Status ${t.status}`;

                    const commentsText = activeComments
                        .map((c, idx) => {
                            const prefix = idx === 0 ? '  💬' : '  ↩️';
                            return `${prefix} **${c.author.displayName}:** ${c.content}`;
                        })
                        .join('\n');

                    return [
                        `### Thread #${t.id} — ${status}`,
                        `${file}${line}`,
                        commentsText,
                    ].join('\n');
                })
                .filter(Boolean)
                .join('\n\n---\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `## ⚠️ Comments cần resolve trong PR #${pullRequestId} (${unresolvedThreads.length} thread)\n\n${text}`,
                    },
                ],
            };
        }
    );

    // ─── Tool: vote_pull_request ─────────────────────────────────────────────

    server.tool(
        'vote_pull_request',
        'Vote/Approve/Reject Pull Request',
        {
            pullRequestId: z.number().describe('ID của Pull Request'),
            repositoryId: z.string().optional().describe('ID của repository'),
            vote: z
                .enum(['approve', 'approve_with_suggestions', 'reset', 'waiting_for_author', 'reject'])
                .describe('Loại vote: approve | approve_with_suggestions | reset | waiting_for_author | reject'),
            reviewerId: z
                .string()
                .optional()
                .describe('ID reviewer (mặc định dùng TFS_USER_ID từ env)'),
        },
        async ({ pullRequestId, repositoryId, vote, reviewerId }) => {
            const repoId = resolveRepoId(repositoryId);
            const rid = reviewerId || process.env.TFS_USER_ID;
            if (!rid) throw new Error('reviewerId is required (or set TFS_USER_ID in env)');

            const voteValue = VOTE_MAP[vote as VoteLabel];
            const reviewer = await tfs.votePullRequest(repoId, pullRequestId, rid, voteValue);

            const labels: Record<string, string> = {
                approve: '✅ Approved',
                approve_with_suggestions: '👍 Approved with suggestions',
                reset: '⚪ Vote reset',
                waiting_for_author: '⏳ Waiting for author',
                reject: '❌ Rejected',
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `${labels[vote]} PR #${pullRequestId} bởi ${reviewer.displayName}`,
                    },
                ],
            };
        }
    );

    // ─── End ──────────────────────────────────────────────────────────────────
}
