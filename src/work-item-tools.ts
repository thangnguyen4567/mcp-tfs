import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TfsClient, WorkItem, CreateWorkItemField } from './tfs-client.js';

// ─── Helper: format work item ─────────────────────────────────────────────────

function formatWorkItem(wi: WorkItem): string {
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
  return [
    `### #${wi.id}: ${f['System.Title']}`,
    `  Type: ${f['System.WorkItemType']} | State: ${f['System.State']}${priority}`,
    `  Assigned to: ${assignedTo}`,
    `  Area: ${f['System.AreaPath'] || 'N/A'} | Iteration: ${f['System.IterationPath'] || 'N/A'}`,
    `  Changed: ${new Date(f['System.ChangedDate']).toLocaleDateString('vi-VN')}${tags}`,
    description,
  ]
    .filter(Boolean)
    .join('\n');
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
    'Lấy danh sách work items được giao cho bạn (hoặc theo state/type)',
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
        .describe('Lọc theo loại (VD: Task, Bug, User Story, Feature)'),
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

      const items = await tfs.getWorkItemsByIds(refs.map((r) => r.id));
      const text = items.map(formatWorkItem).join('\n\n');
      return {
        content: [{ type: 'text', text: `## Work Items (${items.length})\n\n${text}` }],
      };
    }
  );

  // ─── Tool: query_work_items ────────────────────────────────────────────────

  server.tool(
    'query_work_items',
    'Tìm kiếm work items bằng WIQL query tùy chỉnh hoặc từ khóa tìm kiếm',
    {
      project: z
        .string()
        .optional()
        .describe('Tên hoặc ID của TFS project (mặc định lấy từ TFS_DEFAULT_PROJECT_ID)'),
      wiql: z.string().optional().describe('WIQL query tùy chỉnh (nếu không nhập sẽ dùng keyword)'),
      keyword: z.string().optional().describe('Từ khóa tìm trong title của work items'),
      state: z.string().optional().describe('Lọc theo state (VD: Active, New, Resolved)'),
      workItemType: z.string().optional().describe('Lọc theo loại (VD: Task, Bug, User Story)'),
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
      const text = items.map(formatWorkItem).join('\n\n');
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
      const wi = await tfs.getWorkItem(id);
      const f = wi.fields;
      const assignedTo =
        typeof f['System.AssignedTo'] === 'object' && f['System.AssignedTo']
          ? (f['System.AssignedTo'] as { displayName: string; uniqueName: string })
          : null;

      const lines = [
        `## Work Item #${wi.id}: ${f['System.Title']}`,
        '',
        `**Type:** ${f['System.WorkItemType']}  |  **State:** ${f['System.State']}`,
        `**Project:** ${f['System.TeamProject'] || 'N/A'}`,
        `**Assigned to:** ${assignedTo ? `${assignedTo.displayName} (${assignedTo.uniqueName})` : (f['System.AssignedTo'] as string) || 'Unassigned'}`,
        `**Area:** ${f['System.AreaPath'] || 'N/A'}`,
        `**Iteration:** ${f['System.IterationPath'] || 'N/A'}`,
        `**Priority:** ${f['Microsoft.VSTS.Common.Priority'] ?? 'N/A'}`,
        `**Tags:** ${f['System.Tags'] || 'None'}`,
        `**Created:** ${new Date(f['System.CreatedDate']).toLocaleString('vi-VN')}`,
        `**Last changed:** ${new Date(f['System.ChangedDate']).toLocaleString('vi-VN')}`,
      ];

      if (f['System.Description']) {
        const cleanDesc = f['System.Description'].replace(/<[^>]+>/g, '').trim();
        lines.push('', '### Description', cleanDesc);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ─── Tool: create_work_item ────────────────────────────────────────────────

  server.tool(
    'create_work_item',
    'Tạo mới một work item trong TFS project',
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
    }) => {
      const proj = resolveProjectId(project);
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

      const wi = await tfs.createWorkItem(proj, workItemType, ops);
      return {
        content: [
          {
            type: 'text',
            text: `✅ Đã tạo ${workItemType} #${wi.id}: **${wi.fields['System.Title']}**\nState: ${wi.fields['System.State']}`,
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
