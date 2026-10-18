// 真机兼容测试：模拟从手机浏览器复制的"脏"文本（单字符替换，模拟真实剪贴板行为）
const parseScheduleText = require("../miniprogram/utils/parseScheduleText");

// 基础干净文本
const cleanText = `星期一1-2
操作系统
周数：1-15周  教师 ：张老师  上课地点：信息楼101
星期三5-6
操作系统
周数：1-15周  教师 ：张老师  上课地点：实验楼305
`;

// 注入真实剪贴板常见单字符污染
function makeDirty(text) {
  return '\uFEFF'  // 起始 BOM
    + text
    .replace(/-/g, '\u2013')        // ASCII hyphen → en-dash
    .replace(/ /g, '\u00A0')         // ASCII space → 不间断空格
    + '\u200B';                      // 末尾零宽空格
}

const dirtyText = makeDirty(cleanText);
console.log("=== 场景A：真机复制'脏'文本（单字符替换）===");
console.log(`原始长度: ${cleanText.length}, 脏文本长度: ${dirtyText.length}`);

const r1 = parseScheduleText(dirtyText);
console.log(`课程数: ${r1.courses.length}（期望 2）`);
r1.courses.forEach((c, i) => {
  console.log(`  [${i + 1}] ${c.name} | ${c.teacher} | ${c.room} | ${c.slots.map(s => `周${s.day} ${s.startSlot}-${s.endSlot}节`).join(',')}`);
});
const pass1 = r1.courses.length === 2
  && r1.courses[0].room === '信息楼101'
  && r1.courses[1].room === '实验楼305';
console.log(`${pass1 ? '✓' : '✗'} PASS1\n`);

// 场景B：口语化"周一"/"周天"前缀
const r2 = parseScheduleText(`周一1-2
操作系统
周数：1-15周  教师 ：张老师  上课地点：信息楼101
周天5-6
操作系统
周数：1-15周  教师 ：张老师  上课地点：实验楼305
`);
console.log("=== 场景B：口语化'周一'/'周天' ===");
console.log(`课程数: ${r2.courses.length}（期望 2）`);
r2.courses.forEach((c, i) => {
  console.log(`  [${i + 1}] ${c.name} | ${c.teacher} | ${c.room} | ${c.slots.map(s => `周${s.day} ${s.startSlot}-${s.endSlot}节`).join(',')}`);
});
const pass2 = r2.courses.length === 2
  && r2.courses[0].slots[0].day === 1
  && r2.courses[1].slots[0].day === 7;
console.log(`${pass2 ? '✓' : '✗'} PASS2\n`);

// 场景C：CRLF 换行
const r3 = parseScheduleText(`星期一1-2\r\n操作系统\r\n周数：1-15周  教师 ：张老师  上课地点：信息楼101\r\n`);
console.log("=== 场景C：CRLF 换行 ===");
console.log(`课程数: ${r3.courses.length}（期望 1）`);
const pass3 = r3.courses.length === 1 && r3.courses[0].room === '信息楼101';
console.log(`${pass3 ? '✓' : '✗'} PASS3\n`);

console.log(`${pass1 && pass2 && pass3 ? '✓ ALL PASS' : '✗ FAIL'}`);
process.exit(pass1 && pass2 && pass3 ? 0 : 1);
