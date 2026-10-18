// 订阅消息排期回归测试：未来 N 天内每次课一条任务
// 运行：node test-samples/test-reminder-tasks.js
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

const timetable = { startDate: "2026-09-07", totalWeeks: 18 };
// 2026-10-18 周日 15:00（第 6 周）
const now = new Date(2026, 9, 18, 15, 0);
const math = mkCourse("高等数学", [[1, 1, 2]]);

console.log("=== 场景 1：周一课，未来 30 天 ===");
const tasks = reminder.buildSubscribeTasks([math], timetable, {
  leadMinutes: 10,
  days: 30,
  maxTasks: 50,
  now,
});
check("任务数（10/19、10/26、11/2、11/9、11/16）", tasks.length, 5);
check("首条发送时间（10:00 提前 10 分钟）", tasks[0].sendAt, new Date(2026, 9, 19, 8, 10).getTime());
check("首条时间文案", tasks[0].timeText, "10/19 08:20");
check("首条完整时间（订阅消息 time 关键词用）", tasks[0].timeFullText, "2026年10月19日 08:20");
check("首条课程", tasks[0].courseName, "高等数学");
check("首条教室", tasks[0].room, "博文202");
check("首条教师", tasks[0].teacher, "张老师");
check("首条备注", tasks[0].remark, "提前 10 分钟，记得带好书本");
check("按时间升序", tasks[4].sendAt, new Date(2026, 10, 16, 8, 10).getTime());

console.log("\n=== 场景 2：提前量 / 天数 / 上限 ===");
const lead30 = reminder.buildSubscribeTasks([math], timetable, { leadMinutes: 30, now });
check("提前 30 分钟", lead30[0].sendAt, new Date(2026, 9, 19, 7, 50).getTime());
check("只排 1 天", reminder.buildSubscribeTasks([math], timetable, { days: 1, now }).length, 1);
check("最多 2 条", reminder.buildSubscribeTasks([math], timetable, { maxTasks: 2, now }).length, 2);

console.log("\n=== 场景 3：过去的课不排 ===");
const sunday = mkCourse("周末课", [[7, 1, 2]]);
const sundayTasks = reminder.buildSubscribeTasks([sunday], timetable, { now });
check("今天 08:10 的已过期被跳过（只留 10/25、11/1、11/8、11/15）", sundayTasks.length, 4);
check("首条是 10/25", sundayTasks[0].timeText, "10/25 08:20");

console.log("\n=== 场景 4：多时段 / 多周次 ===");
const multi = mkCourse("实验课", [[2, 5, 6], [4, 3, 4]]);
const multiTasks = reminder.buildSubscribeTasks([multi], timetable, { days: 7, now });
check("一周内两个时段各一条", multiTasks.length, 2);
check("按时段升序（周二 13:15 先于周四 10:10）", multiTasks[0].timeText, "10/20 13:15");
const odd = mkCourse("单周课", [[1, 3, 4]], { weeks: ["1", "7", "9"] });
const oddTasks = reminder.buildSubscribeTasks([odd], timetable, { days: 30, now });
check("单周课只排 weeks 里的周（10/19 第7周、11/2 第9周）", oddTasks.map((t) => t.timeText), ["10/19 10:10", "11/2 10:10"]);

console.log("\n=== 场景 5：边界 ===");
check("没有开学日期", reminder.buildSubscribeTasks([math], { startDate: "" }, { now }), []);
check("没有课程", reminder.buildSubscribeTasks([], timetable, { now }), []);

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAIL (" + failed + ")"}`);
process.exit(failed === 0 ? 0 : 1);
