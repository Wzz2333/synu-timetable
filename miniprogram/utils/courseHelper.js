// utils/courseHelper.js
// “某门课在某一教学周是否生效”的判断，首页网格与空闲时段页共用。
// 之前这段逻辑内联在 pages/index/index.js 的 buildGrid 里。

const weekHelper = require('./weekHelper');

/**
 * 课程在指定周是否上课
 * - weeks 数组优先（导入的课表几乎都带 weeks）
 * - 其次按 startWeek / endWeek + 单双周
 */
function isCourseActiveInWeek(course, week) {
  if (!course) return false;
  const w = parseInt(week, 10) || 1;

  if (Array.isArray(course.weeks) && course.weeks.length > 0) {
    return course.weeks.indexOf(String(w)) >= 0;
  }

  const start = parseInt(course.startWeek, 10);
  const end = parseInt(course.endWeek, 10);
  if (!isNaN(start) && start > w) return false;
  if (!isNaN(end) && end < w) return false;

  const weekType = course.weekType || 'all';
  if (weekType === 'odd' && w % 2 === 0) return false;
  if (weekType === 'even' && w % 2 === 1) return false;
  return true;
}

/**
 * 课程实际会上的周次（升序整数数组）
 * weeks 数组优先，否则按 startWeek / endWeek + weekType 展开
 */
function getCourseWeekNumbers(course) {
  if (!course) return [];
  let weeks = [];
  if (Array.isArray(course.weeks) && course.weeks.length > 0) {
    weeks = course.weeks
      .map((w) => parseInt(w, 10))
      .filter((n) => !isNaN(n) && n > 0);
  } else {
    const start = parseInt(course.startWeek, 10) || 1;
    const end = parseInt(course.endWeek, 10) || 18;
    if (end >= start) {
      weeks = weekHelper.buildWeeks(start, end, course.weekType || "all").map((w) => parseInt(w, 10));
    }
  }
  const unique = Array.from(new Set(weeks));
  unique.sort((a, b) => a - b);
  return unique;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

/**
 * 统一取课程的时间段，兼容老数据的 course.day / startSlot / endSlot
 * @returns {Array<{day, startSlot, endSlot}>}
 */
function normalizeSlots(course) {
  if (!course) return [];
  let list = [];
  if (Array.isArray(course.slots) && course.slots.length > 0) {
    list = course.slots;
  } else if (course.day && course.startSlot) {
    list = [{ day: course.day, startSlot: course.startSlot, endSlot: course.endSlot }];
  }
  return list
    .map((slot) => ({
      day: toInt(slot.day, 0),
      startSlot: toInt(slot.startSlot, 0),
      endSlot: toInt(slot.endSlot, 0),
    }))
    .filter((slot) => slot.day >= 1 && slot.day <= 7 && slot.startSlot >= 1 && slot.endSlot >= slot.startSlot);
}

/**
 * 过滤出指定周生效的课程
 */
function getActiveCourses(courses, week) {
  if (!Array.isArray(courses)) return [];
  return courses.filter((c) => isCourseActiveInWeek(c, week));
}

module.exports = {
  isCourseActiveInWeek,
  getCourseWeekNumbers,
  normalizeSlots,
  getActiveCourses,
};
