// 上课提醒回归测试：下一节课 / 周次连续段 / 日历事件生成
// 运行：node test-samples/test-class-reminder.js
const reminder = require("../miniprogram/utils/classReminder");

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
      teacher: "张老师",
      room: "博文202",
      timetableId: "t1",
      slots: slots.map((s) => ({ day: s[0], startSlot: s[1], endSlot: s[2] })),
      startWeek: 1,
      endWeek: 18,
      weekType: "all",
      weeks: [],
    },
    extra || {}
  );
}

const timetable = { startDate: "2026-09-07", totalWeeks: 18, showWeekend: true };
const math = mkCourse("高等数学", [[1, 1, 2]]);

console.log("=== 场景 1：下一节课提醒 ===");
const up1 = reminder.getUpcomingClass([math], 7, 1, new Date(2026, 9, 19, 8, 10), 10);
check("命中", !!up1, true);
check("剩余分钟", up1 && up1.minutesLeft, 10);
check("提醒文案", up1 && up1.text, "10 分钟后 · 高等数学 · 博文202");
check("上课时间", up1 && up1.startText, "08:20");
check("下课时间", up1 && up1.endText, "09:55");
check("已开课不提醒", reminder.getUpcomingClass([math], 7, 1, new Date(2026, 9, 19, 8, 21), 10), null);
check("超出提前量不提醒", reminder.getUpcomingClass([math], 7, 1, new Date(2026, 9, 19, 8, 5), 10), null);
check("提前量放大 15 分钟后命中", !!reminder.getUpcomingClass([math], 7, 1, new Date(2026, 9, 19, 8, 5), 15), true);
check("不同天不提醒", reminder.getUpcomingClass([math], 7, 2, new Date(2026, 9, 19, 8, 10), 10), null);
const up2 = reminder.getUpcomingClass([math], 7, 1, new Date(2026, 9, 19, 8, 19), 10);
check("1 分钟内显示马上上课", up2 && up2.text, "马上上课 · 高等数学 · 博文202");
const noRoom = mkCourse("高等数学", [[1, 1, 2]], { room: "" });
check("无教室时文案不空", reminder.getUpcomingClass([noRoom], 7, 1, new Date(2026, 9, 19, 8, 10), 10).text, "10 分钟后 · 高等数学");

console.log("\n=== 场景 2：周次连续段 ===");
check("连续 + 断开", reminder.groupWeekRuns([1, 2, 3, 5, 6]), [[1, 2, 3], [5, 6]]);
check("乱序输入", reminder.groupWeekRuns([5, 1, 3, 2]), [[1, 2, 3], [5]]);

console.log("\n=== 场景 3：日历事件（连续周 → 每周重复）===");
const course4 = mkCourse("高等数学", [[1, 1, 2]], { weeks: ["1", "2", "3", "4"] });
const events4 = reminder.buildCalendarEvents([course4], timetable, { leadMinutes: 10 });
check("事件数", events4.length, 1);
const e = events4[0];
check("标题", e.title, "高等数学 · 博文202");
check("开始时间（2026-09-07 08:20）", e.startTime, Math.floor(new Date(2026, 8, 7, 8, 20).getTime() / 1000));
check("结束时间（09:55）", e.endTime, Math.floor(new Date(2026, 8, 7, 9, 55).getTime() / 1000));
check("重复", e.repeat, true);
check("重复周期", e.repeatInterval, "week");
check("重复截止（2026-09-28 09:55）", e.repeatEndTime, Math.floor(new Date(2026, 8, 28, 9, 55).getTime() / 1000));
check("提前量（10 分钟 = 600 秒）", e.alarmOffset, 600);
check("提醒开关", e.alarm, true);
check("首末日期", [e.firstDateText, e.lastDateText], ["9/7", "9/28"]);

console.log("\n=== 场景 4：不连续周 → 拆成单次事件 ===");
const odd = mkCourse("体育", [[2, 3, 4]], { weeks: ["1", "3", "5"] });
const oddEvents = reminder.buildCalendarEvents([odd], timetable, { leadMinutes: 5 });
check("事件数", oddEvents.length, 3);
check("全部非重复", oddEvents.every((ev) => ev.repeat === false), true);
check("提前量 5 分钟", oddEvents[0].alarmOffset, 300);
check("首条日期", oddEvents[0].firstDateText, "9/8");

console.log("\n=== 场景 5：混合周次 ===");
const mixed = mkCourse("实验课", [[3, 5, 6]], { weeks: ["1", "2", "5", "6"] });
const mixedEvents = reminder.buildCalendarEvents([mixed], timetable, {});
const mixedRuns = mixedEvents.map((ev) => ev.weeks.join("-"));
check("两段重复事件", mixedRuns, ["1-2", "5-6"]);

console.log("\n=== 场景 6：边界 ===");
check("没有开学日期", reminder.buildCalendarEvents([math], { startDate: "" }, {}), []);
check("超出总周数不生成", reminder.buildCalendarEvents([math], { startDate: "2026-09-07", totalWeeks: 0 }, {}).length, 1);
const late = mkCourse("晚课", [[1, 1, 2]], { weeks: ["19"] });
check("第 19 周被 totalWeeks 过滤", reminder.buildCalendarEvents([late], timetable, {}).length, 0);
const multi = mkCourse("多时段课", [[1, 1, 2], [3, 5, 6]], { weeks: ["1", "2"] });
check("多时段各生成事件", reminder.buildCalendarEvents([multi], timetable, {}).length, 2);

console.log("\n=== 场景 7：提前量文案与范围 ===");
check("10 分钟", reminder.formatLead(10), "10 分钟");
check("默认 10 分钟", reminder.DEFAULT_LEAD_MINUTES, 10);
check("快捷档位", reminder.REMIND_OPTIONS, [1, 5, 10, 15, 30]);
check("最小 1 分钟", reminder.MIN_LEAD_MINUTES, 1);
check("最大 240 分钟", reminder.MAX_LEAD_MINUTES, 240);
check("1 分钟合法", reminder.clampLeadMinutes(1), 1);
check("0 夹到 1", reminder.clampLeadMinutes(0), 1);
check("负数夹到 1", reminder.clampLeadMinutes(-5), 1);
check("超上限夹到 240", reminder.clampLeadMinutes(9999), 240);
check("字符串数字", reminder.clampLeadMinutes("7"), 7);
check("非数字回退默认", reminder.clampLeadMinutes("abc"), 10);

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAIL (" + failed + ")"}`);
process.exit(failed === 0 ? 0 : 1);
