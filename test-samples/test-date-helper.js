// 日期工具回归测试：教学周计算、今天信息、逐日日期
// 运行：node test-samples/test-date-helper.js
const dh = require("../miniprogram/utils/dateHelper");

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `（实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}）`}`);
  if (!ok) failed++;
}

console.log("=== 星期与教学周 ===");
check("2025-09-01 是周一", dh.getWeekdayIndex(dh.parseDate("2025-09-01")), 1);
check("开学当天算第 1 周", dh.getRealWeek("2025-09-01", new Date(2025, 8, 1, 10, 0)), 1);
check("开学后第 8 天算第 2 周", dh.getRealWeek("2025-09-01", new Date(2025, 8, 8, 10, 0)), 2);
check("开学前一周算 0（未开学）", dh.getRealWeek("2025-09-01", new Date(2025, 7, 25, 10, 0)), 0);
check("超出总周数时截断到 18", dh.getClampedWeek("2025-09-01", 18, new Date(2026, 0, 5, 10, 0)), 18);
check("totalWeeks 缺失时默认 18", dh.getClampedWeek("2025-09-01", undefined, new Date(2026, 0, 5, 10, 0)), 18);

console.log("\n=== 今天信息 ===");
const today = dh.getToday(new Date(2026, 9, 18, 9, 30));
check("星期名", today.name, "周日");
check("月/日", today.monthDay, "10/18");
check("展示文案", today.label, "今天 周日 · 10/18");

console.log("\n=== 逐日日期 ===");
const week1 = dh.getWeekDates("2025-09-01", 1, 7);
check("第 1 周天数", week1.length, 7);
check("第 1 周首日", week1[0].monthDay, "9/1");
check("第 1 周末日", week1[6].monthDay, "9/7");
const week2 = dh.getWeekDates("2025-09-01", 2, 5);
check("第 2 周工作日天数", week2.length, 5);
check("第 2 周首日", week2[0].monthDay, "9/8");
check("第 2 周末日", week2[4].monthDay, "9/12");
check("非法日期返回空数组", dh.getWeekDates("", 1, 7), []);

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAIL (" + failed + ")"}`);
process.exit(failed === 0 ? 0 : 1);
