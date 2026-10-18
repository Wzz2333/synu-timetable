// 回归测试：真实 SYNU 格式（周数/教师/上课地点 同行），两个关键场景
// 1) 同课同师不同时段不同教室 → 拆为 2 门（用户场景）
// 2) 调课（同课同时段不同老师）→ 合并为 1 门带 remark
const parseScheduleText = require("../miniprogram/utils/parseScheduleText");

// 场景1：拆分支 - 关键：每个课程块前都有自己的"星期X"时段头
const r1 = parseScheduleText(`星期一1-2
操作系统
周数：1-15周  教师 ：张老师  上课地点：信息楼101
星期三5-6
操作系统
周数：1-15周  教师 ：张老师  上课地点：实验楼305
`);

console.log("=== 场景1：同课同师不同时段不同教室 ===");
console.log(`课程数: ${r1.courses.length}（期望 2）`);
r1.courses.forEach((c, i) => {
  console.log(`  [${i + 1}] ${c.name} | ${c.teacher} | ${c.room} | ${c.slots.map(s => `周${s.day} ${s.startSlot}-${s.endSlot}节`).join(',')}`);
});
const pass1 = r1.courses.length === 2
  && r1.courses[0].room === '信息楼101'
  && r1.courses[1].room === '实验楼305';
console.log(`${pass1 ? '✓' : '✗'} PASS1\n`);

// 场景2：调课合并 - 同时段不同老师
const r2 = parseScheduleText(`星期一3-4
概率论与数理统计A
周数：1-13周,15周  教师 ：王娜  上课地点：教学楼201
概率论与数理统计A
周数：14周  教师 ：吴志丹  上课地点：教学楼201
`);
console.log("=== 场景2：调课（同时段不同老师）===");
console.log(`课程数: ${r2.courses.length}（期望 1）`);
r2.courses.forEach((c, i) => {
  console.log(`  [${i + 1}] ${c.name} | 主教师=${c.teacher} | remark=${c.remark}`);
  console.log(`     周次: ${c.weeks.join(',')} (共${c.weeks.length}周)`);
});
// 1-13 = 13 周 + 15 = 14 周；remark 应含 "吴志丹" 和 "代课"
const pass2 = r2.courses.length === 1
  && r2.courses[0].teacher === '王娜'
  && r2.courses[0].remark.includes('吴志丹')
  && r2.courses[0].remark.includes('代课')
  && r2.courses[0].weeks.length === 14;
console.log(`${pass2 ? '✓' : '✗'} PASS2\n`);

console.log(`${pass1 && pass2 ? '✓ ALL PASS' : '✗ FAIL'}`);
process.exit(pass1 && pass2 ? 0 : 1);
