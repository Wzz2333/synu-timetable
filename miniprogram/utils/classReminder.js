// utils/classReminder.js
// 上课提醒：首页“下一节课”提醒条 + 一键写入手机日历（系统闹钟）。
// 纯函数，不依赖 wx.*，可在 Node 里直接测试。

const synu = require('../config/synu');
const dateHelper = require('./dateHelper');
const { getActiveCourses, getCourseWeekNumbers, normalizeSlots } = require('./courseHelper');

const SLOT_TIMES = synu.SLOT_TIMES;
const DEFAULT_LEAD_MINUTES = 10;
// 快捷档位；提前量本身可任意填 1~240 分钟
const REMIND_OPTIONS = [1, 5, 10, 15, 30];
const MIN_LEAD_MINUTES = 1;
const MAX_LEAD_MINUTES = 240;

function clampLeadMinutes(value, fallback) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return fallback || DEFAULT_LEAD_MINUTES;
  return Math.max(MIN_LEAD_MINUTES, Math.min(MAX_LEAD_MINUTES, n));
}

function timeToMinutes(text) {
  const parts = String(text).split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function formatLead(minutes) {
  return (parseInt(minutes, 10) || DEFAULT_LEAD_MINUTES) + ' 分钟';
}

function formatUpcomingText(upcoming) {
  const parts = [];
  if (upcoming.minutesLeft <= 1) parts.push('马上上课');
  else parts.push(upcoming.minutesLeft + ' 分钟后');
  if (upcoming.course && upcoming.course.name) parts.push(upcoming.course.name);
  if (upcoming.course && upcoming.course.room) parts.push(upcoming.course.room);
  return parts.join(' · ');
}

/**
 * 找出“还有 leadMinutes 分钟内就要开始”的那节课
 * @param {Array} courses 课表全部课程
 * @param {number} week 教学周
 * @param {number} dayIndex 今天星期几（1~7）
 * @param {Date} now 当前时间
 * @param {number} leadMinutes 提前提醒分钟数
 * @returns {null|{course, slot, minutesLeft, startText, endText, text}}
 */
function getUpcomingClass(courses, week, dayIndex, now, leadMinutes) {
  const lead = clampLeadMinutes(leadMinutes);
  const current = now || new Date();
  const nowMin = current.getHours() * 60 + current.getMinutes();
  const day = parseInt(dayIndex, 10);
  const active = getActiveCourses(courses, week);

  let best = null;
  active.forEach((course) => {
    normalizeSlots(course).forEach((slot) => {
      if (slot.day !== day) return;
      const startTime = SLOT_TIMES[slot.startSlot - 1];
      const endTime = SLOT_TIMES[slot.endSlot - 1];
      if (!startTime || !endTime) return;
      const startMin = timeToMinutes(startTime[0]);
      const diff = startMin - nowMin;
      if (diff < 0 || diff > lead) return;
      if (!best || diff < best.minutesLeft) {
        best = {
          course,
          slot,
          minutesLeft: diff,
          startText: startTime[0],
          endText: endTime[1],
        };
      }
    });
  });

  if (!best) return null;
  best.text = formatUpcomingText(best);
  return best;
}

function makeDateTime(day, hhmm) {
  const parts = String(hhmm).split(':');
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    parseInt(parts[0], 10) || 0,
    parseInt(parts[1], 10) || 0,
    0,
    0
  );
}

/**
 * 生成订阅消息的排期任务：未来 N 天内每一次课各一条
 * 服务通知是“一次授权一条”，所以这里按“每次课”拆开，而不是按周重复
 * @param {Array} courses 课表全部课程
 * @param {Object} timetable { startDate, totalWeeks }
 * @param {Object} [options] { leadMinutes, days, maxTasks, now }
 */
function buildSubscribeTasks(courses, timetable, options) {
  const opts = Object.assign(
    { leadMinutes: DEFAULT_LEAD_MINUTES, days: 30, maxTasks: 50, now: new Date() },
    options || {}
  );
  const startDate = dateHelper.parseDate(timetable && timetable.startDate);
  if (!startDate) return [];

  const totalWeeks = parseInt(timetable.totalWeeks, 10) || 18;
  const now = opts.now || new Date();
  const nowMs = now.getTime();
  const endMs = nowMs + (parseInt(opts.days, 10) || 30) * 24 * 60 * 60 * 1000;
  const leadMs = clampLeadMinutes(opts.leadMinutes) * 60 * 1000;

  const tasks = [];
  (courses || []).forEach((course) => {
    const weeks = getCourseWeekNumbers(course).filter((w) => w >= 1 && w <= totalWeeks);
    if (!weeks.length) return;
    normalizeSlots(course).forEach((slot) => {
      const startTime = SLOT_TIMES[slot.startSlot - 1];
      const endTime = SLOT_TIMES[slot.endSlot - 1];
      if (!startTime || !endTime) return;
      weeks.forEach((week) => {
        const date = dateHelper.getDateOfWeekDay(startDate, week, slot.day);
        if (!date) return;
        const startAt = makeDateTime(date, startTime[0]);
        const sendAt = startAt.getTime() - leadMs;
        // 宽限 2 分钟：刚好在提醒时刻点订阅（比如 17:30 的课、15:55 提醒）也能补排
        if (sendAt < nowMs - 2 * 60 * 1000) return;
        if (sendAt > endMs) return;
        tasks.push({
          sendAt,
          startAt: startAt.getTime(),
          courseName: course.name,
          room: course.room || "",
          teacher: course.teacher || "",
          timeText: dateHelper.formatMonthDay(date) + " " + startTime[0],
          timeFullText:
            date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + startTime[0],
          remark: "还有 " + Math.round(leadMs / 60000) + " 分钟上课",
        });
      });
    });
  });

  tasks.sort((a, b) => a.sendAt - b.sendAt);
  const maxTasks = parseInt(opts.maxTasks, 10) || 50;
  return tasks.slice(0, maxTasks);
}

module.exports = {
  DEFAULT_LEAD_MINUTES,
  REMIND_OPTIONS,
  MIN_LEAD_MINUTES,
  MAX_LEAD_MINUTES,
  clampLeadMinutes,
  timeToMinutes,
  formatLead,
  formatUpcomingText,
  getUpcomingClass,
  buildSubscribeTasks,
};
