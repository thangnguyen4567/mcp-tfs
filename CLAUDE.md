# MCP TFS Review Server

## Overview

An MCP (Model Context Protocol) server that integrates with TFS (Team Foundation Server) to provide AI-powered code review and work item management via stdio transport. Built with TypeScript targeting Node.js 18+.

## Architecture

```
src/
├── index.ts            # Entry point - creates MCP server, connects stdio transport
├── config.ts           # Loads .env config (TFS connection, auth, rules paths)
├── tfs-client.ts       # TFS REST API client (repos, PRs, work items, threads, votes)
├── tools.ts            # Tool registry - registers all MCP tools
├── review-pr-tools.ts  # PR tools: list repos, list PRs, get changes/diff/threads, create comments, vote
├── work-item-tools.ts  # Work item tools: list/query/get/create/update work items, list projects
├── review-engine.ts    # Review helpers: load rules files, detect file type, build review prompts, parse output
├── pr-watcher.ts       # Standalone background poller - detects new PRs and sends email notifications
├── email-service.ts    # Email sending via nodemailer SMTP
└── word-service.ts     # Read .docx via mammoth → HTML, sanitize HTML for TFS Description
```

## Key Commands

```bash
npm run build       # Compile TypeScript (tsc)
npm run start       # Run compiled server (node dist/index.js)
npm run dev         # Run with ts-node (dev mode)
npm run watch       # Watch mode compilation
npm run watch-prs   # Run PR watcher (polls TFS, sends email on new PRs)
```

## Configuration

All config via `.env` file (see `.env.example`):
- `TFS_BASE_URL` - TFS server URL (required)
- `TFS_COLLECTION` - TFS collection name (default: DefaultCollection)
- `TFS_PAT` or `TFS_USERNAME`+`TFS_PASSWORD` - Authentication
- `TFS_USER_ID` - Current user GUID (for voting)
- `TFS_DEFAULT_REPO_ID` / `TFS_DEFAULT_PROJECT_ID` - Defaults for tools
- `TFS_DEFAULT_ASSIGNED_TO` - Default assignee for new work items
- `RULES_FILE_PATHS` - Comma-separated paths to code review rule files
- `SPRINT_NAME` - Current sprint name (shown in tool descriptions)
- `POLL_INTERVAL_MS` - PR watcher poll interval in ms (default: 300000 = 5 min)
- `SEEN_PRS_FILE` - Path to store seen PR IDs (default: ./data/seen-prs.json)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` - SMTP server settings
- `SMTP_USER` / `SMTP_PASS` - SMTP authentication
- `EMAIL_TO` - Notification recipient email
- `EMAIL_FROM` - Sender display name/email

## MCP Tools Exposed

**Pull Request Tools:** `list_repositories`, `list_pull_requests`, `get_pr_changes`, `get_pr_file_diff`, `get_pr_threads`, `create_review_comment`, `vote_pull_request`

**Work Item Tools:** `list_projects`, `list_my_work_items`, `query_work_items`, `get_work_item`, `create_work_item`, `update_work_item`, `read_word_content`, `update_work_item_description`, `insert_word_to_description`

## Tech Stack

- TypeScript (ESM modules, `"type": "module"`)
- `@modelcontextprotocol/sdk` - MCP server framework
- `axios` - HTTP client for TFS REST API (v3.0 / v2.0)
- `zod` - Tool parameter validation
- `diff` - Unified diff generation for PR file comparisons
- `mammoth` - Convert Word `.docx` to HTML (for inserting tables into work item Description)
- `nodemailer` - SMTP email sending (PR watcher notifications)
- `dotenv` - Environment config

## Key Design Decisions

- TFS API version 3.0 for Git APIs, 2.0 for Work Item APIs
- Custom fields: `VNR.Agile.Deadline`, `VNR.Agile.AITime`, `VNR.Agile.BizPoint`
- Tasks/Bugs require a parent User Story (`parentId` enforced)
- File type detection classifies changes as frontend/backend/other for review grouping
- Review comments use severity levels: CRITICAL, WARNING, SUGGESTION, INFO
- Vietnamese language used in tool descriptions and output formatting
- Word→TFS Description: TFS web editor has no table insert, but `System.Description` stores raw HTML. `read_word_content` converts `.docx` to HTML (mammoth) and sanitizes it (strip `class`, inject `border`/padding on `<table>`/`<td>`/`<th>`) so tables render; `update_work_item_description` PATCHes the HTML (overwrite) into `System.Description`
- Long Word files: the 2-tool flow (read→update) routes HTML through the AI context, which can truncate large documents. `insert_word_to_description` does read→sanitize→PATCH entirely server-side (HTML never enters AI context) and verifies after write by re-reading the field and comparing plain-text length (`verifyContentLength` in `word-service.ts`); reports an error if stored content is shorter than ~95% of sent content
