// 时间冲突检测回归测试
// 运行：node test-samples/test-course-conflict.js
const { findConflicts, formatConflicts } = require("../miniprogram/utils/courseConflict");
const weekHelper = require("../miniprogram/utils/weekHelper");

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `（实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}）`}`);
  if (!ok) failed++;
}

function mkCourse(name, slots, extra) {
  return Object.assign(
    {
      _id: name,
      name,
      teacher: "",
      room: "",
      timetableId: "t1",
      slots: slots.map((s) => ({ day: s[0], startSlot: s[1], endSlot: s[2] })),
      startWeek: 1,
      endWeek: 16,
      weekType: "all",
      weeks: [],
    },
    extra || {}
  );
}

const physics = mkCourse("大学物理", [[3, 3, 4]]);
const outline = mkCourse("线性代数", [[3, 4, 5]], { endWeek: 8 });
const pe = mkCourse("体育", [[3, 3, 4]], { startWeek: 1, endWeek: 17, weekType: "odd" });
const english = mkCourse("大学英语", [[4, 1, 2]]);

console.log("=== 场景 1：完全重叠 ===");
const r1 = findConflicts([physics], mkCourse("作业课", [[3, 3, 4]]));
check("冲突数量", r1.length, 1);
check("冲突课程", r1[0] && r1[0].course.name, "大学物理");
check("共同周次", r1[0] && r1[0].weeks.length, 16);
check("文案", formatConflicts(r1), "与《大学物理》周三 第3-4节，第1-16周冲突");

console.log("\n=== 场景 2：周次不重叠 ===");
check("1-16 周 vs 17-18 周", findConflicts([physics], mkCourse("作业课", [[3, 3, 4]], { startWeek: 17, endWeek: 18 })).length, 0);

console.log("\n=== 场景 3：单周课 vs 双周课 ===");
check("单周已有 + 双周候选", findConflicts([pe], mkCourse("作业课", [[3, 3, 4]], { weeks: ["2", "4", "6"] })).length, 0);
check("单周已有 + 单周候选", findConflicts([pe], mkCourse("作业课", [[3, 3, 4]], { weeks: ["3"] })).length, 1);

console.log("\n=== 场景 4：节次部分重叠 ===");
const r4 = findConflicts([physics], mkCourse("作业课", [[3, 4, 5]]));
check("3-4 vs 4-5 冲突", r4.length, 1);
check("冲突节次取候选", formatConflicts(r4), "与《大学物理》周三 第4-5节，第1-16周冲突");
check("3-4 vs 5-6 不冲突", findConflicts([physics], mkCourse("作业课", [[3, 5, 6]])).length, 0);
check("3-4 vs 2-3 冲突（共享第 3 节）", findConflicts([physics], mkCourse("作业课", [[3, 2, 3]])).length, 1);
check("3-4 vs 2-4 冲突", findConflicts([physics], mkCourse("作业课", [[3, 2, 4]])).length, 1);

console.log("\n=== 场景 5：不同天 / 不同课表 ===");
check("周三 vs 周四", findConflicts([physics], mkCourse("作业课", [[4, 3, 4]])).length, 0);
check("不同 timetableId", findConflicts([physics], mkCourse("作业课", [[3, 3, 4]], { timetableId: "t2" })).length, 0);

console.log("\n=== 场景 6：编辑自己 ===");
const self = mkCourse("大学物理", [[3, 3, 4]]);
check("编辑自己不冲突", findConflicts([self], Object.assign({}, self)).length, 0);

console.log("\n=== 场景 7：多门课同时冲突 + 文案截断 ===");
const many = [
  mkCourse("课A", [[1, 1, 2]]),
  mkCourse("课B", [[1, 1, 2]]),
  mkCourse("课C", [[1, 1, 2]]),
  mkCourse("课D", [[1, 1, 2]]),
];
const r7 = findConflicts(many, mkCourse("新课", [[1, 1, 2]]));
check("冲突数量", r7.length, 4);
const text7 = formatConflicts(r7);
check("最多列 3 条 + 汇总", text7.split("\n").length, 4);
check("末尾是汇总行", text7.split("\n")[3], "另有 1 门课存在冲突");

console.log("\n=== 场景 8：多时间段候选 ===");
const multi = mkCourse("作业课", [[3, 3, 4], [4, 1, 2]]);
check("命中已有课程（周三 + 周四英语）", findConflicts([physics, english], multi).length, 2);

console.log("\n=== 场景 9：周次文案 ===");
check("连续周", weekHelper.formatWeeks([1, 2, 3, 4, 5, 6]), "第1-6周");
check("断开周", weekHelper.formatWeeks([1, 2, 3, 5]), "第1-3周、第5周");
check("两连周", weekHelper.formatWeeks([1, 2]), "第1-2周");
check("单周压缩", weekHelper.formatWeeks([1, 3, 5, 7, 9]), "第1-9周（单周）");
check("双周压缩", weekHelper.formatWeeks([2, 4, 6, 8]), "第2-8周（双周）");
check("空数组", weekHelper.formatWeeks([]), "无");

console.log("\n=== 场景 10：候选只有 startWeek/endWeek 也无碍 ===");
check(
  "无 weeks 数组时按起止周展开",
  findConflicts([physics], mkCourse("作业课", [[3, 3, 4]], { startWeek: 3, endWeek: 5 }))[0].weeks.join(","),
  "3,4,5"
);

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAIL (" + failed + ")"}`);
process.exit(failed === 0 ? 0 : 1);
