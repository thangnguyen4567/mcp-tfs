// Test script - chạy: node test.mjs
// Gọi trực tiếp TFS client để debug từng API

import { TfsClient } from "./dist/tfs-client.js";
import { appConfig } from "./dist/config.js";
import * as Diff from "diff";

const tfs = new TfsClient(appConfig.tfs);
const repoId = appConfig.tfs.defaultRepoId;

// console.log("Config:", {
//   baseUrl: appConfig.tfs.baseUrl,
//   collection: appConfig.tfs.collection,
//   userId: appConfig.tfs.userId,
//   repoId,
//   rulesFiles: appConfig.rulesFilePaths,
// });
// console.log("---");

// ── Chọn 1 trong các test dưới, bỏ comment để chạy ──

// Test 1: List repos
// const repos = await tfs.listRepositories();
// console.log(
//   "Repos:",
//   repos.map((r) => `${r.id} - ${r.name}`),
// );

// Test 2: List PRs active
const prs = await tfs.listPullRequests(repoId, "active", 5);
console.log(
  "PRs:",
  prs.map((p) => `#${p.pullRequestId} - ${p.title}`),
);

// Test 3: Get PR detail
// const pr = await tfs.getPullRequest(repoId, 327);
// console.log("PR:", JSON.stringify(pr, null, 2));

// Test 4: Get PR changes
// const changes = await tfs.getPrChanges(repoId, 327);
// console.log(
//   "Files:",
//   changes.changeEntries.map((c) => c.item.path),
// );

// Test 5: Get file content
// const content = await tfs.getFileContent(
//   repoId,
//   "/apps/shell/assets/i18n/VN.json",
// );
// console.log("Content:", content.substring(0, 500));

// Test 6: Get threads
// const threads = await tfs.getPrThreads(repoId, 327);
// console.log("Threads:", threads.length);

// Test 7: Create comment (thay PR id và file path)
const thread = await tfs.createThread(repoId, 327, {
  comments: [
    { parentCommentId: 0, content: "Test comment từ MCP", commentType: 1 },
  ],
  status: 1,
  threadContext: { filePath: "/apps/shell/assets/i18n/VN.json" },
});
console.log("Created thread:", thread.id);

// Test 8: Get file diff line-by-line
// const PR_ID = 327;
// const FILE_PATH = "/apps/shell/assets/i18n/VN.json";
// const fileDiff = await tfs.getFileDiff(repoId, PR_ID, FILE_PATH);

// const patch = Diff.createPatch(
//   fileDiff.filePath,
//   fileDiff.beforeContent,
//   fileDiff.afterContent,
//   `target (${fileDiff.targetCommit.substring(0, 8)})`,
//   `source  (${fileDiff.sourceCommit.substring(0, 8)})`,
//   { context: 3 },
// );

// const parsed = Diff.parsePatch(patch);

// const hunk = parsed[0];
// if (!hunk || hunk.hunks.length === 0) {
//   console.log("✅ Không có thay đổi nào.");
// } else {
//   let added = 0,
//     removed = 0;
//   for (const h of hunk.hunks) {
//     console.log(
//       `\n@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
//     );
//     let oldLine = h.oldStart,
//       newLine = h.newStart;
//     for (const line of h.lines) {
//       if (line.startsWith("+")) {
//         console.log(`  [+${String(newLine).padStart(4)}] ${line}`);
//         newLine++;
//         added++;
//       } else if (line.startsWith("-")) {
//         console.log(`  [-${String(oldLine).padStart(4)}] ${line}`);
//         oldLine++;
//         removed++;
//       } else {
//         console.log(`  [ ${String(newLine).padStart(4)}] ${line}`);
//         oldLine++;
//         newLine++;
//       }
//     }
//   }
//   console.log(`\nTổng: +${added} dòng thêm, -${removed} dòng xóa`);
// }
