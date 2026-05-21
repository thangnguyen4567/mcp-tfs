# TFS Code Review MCP Server

## Cấu hình môi trường (.env)

Tạo file `.env` trong thư mục `mcp-tfs-review/` (copy từ `.env.example`):

```env
TFS_BASE_URL=http://hcm-srv-tfscore01:8080/tfs
TFS_COLLECTION=DefaultCollection

# Authentication (chọn 1 trong 2)
TFS_PAT=your_personal_access_token_here
# hoặc Basic Auth
TFS_USERNAME=thang.nguyen
TFS_PASSWORD=your_password

# User Info
TFS_USER_ID=49caf920-4f92-4c5d-812a-be5f3a678e0d
TFS_USER_DISPLAY_NAME=thang.nguyen

# Default Repository
TFS_DEFAULT_REPO_ID=832ba575-ddae-4444-abbd-85ab607f556e

# Rules file paths (tách bằng dấu phẩy nếu nhiều file)
RULES_FILE_PATHS=E:/HRM/ReviewPR_FE/rule_feat_FE
```

## Cài đặt

```bash
cd mcp-tfs-review
npm install
npm run build
```

## Chạy MCP Server

```bash
npm start
```

## Cấu hình Claude Desktop

Thêm vào `claude_desktop_config.json` (thường ở `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "tfs-review": {
      "command": "node",
      "args": ["E:/HRM/ReviewPR_FE/mcp-tfs-review/dist/index.js"],
      "cwd": "E:/HRM/ReviewPR_FE/mcp-tfs-review"
    }
  }
}
```

> Config được đọc tự động từ file `.env` — không cần truyền `env` vào đây.

## Debug / Test

Dùng script `test.mjs` để gọi trực tiếp TFS API:

```bash
node test.mjs
```

Bỏ comment block test tương ứng trong file, thay `PR_ID` và `FILE_PATH` phù hợp rồi chạy.

Hoặc dùng MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Mở browser tại `http://localhost:5173` để gọi tool qua UI.

## Tools có sẵn

### Repository

| Tool                | Mô tả                                 |
| ------------------- | ------------------------------------- |
| `list_repositories` | Liệt kê tất cả repos trong collection |
| `list_projects`     | Liệt kê tất cả projects trong TFS collection |

### Pull Request

| Tool                 | Mô tả                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `list_pull_requests` | Danh sách PRs — filter theo `status`: active / completed / abandoned / all |
| `get_pull_request`   | Chi tiết 1 PR kèm reviewers và vote status                                 |
| `get_pr_commits`     | Danh sách commits trong PR                                                 |
| `get_pr_changes`     | Danh sách files thay đổi (phân loại FE / BE / other)                       |

### File Content & Diff

| Tool               | Mô tả                                                     |
| ------------------ | --------------------------------------------------------- |
| `get_file_content` | Nội dung thực của file tại 1 commit                       |
| `get_pr_file_diff` | Diff line-by-line của 1 file trong PR (so sánh trước/sau) |

### Comments & Vote

| Tool                    | Mô tả                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `get_pr_threads`        | Tất cả comment threads trong PR                                                             |
| `create_review_comment` | Tạo comment review trên file / dòng cụ thể hoặc general                                     |
| `vote_pull_request`     | Vote PR: `approve` / `approve_with_suggestions` / `waiting_for_author` / `reject` / `reset` |

### Auto Review

| Tool                  | Mô tả                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `review_pull_request` | **Tự động review toàn bộ PR** theo rules từ file cấu hình, có thể auto-post comments lên TFS |

### Work Items

| Tool                  | Mô tả                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `list_my_work_items`  | Danh sách work items được giao cho bạn (`@Me`) hoặc người khác, filter theo state / type      |
| `query_work_items`    | Tìm kiếm work items bằng từ khóa hoặc WIQL query tùy chỉnh                                   |
| `get_work_item`       | Chi tiết đầy đủ của 1 work item (description, area, iteration, priority, tags, …)            |
| `create_work_item`    | Tạo mới work item (Task / Bug / User Story / Feature / Epic / Issue)                          |
| `update_work_item`    | Cập nhật state, tiêu đề, người được giao, iteration, tags, thêm comment history              |

#### Ví dụ sử dụng Work Items

```
# Xem task của tôi đang Active
list_my_work_items(project="HRM", state="Active")

# Tìm bug theo từ khóa
query_work_items(project="HRM", keyword="login", workItemType="Bug")

# Xem chi tiết work item #1234
get_work_item(id=1234)

# Tạo task mới
create_work_item(
  project="HRM",
  workItemType="Task",
  title="Fix login bug",
  assignedTo="thang.nguyen@company.com",
  priority=1
)

# Đổi state sang Resolved + thêm note
update_work_item(id=1234, state="Resolved", comment="Fixed in PR #99")
```

## Cấu trúc project

```
src/
├── index.ts          ← Entry point MCP Server
├── config.ts         ← Load config từ .env
├── tfs-client.ts     ← TFS Git REST API client
├── tools.ts          ← Đăng ký tất cả MCP tools
└── review-engine.ts  ← Engine đọc rules, build review prompts
```

## Mở rộng sau này

- **Thêm rules BE**: điền thêm path file rules vào `RULES_FILE_PATHS` (cách nhau bằng dấu phẩy)
- **Work Item relations**: thêm API liên kết work items (link PR → Task)
- **Auto approve**: sử dụng `vote_pull_request` tool sau khi review xong
- **Notification**: webhook khi work item thay đổi state
