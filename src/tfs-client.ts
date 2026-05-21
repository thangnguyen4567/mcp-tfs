import axios, { AxiosInstance } from 'axios';
import { TfsConfig } from './config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  createdBy: { displayName: string; id: string };
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus: string;
  isDraft: boolean;
  reviewers: Reviewer[];
  url: string;
  lastMergeSourceCommit?: { commitId: string };
  lastMergeTargetCommit?: { commitId: string };
}

export interface Reviewer {
  displayName: string;
  id: string;
  vote: number;
  isRequired: boolean;
}

export interface Commit {
  commitId: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  comment: string;
  url: string;
}

export interface PrIteration {
  id: number;
  createdDate: string;
  updatedDate: string;
  description: string;
}

export interface FileChange {
  changeType: string;
  item: {
    objectId: string;
    originalObjectId: string;
    gitObjectType: string;
    commitId: string;
    path: string;
    isFolder: boolean;
    url: string;
  };
}

export interface PrChanges {
  changeEntries: FileChange[];
}

export interface CommentThread {
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  comments: Comment[];
  status: string;
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number; offset: number };
    rightFileEnd?: { line: number; offset: number };
  };
  isDeleted: boolean;
}

export interface Comment {
  id: number;
  parentCommentId: number;
  content: string;
  commentType: number;
  publishedDate: string;
  author: { displayName: string; id: string };
  isDeleted: boolean;
}

export interface Repository {
  id: string;
  name: string;
  url: string;
  project: { id: string; name: string };
  defaultBranch: string;
  size: number;
}

export interface CreateThreadRequest {
  comments: Array<{
    parentCommentId: number;
    content: string;
    commentType: number;
  }>;
  status: number;
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number; offset: number };
    rightFileEnd?: { line: number; offset: number };
  };
}

export type VoteValue = 10 | 5 | 0 | -5 | -10;

// ─── Work Items ───────────────────────────────────────────────────────────────

export interface WorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: string | { displayName: string; uniqueName: string };
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'System.Description'?: string;
    'System.AreaPath'?: string;
    'System.IterationPath'?: string;
    'System.TeamProject'?: string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'Microsoft.VSTS.Common.Severity'?: string;
    'Microsoft.VSTS.Common.ResolvedDate'?: string;
    'System.Tags'?: string;
    [key: string]: unknown;
  };
  url: string;
}

export interface WorkItemReference {
  id: number;
  url: string;
}

export interface WorkItemQueryResult {
  workItems: WorkItemReference[];
  columns: Array<{ referenceName: string; name: string; url: string }>;
}

export interface CreateWorkItemField {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value: unknown;
}

export interface FileDiff {
  filePath: string;
  beforeContent: string;
  afterContent: string;
  sourceCommit: string;
  targetCommit: string;
}

// ─── TFS Client ───────────────────────────────────────────────────────────────

export class TfsClient {
  private http: AxiosInstance;
  private config: TfsConfig;

  constructor(config: TfsConfig) {
    this.config = config;

    // Build auth header
    let authHeader: string;
    if (config.pat) {
      const token = Buffer.from(`:${config.pat}`).toString('base64');
      authHeader = `Basic ${token}`;
    } else if (config.username && config.password) {
      const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      authHeader = `Basic ${token}`;
    } else {
      authHeader = '';
    }

    this.http = axios.create({
      baseURL: `${config.baseUrl}/${config.collection}`,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      params: { 'api-version': '3.0' },
      timeout: 30000,
    });

    // Response interceptor for error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        throw new Error(`TFS API Error [${status}]: ${message}`);
      }
    );
  }

  private repoPath(repositoryId: string): string {
    return `/_apis/git/repositories/${repositoryId}`;
  }

  // ─── Repositories ────────────────────────────────────────────────────────

  async listRepositories(): Promise<Repository[]> {
    const res = await this.http.get('/_apis/git/repositories');
    return res.data.value as Repository[];
  }

  async getRepository(repositoryId: string): Promise<Repository> {
    const res = await this.http.get(this.repoPath(repositoryId));
    return res.data as Repository;
  }

  // ─── Pull Requests ───────────────────────────────────────────────────────

  async listPullRequests(
    repositoryId: string,
    status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
    top = 50,
    skip = 0
  ): Promise<PullRequest[]> {
    const res = await this.http.get(`${this.repoPath(repositoryId)}/pullrequests`, {
      params: {
        'searchCriteria.status': status,
        '$top': top,
        '$skip': skip,
      },
    });
    return res.data.value as PullRequest[];
  }

  async getPullRequest(repositoryId: string, pullRequestId: number): Promise<PullRequest> {
    const res = await this.http.get(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}`
    );
    return res.data as PullRequest;
  }

  // ─── Commits ─────────────────────────────────────────────────────────────

  async getPrCommits(repositoryId: string, pullRequestId: number): Promise<Commit[]> {
    const res = await this.http.get(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/commits`
    );
    return res.data.value as Commit[];
  }

  // ─── File Diff ───────────────────────────────────────────────────────────

  /**
   * Lấy diff của 1 file trong PR: so sánh version trước và sau.
   * Trả về thông tin từng line: added / removed / unchanged kèm số dòng.
   */
  async getFileDiff(
    repositoryId: string,
    pullRequestId: number,
    filePath: string,
  ): Promise<FileDiff> {
    // Lấy PR để biết source/target commit
    const pr = await this.getPullRequest(repositoryId, pullRequestId);
    const sourceCommit = pr.lastMergeSourceCommit?.commitId;
    const targetCommit = pr.lastMergeTargetCommit?.commitId;

    let beforeContent = '';
    let afterContent = '';

    // Lấy nội dung file TRƯỚC khi thay đổi (target branch)
    if (targetCommit) {
      try {
        beforeContent = await this.getFileContent(repositoryId, filePath, targetCommit);
      } catch {
        beforeContent = ''; // File mới (chưa tồn tại ở target)
      }
    }

    // Lấy nội dung file SAU khi thay đổi (source branch)
    if (sourceCommit) {
      try {
        afterContent = await this.getFileContent(repositoryId, filePath, sourceCommit);
      } catch {
        afterContent = ''; // File bị xóa
      }
    }

    return {
      filePath,
      beforeContent,
      afterContent,
      sourceCommit: sourceCommit ?? '',
      targetCommit: targetCommit ?? '',
    };
  }

  // ─── Iterations & Changes ────────────────────────────────────────────────

  async getPrIterations(repositoryId: string, pullRequestId: number): Promise<PrIteration[]> {
    const res = await this.http.get(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/iterations`
    );
    return res.data.value as PrIteration[];
  }

  async getPrChanges(
    repositoryId: string,
    pullRequestId: number,
    iterationId?: number
  ): Promise<PrChanges> {
    let iterId = iterationId;
    if (!iterId) {
      const iterations = await this.getPrIterations(repositoryId, pullRequestId);
      if (iterations.length === 0) throw new Error('No iterations found for this PR');
      iterId = iterations[iterations.length - 1].id;
    }

    const res = await this.http.get(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/iterations/${iterId}/changes`
    );
    return res.data as PrChanges;
  }

  // ─── File Content ────────────────────────────────────────────────────────

  async getFileContent(
    repositoryId: string,
    filePath: string,
    commitId?: string,
    versionType: 'commit' | 'branch' | 'tag' = 'commit'
  ): Promise<string> {
    const params: Record<string, string> = {
      path: filePath,
      '$format': 'text',          // Bắt buộc: trả về nội dung thực, không phải JSON metadata
    };

    if (commitId) {
      params['versionDescriptor.version'] = commitId;
      params['versionDescriptor.versionType'] = versionType;
    }

    const res = await this.http.get(`${this.repoPath(repositoryId)}/items`, {
      params,
      responseType: 'text',
      headers: { Accept: 'text/plain' },
    });
    return res.data as string;
  }

  // ─── Threads & Comments ──────────────────────────────────────────────────

  async getPrThreads(repositoryId: string, pullRequestId: number): Promise<CommentThread[]> {
    const res = await this.http.get(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/threads`
    );
    return res.data.value as CommentThread[];
  }

  async createThread(
    repositoryId: string,
    pullRequestId: number,
    request: CreateThreadRequest
  ): Promise<CommentThread> {
    const res = await this.http.post(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/threads`,
      request
    );
    return res.data as CommentThread;
  }

  async replyToThread(
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    content: string
  ): Promise<Comment> {
    const res = await this.http.post(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/threads/${threadId}/comments`,
      { parentCommentId: 1, content, commentType: 1 }
    );
    return res.data as Comment;
  }

  // ─── Vote ────────────────────────────────────────────────────────────────

  async votePullRequest(
    repositoryId: string,
    pullRequestId: number,
    reviewerId: string,
    vote: VoteValue
  ): Promise<Reviewer> {
    const res = await this.http.put(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}/reviewers/${reviewerId}`,
      { vote }
    );
    return res.data as Reviewer;
  }

  // ─── Work Items ──────────────────────────────────────────────────────────

  /**
   * Lấy danh sách work items được giao cho user hiện tại (hoặc theo WIQL query).
   */
  async queryWorkItems(
    project: string,
    wiql: string,
    top = 50
  ): Promise<WorkItemReference[]> {
    const res = await this.http.post(
      `/${encodeURIComponent(project)}/_apis/wit/wiql`,
      { query: wiql },
      { params: { '$top': top, 'api-version': '2.0' } }
    );
    const result = res.data as WorkItemQueryResult;
    return result.workItems || [];
  }

  /**
   * Lấy chi tiết nhiều work items theo IDs.
   */
  async getWorkItemsByIds(ids: number[], fields?: string[]): Promise<WorkItem[]> {
    if (ids.length === 0) return [];
    const defaultFields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.WorkItemType',
      'System.AssignedTo',
      'System.CreatedDate',
      'System.ChangedDate',
      'System.Description',
      'System.AreaPath',
      'System.IterationPath',
      'System.TeamProject',
      'Microsoft.VSTS.Common.Priority',
      "Microsoft.VSTS.Scheduling.StoryPoints",
      'System.Tags',
    ];
    const res = await this.http.get('/_apis/wit/workitems', {
      params: {
        ids: ids.slice(0, 200).join(','),
        fields: (fields || defaultFields).join(','),
        'api-version': '2.0',
      },
    });
    return (res.data.value || []) as WorkItem[];
  }

  /**
   * Lấy chi tiết 1 work item theo ID.
   */
  async getWorkItem(id: number, fields?: string[]): Promise<WorkItem> {
    const items = await this.getWorkItemsByIds([id], fields);
    if (items.length === 0) throw new Error(`Work item #${id} not found`);
    return items[0];
  }

  /**
   * Tạo mới work item.
   */
  async createWorkItem(
    project: string,
    type: string,
    patchOps: CreateWorkItemField[]
  ): Promise<WorkItem> {
    const res = await this.http.post(
      `/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}`,
      patchOps,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
        params: { 'api-version': '2.0' },
      }
    );
    return res.data as WorkItem;
  }

  /**
   * Cập nhật work item.
   */
  async updateWorkItem(id: number, patchOps: CreateWorkItemField[]): Promise<WorkItem> {
    const res = await this.http.patch(
      `/_apis/wit/workitems/${id}`,
      patchOps,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
        params: { 'api-version': '2.0' },
      }
    );
    return res.data as WorkItem;
  }

  /**
   * Lấy danh sách projects trong collection.
   */
  async listProjects(): Promise<Array<{ id: string; name: string; state: string }>> {
    const res = await this.http.get('/_apis/projects', { params: { 'api-version': '2.0' } });
    return res.data.value || [];
  }

  // ─── Update PR Status ────────────────────────────────────────────────────

  async updatePrStatus(
    repositoryId: string,
    pullRequestId: number,
    status: 'abandoned' | 'completed' | 'active',
    lastMergeSourceCommit?: { commitId: string }
  ): Promise<PullRequest> {
    const body: Record<string, unknown> = { status };
    if (status === 'completed' && lastMergeSourceCommit) {
      body['lastMergeSourceCommit'] = lastMergeSourceCommit;
    }
    const res = await this.http.patch(
      `${this.repoPath(repositoryId)}/pullrequests/${pullRequestId}`,
      body
    );
    return res.data as PullRequest;
  }
}
