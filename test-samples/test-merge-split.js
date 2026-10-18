// 测试同课同师不同时段不同教室 → 应拆为 2 门
const parseScheduleText = require("../miniprogram/utils/parseScheduleText");

// 场景：操作系统（理论）周一1-2 信息楼101 + 操作系统（实验）周三5-6 实验楼305
const sample = `
操作系统
周数：1-15周  教师 ：张老师  上课地点：信息楼101
操作系统
周数：1-15周  教师 ：张老师  上课地点：实验楼305
`;

// 加上星期头
const withDay = `
星期一1-2
操作系统
周数：1-15周  教师 ：张老师  上课地点：信息楼101
星期三5-6
操作系统
周数：1-15周  教师 ：张老师  上课地点：实验楼305
`;

const result = parseScheduleText(withDay);
console.log("=== 场景：同课同师不同时段不同教室 ===");
console.log("课程数：", result.courses.length);
result.courses.forEach((c, i) => {
  console.log(`\n[${i + 1}] ${c.name}`);
  console.log(`  教师: ${c.teacher}`);
  console.log(`  教室: ${c.room}`);
  console.log(`  时段: ${c.slots.map(s => `周${s.day} ${s.startSlot}-${s.endSlot}节`).join(', ')}`);
  console.log(`  周次: 第${c.startWeek}-${c.endWeek}周 (${c.weeks.length}周)`);
});

// 验证期望：2 门独立课程
const ok = result.courses.length === 2
  && result.courses[0].room === '信息楼101'
  && result.courses[1].room === '实验楼305';
console.log(`\n${ok ? '✓ PASS' : '✗ FAIL'} — 期望 2 门不同教室的课程`);
process.exit(ok ? 0 : 1);
