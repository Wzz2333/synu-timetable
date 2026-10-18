// utils/courseHelper.js
// “某门课在某一教学周是否生效”的判断，首页网格与空闲时段页共用。
// 之前这段逻辑内联在 pages/index/index.js 的 buildGrid 里。

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
 * 过滤出指定周生效的课程
 */
function getActiveCourses(courses, week) {
  if (!Array.isArray(courses)) return [];
  return courses.filter((c) => isCourseActiveInWeek(c, week));
}

module.exports = {
  isCourseActiveInWeek,
  getActiveCourses,
};
