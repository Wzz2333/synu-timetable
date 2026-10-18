// 空闲时段计算回归测试：无课 / 连堂 / 课间合并 / 单双周 / 饭点 / 实时剩余
// 运行：node test-samples/test-free-time.js
const freeTime = require("../miniprogram/utils/freeTime");

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `（实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}）`}`);
  if (!ok) failed++;
}

// 造一门课：slots 用 [day, startSlot, endSlot] 简写
function mkCourse(slots, extra) {
  return Object.assign(
    {
      name: "测试课",
      teacher: "",
      room: "",
      slots: slots.map((s) => ({ day: s[0], startSlot: s[1], endSlot: s[2] })),
      startWeek: 1,
      endWeek: 18,
      weekType: "all",
      weeks: [],
      remark: "",
    },
    extra || {}
  );
}

console.log("=== 场景 1：一天没课 ===");
const d1 = freeTime.analyzeDay([], 1, 1);
check("窗口数", d1.windows.length, 1);
check("时间区间", d1.windows[0].timeText, "08:20–22:00");
check("净可用分钟（扣午休+晚饭）", d1.studyFreeMin, 675);
check("分类", d1.windows[0].category, "long");

console.log("\n=== 场景 2：上午 1-4 节连堂 ===");
const d2 = freeTime.analyzeDay([mkCourse([[1, 1, 4]])], 1, 1);
check("窗口数", d2.windows.length, 1);
check("起点", d2.windows[0].startText, "11:45");
check("终点", d2.windows[0].endText, "22:00");
check("净可用（615 - 145）", d2.studyFreeMin, 470);
check("标注午休", d2.windows[0].mealNote.indexOf("午休") >= 0, true);
check("标注晚饭", d2.windows[0].mealNote.indexOf("晚饭") >= 0, true);

console.log("\n=== 场景 3：1-2 节 + 3-4 节，中间 15 分钟课间 ===");
const d3 = freeTime.analyzeDay([mkCourse([[1, 1, 2], [1, 3, 4]])], 1, 1);
check("课间被并入忙碌区间（1 段）", d3.busy.length, 1);
check("不产生 15 分钟碎窗口", d3.windows.length, 1);

console.log("\n=== 场景 4：下午 5-8 节 ===");
const d4 = freeTime.analyzeDay([mkCourse([[1, 5, 8]])], 1, 1);
check("窗口数", d4.windows.length, 2);
check("长时段数", d4.longCount, 2);
check("净可用合计（205 + 270）", d4.studyFreeMin, 475);

console.log("\n=== 场景 5：几乎满课，只剩饭点和晚上 ===");
const d5 = freeTime.analyzeDay([mkCourse([[1, 1, 4], [1, 5, 8], [1, 9, 10]])], 1, 1);
const mealWindows = d5.windows.filter((w) => w.category === "meal");
check("饭点窗口数", mealWindows.length, 2);
check("饭点区间", mealWindows.map((w) => w.timeText).join(","), "11:45–13:15,16:35–17:30");
check("剩余长时段数", d5.longCount, 1);
check("剩余净可用（19:10-22:00）", d5.studyFreeMin, 170);

console.log("\n=== 场景 6：weeks 数组优先 ===");
const cWeeks = [mkCourse([[1, 1, 2]], { weeks: ["1", "3"] })];
check("第 2 周不上", freeTime.analyzeDay(cWeeks, 2, 1).busy.length, 0);
check("第 3 周上（净可用 580）", freeTime.analyzeDay(cWeeks, 3, 1).studyFreeMin, 580);

console.log("\n=== 场景 7：单双周 ===");
const cOdd = [mkCourse([[1, 1, 2]], { weekType: "odd" })];
check("单周课第 2 周不上", freeTime.analyzeDay(cOdd, 2, 1).busy.length, 0);
check("单周课第 3 周上", freeTime.analyzeDay(cOdd, 3, 1).busy.length, 1);

console.log("\n=== 场景 8：一周概览（仅工作日）===");
const week = freeTime.analyzeWeek([], 1, 5);
check("天数", week.days.length, 5);
check("周净可用合计（675 x 5）", week.studyFreeMin, 3375);
check("周长时段数", week.longCount, 5);

console.log("\n=== 场景 9：时长文案 ===");
check("45 分钟", freeTime.formatDuration(45), "45 分钟");
check("60 分钟", freeTime.formatDuration(60), "1 小时");
check("90 分钟", freeTime.formatDuration(90), "1 小时 30 分");

console.log("\n=== 场景 10：实时剩余 ===");
const t1 = freeTime.analyzeToday([], 1, 7, undefined, new Date(2026, 9, 18, 15, 0));
check("15:00 剩余（420 - 晚饭 55）", t1.remainingMin, 365);
check("15:00 下一段", t1.next.timeText, "08:20–22:00");
check("15:00 文案", t1.nextText, "现在起到 22:00，还剩 6 小时 5 分");
const t2 = freeTime.analyzeToday([], 1, 7, undefined, new Date(2026, 9, 18, 12, 0));
check("12:00 剩余（600 - 午休 75 - 晚饭 55）", t2.remainingMin, 470);
const t3 = freeTime.analyzeToday([], 1, 7, undefined, new Date(2026, 9, 18, 6, 0));
check("06:00 剩余（820 - 145）", t3.remainingMin, 675);
check("06:00 文案", t3.nextText, "下一段空闲 08:20–22:00");
const t4 = freeTime.analyzeToday([], 1, 7, undefined, new Date(2026, 9, 18, 23, 0));
check("23:00 无更多空闲", t4.next, null);
check("23:00 文案", t4.nextText, "今天没有更多空闲了");
const t5 = freeTime.analyzeToday([mkCourse([[1, 5, 8]])], 1, 1, undefined, new Date(2026, 9, 19, 14, 0));
check("上课中报下一段（16:35-22:00）", t5.nextText, "下一段空闲 16:35–22:00");
check("上课中剩余（325 - 晚饭 55）", t5.remainingMin, 270);

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAIL (" + failed + ")"}`);
process.exit(failed === 0 ? 0 : 1);
