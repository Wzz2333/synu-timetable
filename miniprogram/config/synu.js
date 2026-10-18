// 沈阳师范大学课程表配置

// 节次时间表 (沈师作息)
const SLOT_TIMES = [
  ['08:20', '09:05'],
  ['09:10', '09:55'],
  ['10:10', '10:55'],
  ['11:00', '11:45'],
  ['13:15', '14:00'],
  ['14:05', '14:50'],
  ['15:00', '15:45'],
  ['15:50', '16:35'],
  ['17:30', '18:15'],
  ['18:25', '19:10'],
];

// 教学楼列表
const BUILDINGS = [
  '博文楼',
  '汇文楼',
  '国际楼',
  '弘文楼',
  '综合楼',
  '美术楼',
  '音乐楼',
  '体育楼',
  '实验楼',
];

// 课程卡片颜色方案
const COURSE_COLORS = [
  '#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F',
  '#8E44AD', '#1ABC9C', '#E67E22', '#3498DB',
  '#2ECC71', '#E74C3C', '#9B59B6', '#16A085',
];

// 学期预设 (沈师校历)
function getCurrentSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 2 && month <= 7) {
    return {
      id: `${year}-spring`,
      name: `${year - 1}-${year}学年 第二学期`,
      startDate: `${year}-02-25`,
      totalWeeks: 18,
    };
  } else {
    return {
      id: `${year}-fall`,
      name: `${year}-${year + 1}学年 第一学期`,
      startDate: `${year}-09-01`,
      totalWeeks: 18,
    };
  }
}

// 计算当前教学周 (从开学那周的周一起算)
function getCurrentWeek(semester) {
  if (!semester || !semester.startDate) return 1;
  const now = new Date();
  const start = new Date(semester.startDate);
  const dayOfWeek = start.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(start.getTime() - daysToMon * 86400000);
  const diff = now.getTime() - monday.getTime();
  const week = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, Math.min(week, semester.totalWeeks));
}

// 星期名称
const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

module.exports = {
  SLOT_TIMES,
  BUILDINGS,
  COURSE_COLORS,
  getCurrentSemester,
  getCurrentWeek,
  WEEKDAY_NAMES,
};
