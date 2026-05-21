import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TfsClient } from './tfs-client.js';
import { AppConfig } from './config.js';
import { registerWorkItemTools } from './work-item-tools.js';
import { registerPullRequestTools } from './review-pr-tools.js';

export function registerTools(server: McpServer, config: AppConfig): void {
  const tfs = new TfsClient(config.tfs);
  const defaultRepoId = config.tfs.defaultRepoId;
  const defaultProjectId = config.tfs.defaultProjectId;
  const defaultAssignedTo = config.tfs.defaultAssignedTo;

  // ─── Work Item Tools ──────────────────────────────────────────────────────
  registerWorkItemTools(server, tfs, defaultProjectId, defaultAssignedTo);

  // ─── Pull Request Tools ───────────────────────────────────────────────────
  registerPullRequestTools(server, tfs, defaultRepoId, defaultProjectId);
}
