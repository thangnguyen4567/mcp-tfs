#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { appConfig } from './config.js';
import { registerTools } from './tools.js';

async function main() {
  console.error('[MCP TFS Review] Starting server...');
  console.error(`[MCP TFS Review] TFS URL: ${appConfig.tfs.baseUrl}/${appConfig.tfs.collection}`);
  console.error(`[MCP TFS Review] Default Repo: ${appConfig.tfs.defaultRepoId || '(not set)'}`);
  console.error(`[MCP TFS Review] Rules files: ${appConfig.rulesFilePaths.join(', ') || '(none)'}`);

  // Create MCP Server
  const server = new McpServer({
    name: 'mcp-tfs-review',
    version: '1.0.0',
  });

  // Register all tools
  registerTools(server, appConfig);

  // Connect via stdio (standard MCP transport)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP TFS Review] Server ready ✅');
}

main().catch((err) => {
  console.error('[MCP TFS Review] Fatal error:', err);
  process.exit(1);
});
