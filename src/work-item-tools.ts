import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  WorkItem,
  CreateWorkItemField,
  WorkItemRelation,
} from './models.js';
// ─── Helper: format work item ─────────────────────────────────────────────────
import { TfsClient } from './tfs-client.js';

function getWorkItemUrl(id: number): string {
  const baseUrl = process.env.TFS_BASE_URL || '';
  const collection = process.env.TFS_COLLECTION || 'DefaultCollection';
  const project = process.env.TFS_DEFAULT_PROJECT_ID || '';
  return `${baseUrl}/${collection}/${project}/_workitems/edit/${id}`;
}

function formatWorkItem(wi: WorkItem, childSummary?: string, linksSummary?: string, attachmentsSummary?: string): string {
  const f = wi.fields;
  const assignedTo =
    typeof f['System.AssignedTo'] === 'object' && f['System.AssignedTo']
      ? (f['System.AssignedTo'] as { displayName: string }).displayName
      : (f['System.AssignedTo'] as string) || 'Unassigned';
  const priority = f['Microsoft.VSTS.Common.Priority']
    ? ` | Priority: ${f['Microsoft.VSTS.Common.Priority']}`
    : '';
  const tags = f['System.Tags'] ? ` | Tags: ${f['System.Tags']}` : '';
  const description = f['System.Description']
    ? `\n  Description: ${f['System.Description'].replace(/<[^>]+>/g, '').substring(0, 200)}${f['System.Description'].length > 200 ? '...' : ''}`
    : '';
  const url = getWorkItemUrl(wi.id);
  return [
    `### #${wi.id}: [${f['System.Title']}](${url})`,
    `  Type: ${f['System.WorkItemType']} | State: ${f['System.State']}${priority}`,
    `  Assigned to: ${assignedTo}`,
    `  Area: ${f['System.AreaPath'] || 'N/A'} | Iteration: ${f['System.IterationPath'] || 'N/A'}`,
    `  Changed: ${new Date(f['System.ChangedDate']).toLocaleDateString('vi-VN')}${tags}`,
    `${f['System.WorkItemType'] === 'User Story' ? `  Story Points: ${f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 'N/A'}` : ''}`,
    childSummary ? childSummary : '',
    linksSummary ? linksSummary : '',
    attachmentsSummary ? attachmentsSummary : '',
    description,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Lấy child task IDs từ relations của User Story
 */
function getChildIds(wi: WorkItem): number[] {
  if (!wi.relations) return [];
  return wi.relations
    .filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward')
    .map((r) => {
      const match = r.url.match(/\/workItems\/(\d+)$/i);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((id) => id > 0);
}

/**
 * Lấy links (non-child, non-parent relations) từ User Story
 */
function getLinks(wi: WorkItem): WorkItemRelation[] {
  if (!wi.relations) return [];
  return wi.relations.filter(
    (r) =>
      r.rel !== 'System.LinkTypes.Hierarchy-Forward' &&
      r.rel !== 'System.LinkTypes.Hierarchy-Reverse' &&
      r.rel !== 'AttachedFile'
  );
}

/**
 * Lấy attachments từ User Story
 */
function getAttachments(wi: WorkItem): WorkItemRelation[] {
  if (!wi.relations) return [];
  return wi.relations.filter((r) => r.rel === 'AttachedFile');
}

/**
 * Format links summary
 */
function formatLinksSummary(links: WorkItemRelation[]): string {
  if (links.length === 0) return '';
  const lines = links.map((l) => {
    const name = (l.attributes['name'] as string) || (l.attributes['comment'] as string) || '';
    const relType = l.rel.replace('System.LinkTypes.', '').replace('-', ' ');
    const idMatch = l.url.match(/\/workItems\/(\d+)$/i);
    const id = idMatch ? `#${idMatch[1]}` : l.url;
    return `    🔗 ${relType}: ${id}${name ? ` (${name})` : ''}`;
  });
  return `  🔗 Links (${links.length}):\n${lines.join('\n')}`;
}

/**
 * Format attachments summary
 */
function formatAttachmentsSummary(attachments: WorkItemRelation[]): string {
  if (attachments.length === 0) return '';
  const lines = attachments.map((a) => {
    const name = (a.attributes['name'] as string) || 'attachment';
    const url = a.url;
    return `    📎 [${name}](${url})`;
  });
  return `  📎 Attachments (${attachments.length}):\n${lines.join('\n')}`;
}

/**
 * Format child tasks summary cho User Story
 */
function formatChildSummary(children: WorkItem[]): string {
  if (children.length === 0) return '  📋 Child Tasks: (none)';
  const lines = children.map((c) => {
    const state = c.fields['System.State'];
    const icon = state === 'Closed' || state === 'Done' ? '✅' : state === 'Active' ? '🔵' : '⚪';
    const assignedTo =
      typeof c.fields['System.AssignedTo'] === 'object' && c.fields['System.AssignedTo']
        ? (c.fields['System.AssignedTo'] as { displayName: string }).displayName
        : (c.fields['System.AssignedTo'] as string) || 'Unassigned';
    return `    ${icon} #${c.id}: ${c.fields['System.Title']} [${state}] - ${assignedTo}`;
  });
  const done = children.filter((c) => c.fields['System.State'] === 'Closed' || c.fields['System.State'] === 'Done').length;
  return `  📋 Child Tasks: ${done}/${children.length} done\n${lines.join('\n')}`;
}

// ─── Register Work Item Tools ─────────────────────────────────────────────────

export function registerWorkItemTools(
  server: McpServer,
  tfs: TfsClient,
  defaultProjectId: string,
  defaultAssignedTo: string
): void {
  function resolveProjectId(projectId?: string): string {
    const id = projectId || defaultProjectId;
    if (!id) throw new Error('project is required (or set TFS_DEFAULT_PROJECT_ID in env)');
    return id;
  }

  // ─── Tool: list_projects ───────────────────────────────────────────────────

  server.tool(
    'list_projects',
    'Liệt kê tất cả projects trong TFS collection',
    {},
    async () => {
      const projects = await tfs.listProjects();
      if (projects.length === 0) {
        return { content: [{ type: 'text', text: 'Không có project nào.' }] };
      }
      const text = projects.map((p) => `• [${p.id}] ${p.name} (${p.state})`).join('\n');
      return {
        content: [{ type: 'text', text: `Tìm thấy ${projects.length} projects:\n\n${text}` }],
      };
    }
  );

  // ─── Tool: list_my_work_items ──────────────────────────────────────────────

  server.tool(
    'list_my_work_items',
    'Lấy danh sách work items được giao cho bạn (hoặc theo state/type) Sprint hiện tại là: ' + process.env.SPRINT_NAME,
    {
      project: z
        .string()
        .optional()
        .describe('Tên hoặc ID của TFS project (mặc định lấy từ TFS_DEFAULT_PROJECT_ID)'),
      assignedTo: z
        .string()
        .optional()
        .describe('Email/display name người được giao (mặc định: @Me — bản thân)'),
      state: z.string().optional().describe('Lọc theo state (VD: Active, Resolved, Closed, New)'),
      workItemType: z
        .string()
        .optional()
        .describe('Lọc theo loại (VD: Task, Bug, User Story, Feature) Mặc định là Task'),
      top: z.number().optional().default(30).describe('Số work items tối đa'),
    },
    async ({ project, assignedTo, state, workItemType, top = 30 }) => {
      const proj = resolveProjectId(project);
      const assignedFilter = assignedTo
        ? `[System.AssignedTo] = '${assignedTo}'`
        : `[System.AssignedTo] = @Me`;
      const stateFilter = state ? ` AND [System.State] = '${state}'` : '';
      const typeFilter = workItemType ? ` AND [System.WorkItemType] = '${workItemType}'` : '';
      const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate]
        FROM WorkItems
        WHERE ${assignedFilter}${stateFilter}${typeFilter}
        ORDER BY [System.ChangedDate] DESC`;

      const refs = await tfs.queryWorkItems(proj, wiql, top);
      if (refs.length === 0) {
        return { content: [{ type: 'text', text: 'Không có work items nào phù hợp.' }] };
      }

      const ids = refs.map((r) => r.id);
      const items = await tfs.getWorkItemsByIds(ids);

      // Nếu có User Story, lấy relations để hiển thị child tasks, links, attachments
      const userStories = items.filter((i) => i.fields['System.WorkItemType'] === 'User Story');
      let childMap: Map<number, WorkItem[]> = new Map();
      let linksMap: Map<number, WorkItemRelation[]> = new Map();
      let attachmentsMap: Map<number, WorkItemRelation[]> = new Map();

      if (userStories.length > 0) {
        const usWithRelations = await tfs.getWorkItemsByIdsWithRelations(userStories.map((us) => us.id));
        const allChildIds: number[] = [];
        const usChildMap: Map<number, number[]> = new Map();

        for (const us of usWithRelations) {
          const childIds = getChildIds(us);
          usChildMap.set(us.id, childIds);
          allChildIds.push(...childIds);
          linksMap.set(us.id, getLinks(us));
          attachmentsMap.set(us.id, getAttachments(us));
        }

        if (allChildIds.length > 0) {
          const uniqueChildIds = [...new Set(allChildIds)];
          const childItems = await tfs.getWorkItemsByIds(uniqueChildIds);
          const childItemMap = new Map(childItems.map((c) => [c.id, c]));

          for (const [usId, childIds] of usChildMap) {
            childMap.set(usId, childIds.map((id) => childItemMap.get(id)).filter(Boolean) as WorkItem[]);
          }
        }
      }

      const text = items.map((item) => {
        const isUS = item.fields['System.WorkItemType'] === 'User Story';
        const children = childMap.get(item.id);
        const childSummary = isUS ? formatChildSummary(children || []) : undefined;
        const linksSummary = isUS ? formatLinksSummary(linksMap.get(item.id) || []) : undefined;
        const attachmentsSummary = isUS ? formatAttachmentsSummary(attachmentsMap.get(item.id) || []) : undefined;
        return formatWorkItem(item, childSummary, linksSummary, attachmentsSummary);
      }).join('\n\n');

      return {
        content: [{ type: 'text', text: `## Work Items (${items.length})\n\n${text}` }],
      };
    }
  );

  // ─── Tool: query_work_items ────────────────────────────────────────────────

  server.tool(
    'query_work_items',
    'Tìm kiếm work items bằng WIQL query tùy chỉnh hoặc từ khóa tìm kiếm, Sprint hiện tại là: ' + process.env.SPRINT_NAME,
    {
      project: z
        .string()
        .optional()
        .describe('Tên hoặc ID của TFS project (mặc định lấy từ TFS_DEFAULT_PROJECT_ID)'),
      wiql: z.string().optional().describe('WIQL query tùy chỉnh (nếu không nhập sẽ dùng keyword)'),
      keyword: z.string().optional().describe('Từ khóa tìm trong title của work items'),
      state: z.string().optional().describe('Lọc theo state (VD: Active, New, Resolved)'),
      workItemType: z.string().optional().describe('Lọc theo loại (VD: Task, Bug, User Story) Mặc định là Task'),
      top: z.number().optional().default(20).describe('Số kết quả tối đa'),
    },
    async ({ project, wiql, keyword, state, workItemType, top = 20 }) => {
      const proj = resolveProjectId(project);
      let query = wiql;
      if (!query) {
        const keywordFilter = keyword ? ` AND [System.Title] CONTAINS '${keyword}'` : '';
        const stateFilter = state ? ` AND [System.State] = '${state}'` : '';
        const typeFilter = workItemType ? ` AND [System.WorkItemType] = '${workItemType}'` : '';
        query = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate]
          FROM WorkItems
          WHERE [System.Id] > 0${keywordFilter}${stateFilter}${typeFilter}
          ORDER BY [System.ChangedDate] DESC`;
      }

      const refs = await tfs.queryWorkItems(proj, query, top);
      if (refs.length === 0) {
        return { content: [{ type: 'text', text: 'Không tìm thấy work items nào.' }] };
      }

      const items = await tfs.getWorkItemsByIds(refs.map((r) => r.id));

      // Nếu có User Story, lấy relations để hiển thị child tasks, links, attachments
      const userStories = items.filter((i) => i.fields['System.WorkItemType'] === 'User Story');
      let childMap: Map<number, WorkItem[]> = new Map();
      let linksMap: Map<number, WorkItemRelation[]> = new Map();
      let attachmentsMap: Map<number, WorkItemRelation[]> = new Map();

      if (userStories.length > 0) {
        const usWithRelations = await tfs.getWorkItemsByIdsWithRelations(userStories.map((us) => us.id));
        const allChildIds: number[] = [];
        const usChildMap: Map<number, number[]> = new Map();

        for (const us of usWithRelations) {
          const childIds = getChildIds(us);
          usChildMap.set(us.id, childIds);
          allChildIds.push(...childIds);
          linksMap.set(us.id, getLinks(us));
          attachmentsMap.set(us.id, getAttachments(us));
        }

        if (allChildIds.length > 0) {
          const uniqueChildIds = [...new Set(allChildIds)];
          const childItems = await tfs.getWorkItemsByIds(uniqueChildIds);
          const childItemMap = new Map(childItems.map((c) => [c.id, c]));

          for (const [usId, childIds] of usChildMap) {
            childMap.set(usId, childIds.map((id) => childItemMap.get(id)).filter(Boolean) as WorkItem[]);
          }
        }
      }

      const text = items.map((item) => {
        const isUS = item.fields['System.WorkItemType'] === 'User Story';
        const children = childMap.get(item.id);
        const childSummary = isUS ? formatChildSummary(children || []) : undefined;
        const linksSummary = isUS ? formatLinksSummary(linksMap.get(item.id) || []) : undefined;
        const attachmentsSummary = isUS ? formatAttachmentsSummary(attachmentsMap.get(item.id) || []) : undefined;
        return formatWorkItem(item, childSummary, linksSummary, attachmentsSummary);
      }).join('\n\n');

      return {
        content: [{ type: 'text', text: `## Kết quả tìm kiếm (${items.length})\n\n${text}` }],
      };
    }
  );

  // ─── Tool: get_work_item ───────────────────────────────────────────────────

  server.tool(
    'get_work_item',
    'Lấy chi tiết đầy đủ của một work item theo ID',
    {
      id: z.number().describe('ID của work item'),
    },
    async ({ id }) => {
      // Lấy work item với relations để có đầy đủ links, attachments, child tasks
      const wiArr = await tfs.getWorkItemsByIdsWithRelations([id]);
      if (wiArr.length === 0) throw new Error(`Work item #${id} not found`);
      const wi = wiArr[0];
      const f = wi.fields;
      const assignedTo =
        typeof f['System.AssignedTo'] === 'object' && f['System.AssignedTo']
          ? (f['System.AssignedTo'] as { displayName: string; uniqueName: string })
          : null;

      const url = getWorkItemUrl(wi.id);
      const lines = [
        `## Work Item #${wi.id}: [${f['System.Title']}](${url})`,
        '',
        `**Type:** ${f['System.WorkItemType']}  |  **State:** ${f['System.State']}`,
        `**Project:** ${f['System.TeamProject'] || 'N/A'}`,
        `**Assigned to:** ${assignedTo ? `${assignedTo.displayName} (${assignedTo.uniqueName})` : (f['System.AssignedTo'] as string) || 'Unassigned'}`,
        `**Area:** ${f['System.AreaPath'] || 'N/A'}`,
        `**Iteration:** ${f['System.IterationPath'] || 'N/A'}`,
        `**Priority:** ${f['Microsoft.VSTS.Common.Priority'] ?? 'N/A'}`,
        `**Story Points:** ${f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 'N/A'}`,
        `**Tags:** ${f['System.Tags'] || 'None'}`,
        `**Created:** ${new Date(f['System.CreatedDate']).toLocaleString('vi-VN')}`,
        `**Last changed:** ${new Date(f['System.ChangedDate']).toLocaleString('vi-VN')}`,
      ];

      if (f['System.Description']) {
        const cleanDesc = f['System.Description'].replace(/<[^>]+>/g, '').trim();
        lines.push('', '### Description', cleanDesc);
      }

      // Child tasks
      const childIds = getChildIds(wi);
      if (childIds.length > 0) {
        const childItems = await tfs.getWorkItemsByIds(childIds);
        lines.push('', formatChildSummary(childItems));
      }

      // Links
      const links = getLinks(wi);
      if (links.length > 0) {
        lines.push('', formatLinksSummary(links));
      }

      // Attachments
      const attachments = getAttachments(wi);
      if (attachments.length > 0) {
        lines.push('', formatAttachmentsSummary(attachments));
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ─── Tool: create_work_item ────────────────────────────────────────────────

  server.tool(
    'create_work_item',
    'Tạo mới một work item trong TFS project , ngày hiện tại là: ' + new Date().toLocaleDateString('vi-VN') + ', Sprint hiện tại là: ' + process.env.SPRINT_NAME + ' 1 Sprint kéo dài 2 tuần, deadline mặc định sẽ là cuối Sprint. Lưu ý: Task và Bug bắt buộc phải có parentId (ID của User Story cha).',
    {
      project: z
        .string()
        .optional()
        .describe('Tên TFS project (mặc định lấy từ TFS_DEFAULT_PROJECT_ID)'),
      workItemType: z
        .string()
        .describe('Loại work item: Task | Bug | User Story | Feature | Epic | Issue'),
      title: z.string().describe('Tiêu đề work item'),
      description: z.string().optional().describe('Mô tả chi tiết'),
      assignedTo: z
        .string()
        .optional()
        .describe('Email người được giao (VD: thang.nguyen@company.com)'),
      areaPath: z.string().optional().describe('Area path (VD: MyProject\\Team A)'),
      iterationPath: z
        .string()
        .optional()
        .describe('Iteration path (VD: MyProject\\Sprint 1)'),
      priority: z.number().min(1).max(4).optional().describe('Độ ưu tiên: 1 (cao) – 4 (thấp)'),
      tags: z.string().optional().describe('Tags, phân cách bằng dấu chấm phẩy'),
      storyPoints: z.number().describe('Story Points (số giờ/điểm ước tính)'),
      deadline: z.string().describe('Deadline (ISO date, VD: 2026-06-30)'),
      aiTime: z.number().describe('AI Time (số giờ AI hỗ trợ)'),
      bizPoint: z.number().optional().default(0).describe('Biz Point (mặc định 0)'),
      parentId: z
        .number()
        .optional()
        .describe('ID của User Story cha (bắt buộc với Task và Bug)'),
    },
    async ({
      project,
      workItemType,
      title,
      description,
      assignedTo,
      areaPath,
      iterationPath,
      priority,
      tags,
      storyPoints,
      deadline,
      aiTime,
      bizPoint,
      parentId,
    }) => {
      const type = workItemType.toLowerCase();
      if ((type === 'task' || type === 'bug') && !parentId) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${workItemType} bắt buộc phải có parentId (ID của User Story cha).`,
            },
          ],
        };
      }

      const proj = resolveProjectId(project);
      const tfsBaseUrl = (tfs as any).http.defaults.baseURL as string;
      const ops: CreateWorkItemField[] = [{ op: 'add', path: '/fields/System.Title', value: title }];

      if (description) ops.push({ op: 'add', path: '/fields/System.Description', value: description });

      const assignee = assignedTo ?? defaultAssignedTo;
      if (assignee) ops.push({ op: 'add', path: '/fields/System.AssignedTo', value: assignee });

      if (areaPath) ops.push({ op: 'add', path: '/fields/System.AreaPath', value: areaPath });
      if (iterationPath)
        ops.push({ op: 'add', path: '/fields/System.IterationPath', value: iterationPath });
      if (priority)
        ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priority });
      if (tags) ops.push({ op: 'add', path: '/fields/System.Tags', value: tags });

      ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StoryPoints', value: storyPoints });
      ops.push({ op: 'add', path: '/fields/VNR.Agile.Deadline', value: deadline });
      ops.push({ op: 'add', path: '/fields/VNR.Agile.AITime', value: aiTime });
      ops.push({ op: 'add', path: '/fields/VNR.Agile.BizPoint', value: bizPoint ?? 0 });

      if (parentId) {
        ops.push({
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: `${tfsBaseUrl}/_apis/wit/workitems/${parentId}`,
            attributes: { comment: '' },
          },
        });
      }

      const wi = await tfs.createWorkItem(proj, workItemType, ops);
      return {
        content: [
          {
            type: 'text',
            text: `✅ Đã tạo ${workItemType} #${wi.id}: **${wi.fields['System.Title']}**\nState: ${wi.fields['System.State']}${parentId ? `\nParent: #${parentId}` : ''}`,
          },
        ],
      };
    }
  );

  // ─── Tool: update_work_item ────────────────────────────────────────────────

  server.tool(
    'update_work_item',
    'Cập nhật thông tin một work item (state, tiêu đề, người được giao, v.v.)',
    {
      id: z.number().describe('ID của work item cần cập nhật'),
      title: z.string().optional().describe('Tiêu đề mới'),
      state: z
        .string()
        .optional()
        .describe('Trạng thái mới (VD: Active, Resolved, Closed, New)'),
      assignedTo: z.string().optional().describe('Email người được giao mới'),
      description: z.string().optional().describe('Mô tả mới'),
      areaPath: z.string().optional().describe('Area path mới'),
      iterationPath: z.string().optional().describe('Iteration path mới'),
      priority: z.number().min(1).max(4).optional().describe('Độ ưu tiên mới (1–4)'),
      tags: z.string().optional().describe('Tags mới (ghi đè toàn bộ)'),
      comment: z.string().optional().describe('Comment khi thay đổi (history note)'),
    },
    async ({
      id,
      title,
      state,
      assignedTo,
      description,
      areaPath,
      iterationPath,
      priority,
      tags,
      comment,
    }) => {
      const ops: CreateWorkItemField[] = [];
      if (title) ops.push({ op: 'replace', path: '/fields/System.Title', value: title });
      if (state) ops.push({ op: 'replace', path: '/fields/System.State', value: state });
      if (assignedTo !== undefined)
        ops.push({ op: 'replace', path: '/fields/System.AssignedTo', value: assignedTo });
      if (description)
        ops.push({ op: 'replace', path: '/fields/System.Description', value: description });
      if (areaPath) ops.push({ op: 'replace', path: '/fields/System.AreaPath', value: areaPath });
      if (iterationPath)
        ops.push({ op: 'replace', path: '/fields/System.IterationPath', value: iterationPath });
      if (priority)
        ops.push({ op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: priority });
      if (tags !== undefined)
        ops.push({ op: 'replace', path: '/fields/System.Tags', value: tags });
      if (comment) ops.push({ op: 'add', path: '/fields/System.History', value: comment });

      if (ops.length === 0) {
        return {
          content: [{ type: 'text', text: '⚠️ Không có trường nào được chỉ định để cập nhật.' }],
        };
      }

      const wi = await tfs.updateWorkItem(id, ops);
      const f = wi.fields;
      return {
        content: [
          {
            type: 'text',
            text: `✅ Đã cập nhật Work Item #${wi.id}: **${f['System.Title']}**\nState: ${f['System.State']}`,
          },
        ],
      };
    }
  );
}
