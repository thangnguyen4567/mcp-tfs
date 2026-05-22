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

export interface WorkItemRelation {
    rel: string;
    url: string;
    attributes: { [key: string]: unknown };
}

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
    relations?: WorkItemRelation[];
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
