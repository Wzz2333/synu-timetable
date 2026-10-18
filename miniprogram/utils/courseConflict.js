// utils/courseConflict.js
// 时间冲突检测：新加 / 编辑的课程，和同课表已有课程是否存在
// “同一天 + 节次重叠 + 周次有交集”的冲突。纯函数，可在 Node 里直接测试。

const synu = require('../config/synu');
const weekHelper = require('./weekHelper');
const { getCourseWeekNumbers, normalizeSlots } = require('./courseHelper');

const WEEKDAY_NAMES = synu.WEEKDAY_NAMES;

function slotsOverlap(a, b) {
  return a.day === b.day && a.startSlot <= b.endSlot && b.startSlot <= a.endSlot;
}

function timetableIdOf(course) {
  return (course && course.timetableId) || '';
}

/**
 * 查找冲突
 * @param {Array} existingCourses 同课表下的已有课程
 * @param {Object} candidate 待保存的课程（含 slots / startWeek / endWeek / weekType / weeks / timetableId，编辑时带 _id）
 * @returns {Array<{course, slots: Array<{newSlot, oldSlot}>, weeks: number[]}>}
 */
function findConflicts(existingCourses, candidate) {
  const candidateSlots = normalizeSlots(candidate);
  const candidateWeeks = getCourseWeekNumbers(candidate);
  if (!candidateSlots.length || !candidateWeeks.length) return [];

  const excludeId = (candidate && (candidate._id || candidate.id)) || '';
  const candidateTimetableId = timetableIdOf(candidate);
  const conflicts = [];

  (existingCourses || []).forEach((course) => {
    const courseId = course._id || course.id || '';
    if (excludeId && courseId && courseId === excludeId) return;

    const courseTimetableId = timetableIdOf(course);
    if (candidateTimetableId && courseTimetableId && candidateTimetableId !== courseTimetableId) return;

    const courseSlots = normalizeSlots(course);
    if (!courseSlots.length) return;

    const courseWeeks = getCourseWeekNumbers(course);
    if (!courseWeeks.length) return;

    const commonWeeks = candidateWeeks.filter((week) => courseWeeks.indexOf(week) >= 0);
    if (!commonWeeks.length) return;

    const pairs = [];
    candidateSlots.forEach((newSlot) => {
      courseSlots.forEach((oldSlot) => {
        if (slotsOverlap(newSlot, oldSlot)) pairs.push({ newSlot, oldSlot });
      });
    });
    if (!pairs.length) return;

    conflicts.push({ course, slots: pairs, weeks: commonWeeks });
  });

  return conflicts;
}

function formatSlot(slot) {
  const dayName = WEEKDAY_NAMES[slot.day - 1] || '周' + slot.day;
  const range = slot.endSlot > slot.startSlot ? slot.startSlot + '-' + slot.endSlot : String(slot.startSlot);
  return dayName + ' 第' + range + '节';
}

function formatConflict(conflict) {
  const labels = [];
  conflict.slots.forEach((pair) => {
    const label = formatSlot(pair.newSlot);
    if (labels.indexOf(label) < 0) labels.push(label);
  });
  return '《' + conflict.course.name + '》' + labels.join('、') + '，' + weekHelper.formatWeeks(conflict.weeks);
}

/**
 * 把冲突列表转成弹窗文案（最多列 3 条）
 */
function formatConflicts(conflicts, maxLines) {
  const limit = maxLines || 3;
  const lines = (conflicts || []).slice(0, limit).map((conflict) => '与' + formatConflict(conflict) + '冲突');
  if (conflicts.length > limit) {
    lines.push('另有 ' + (conflicts.length - limit) + ' 门课存在冲突');
  }
  return lines.join('\n');
}

module.exports = {
  normalizeSlots,
  slotsOverlap,
  findConflicts,
  formatSlot,
  formatConflict,
  formatConflicts,
};
