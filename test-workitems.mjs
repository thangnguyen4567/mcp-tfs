// Test Work Items - chạy: node test-workitems.mjs
// Gọi trực tiếp TFS client để debug các Work Items API
//
// Cách dùng:
//   1. Bỏ comment block test muốn chạy
//   2. Thay PROJECT, WORK_ITEM_ID cho phù hợp với môi trường
//   3. node test-workitems.mjs

import { TfsClient } from "./dist/tfs-client.js";
import { appConfig } from "./dist/config.js";

const tfs = new TfsClient(appConfig.tfs);

// ── Cấu hình: thay giá trị phù hợp với TFS của bạn ──────────────────────────
const PROJECT = appConfig.tfs.defaultProjectId || "HRM"; // Lấy từ TFS_DEFAULT_PROJECT_ID trong .env
const WORK_ITEM_ID = 1945; // ID work item để test get/update
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

// Test W1: List my work items (giao cho @Me — dựa vào TFS_USER_DISPLAY_NAME)
const myName = appConfig.tfs.userDisplayName;
const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType],
              [System.AssignedTo], [System.ChangedDate]
              FROM WorkItems
              WHERE [System.AssignedTo] = '${myName}'
                AND [System.State] <> 'Closed'
              ORDER BY [System.ChangedDate] DESC`;
const refs = await tfs.queryWorkItems(PROJECT, wiql, 50);
console.log(`Tìm thấy ${refs.length} work items của "${myName}"`);
if (refs.length > 0) {
  const items = await tfs.getWorkItemsByIds(refs.map((r) => r.id));
  items.forEach((wi) => {
    const f = wi.fields;
    console.log(
      `  #${wi.id} [${f["System.WorkItemType"]}] ${f["System.Title"]} [${f["System.State"]}] (SP: ${f["Microsoft.VSTS.Scheduling.StoryPoints"] ?? "?"})`,
    );
    console.log(
      `       State: ${f["System.State"]} | Changed: ${f["System.ChangedDate"]}`,
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// Test W2: Query work items — filter Active Bugs
// const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
//               FROM WorkItems
//               WHERE [System.WorkItemType] = 'Bug'
//                 AND [System.State] = 'Active'
//               ORDER BY [Microsoft.VSTS.Common.Priority] ASC`;
// const refs = await tfs.queryWorkItems(PROJECT, wiql, 10);
// console.log(`Active Bugs: ${refs.length}`);
// if (refs.length > 0) {
//   const items = await tfs.getWorkItemsByIds(refs.map((r) => r.id));
//   items.forEach((wi) => {
//     const f = wi.fields;
//     const assigned =
//       typeof f["System.AssignedTo"] === "object"
//         ? f["System.AssignedTo"]?.displayName
//         : f["System.AssignedTo"] || "Unassigned";
//     console.log(
//       `  #${wi.id} [P${f["Microsoft.VSTS.Common.Priority"] ?? "?"}] ${f["System.Title"]}`,
//     );
//     console.log(`       Assigned: ${assigned}`);
//   });
// }

// ─────────────────────────────────────────────────────────────────────────────

// Test W4: Get chi tiết 1 work item
// const wi = await tfs.getWorkItem(WORK_ITEM_ID);
// console.log("Work Item chi tiết:");
// console.log(JSON.stringify(wi.fields, null, 2));

// ─────────────────────────────────────────────────────────────────────────────

// Test W5: Get nhiều work items cùng lúc
// const ids = [WORK_ITEM_ID, WORK_ITEM_ID + 1, WORK_ITEM_ID + 2];
// const items = await tfs.getWorkItemsByIds(ids);
// console.log(`Lấy ${items.length}/${ids.length} work items:`);
// items.forEach((wi) => {
//   console.log(`  #${wi.id}: ${wi.fields["System.Title"]} [${wi.fields["System.State"]}]`);
// });

// ─────────────────────────────────────────────────────────────────────────────

// Test W6: Tạo mới Task
// const newWi = await tfs.createWorkItem(PROJECT, "Task", [
//   { op: "add", path: "/fields/System.Title", value: "[TEST] Task tạo từ MCP script" },
//   { op: "add", path: "/fields/System.Description", value: "Được tạo tự động bởi test-workitems.mjs" },
//   { op: "add", path: "/fields/System.AssignedTo", value: appConfig.tfs.userDisplayName },
//   { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: 2 },
//   { op: "add", path: "/fields/System.Tags", value: "test; mcp-script" },
// ]);
// console.log(`✅ Tạo thành công: #${newWi.id} — ${newWi.fields["System.Title"]}`);
// console.log(`   State: ${newWi.fields["System.State"]}`);
// console.log(`   Area: ${newWi.fields["System.AreaPath"]}`);

// ─────────────────────────────────────────────────────────────────────────────

// Test W7: Tạo mới Bug
// const newBug = await tfs.createWorkItem(PROJECT, "Bug", [
//   { op: "add", path: "/fields/System.Title", value: "[TEST] Bug tạo từ MCP script" },
//   { op: "add", path: "/fields/System.Description", value: "<b>Steps to reproduce:</b><br>1. Bước 1<br>2. Bước 2" },
//   { op: "add", path: "/fields/System.AssignedTo", value: appConfig.tfs.userDisplayName },
//   { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: 1 },
//   { op: "add", path: "/fields/Microsoft.VSTS.Common.Severity", value: "2 - High" },
// ]);
// console.log(`✅ Tạo Bug: #${newBug.id} — ${newBug.fields["System.Title"]}`);

// ─────────────────────────────────────────────────────────────────────────────

// Test W8: Update state work item
// const updated = await tfs.updateWorkItem(WORK_ITEM_ID, [
//   { op: "replace", path: "/fields/System.State", value: "Active" },
//   { op: "add", path: "/fields/System.History", value: "Chuyển sang Active bởi test script" },
// ]);
// console.log(`✅ Update #${updated.id}: State = ${updated.fields["System.State"]}`);

// ─────────────────────────────────────────────────────────────────────────────

// Test W9: Update nhiều field cùng lúc
// const updated = await tfs.updateWorkItem(WORK_ITEM_ID, [
//   { op: "replace", path: "/fields/System.Title", value: "[UPDATED] Tiêu đề mới từ script" },
//   { op: "replace", path: "/fields/Microsoft.VSTS.Common.Priority", value: 1 },
//   { op: "replace", path: "/fields/System.Tags", value: "urgent; sprint-5" },
//   { op: "add",     path: "/fields/System.History", value: "Cập nhật priority và tags qua test script" },
// ]);
// console.log(`✅ Update #${updated.id}:`);
// console.log(`   Title: ${updated.fields["System.Title"]}`);
// console.log(`   Priority: ${updated.fields["Microsoft.VSTS.Common.Priority"]}`);
// console.log(`   Tags: ${updated.fields["System.Tags"]}`);

// ─────────────────────────────────────────────────────────────────────────────

// Test W10: Close / Resolve work item
// const closed = await tfs.updateWorkItem(WORK_ITEM_ID, [
//   { op: "replace", path: "/fields/System.State", value: "Closed" },
//   { op: "add",     path: "/fields/System.History", value: "Đóng qua test script — đã hoàn thành" },
// ]);
// console.log(`✅ Closed #${closed.id}: State = ${closed.fields["System.State"]}`);

// ─────────────────────────────────────────────────────────────────────────────
// Chạy: node test-workitems.mjs
