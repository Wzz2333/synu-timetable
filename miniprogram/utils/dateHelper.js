// utils/dateHelper.js
// 日期 / 教学周相关的纯函数，首页“今天”指示与空闲时段页共用。
// 只依赖 config/synu（纯数据 + 纯计算），可以直接在 Node 里跑测试。

const { WEEKDAY_NAMES } = require('../config/synu');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 把 'YYYY-MM-DD' 或 Date 统一成“本地零点”的 Date。
 * 不用 new Date('2025-09-01')：它按 UTC 解析，东八区会差 8 小时，
 * 在周一凌晨这类边界上会把周次算错。
 */
function parseDate(input) {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (!input) return null;
  const m = String(input).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function startOfDay(date) {
  const d = date || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// 周一 = 1 ... 周日 = 7（JS 原生 getDay() 里周日是 0）
function getWeekdayIndex(date) {
  const d = (date || new Date()).getDay();
  return d === 0 ? 7 : d;
}

function getWeekdayName(index) {
  return WEEKDAY_NAMES[index - 1] || '';
}

// 某天所在周的周一（本地零点）
function getMondayOf(date) {
  return addDays(startOfDay(date), 1 - getWeekdayIndex(date));
}

function formatMonthDay(date) {
  return (date.getMonth() + 1) + '/' + date.getDate();
}

/**
 * 真实教学周（不截断）：从开学那周的周一起算。
 * 返回 0 表示还没开学；大于 totalWeeks 表示学期已结束。
 */
function getRealWeek(startDate, now) {
  const start = parseDate(startDate);
  if (!start) return 1;
  const monday = getMondayOf(start);
  const today = startOfDay(now || new Date());
  const diffDays = Math.round((today.getTime() - monday.getTime()) / MS_PER_DAY);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

/**
 * 展示用的教学周：截断到 1 ~ totalWeeks 之间
 */
function getClampedWeek(startDate, totalWeeks, now) {
  const total = parseInt(totalWeeks, 10) || 18;
  const week = getRealWeek(startDate, now);
  return Math.max(1, Math.min(week, total));
}

/**
 * 今天的日期信息（不含 Date 对象，方便直接 setData）
 */
function getToday(now) {
  const date = startOfDay(now || new Date());
  const weekdayIndex = getWeekdayIndex(date);
  const name = getWeekdayName(weekdayIndex);
  const monthDay = formatMonthDay(date);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekdayIndex,
    name,
    monthDay,
    label: '今天 ' + name + ' · ' + monthDay,
  };
}

/**
 * 某一教学周的逐日日期信息，dayCount 为 5（不显示周末）或 7
 */
function getWeekDates(startDate, week, dayCount) {
  const start = parseDate(startDate);
  if (!start) return [];
  const count = dayCount || 7;
  const weekNum = Math.max(1, parseInt(week, 10) || 1);
  const monday = addDays(getMondayOf(start), (weekNum - 1) * 7);
  const result = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(monday, i);
    result.push({
      weekdayIndex: i + 1,
      name: getWeekdayName(i + 1),
      monthDay: formatMonthDay(date),
    });
  }
  return result;
}

module.exports = {
  MS_PER_DAY,
  parseDate,
  startOfDay,
  addDays,
  getWeekdayIndex,
  getWeekdayName,
  getMondayOf,
  formatMonthDay,
  getRealWeek,
  getClampedWeek,
  getToday,
  getWeekDates,
};
