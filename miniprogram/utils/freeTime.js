// utils/freeTime.js
// 空闲时段挖掘：把本周课程展开成时间区间，算出连续空闲窗口并按用途分类。
// 纯函数，不依赖 wx.*，可以直接在 Node 里跑测试。
//
// 思路：
//   1. 每周生效的课程 → 每节课换成 [开始, 结束] 分钟数
//   2. 间隔 <= mergeGapMin 的忙碌区间合并（把 5/10/15 分钟的课间吃掉）
//   3. 在 [dayStart, dayEnd] 里求补集 = 连续空闲段
//   4. 扣掉与午休 / 晚饭重叠的分钟数，剩下的“净可用时长”用来分档
//   5. 分档：长 / 中 / 短 / 碎片 / 饭点

const synu = require('../config/synu');
const { getActiveCourses } = require('./courseHelper');

const SLOT_TIMES = synu.SLOT_TIMES;

const DEFAULT_OPTIONS = {
  dayStart: '08:20',
  dayEnd: '22:00',
  mergeGapMin: 15, // 课间（5/10/15 分钟）并入忙碌区间，不单独算空闲
  minWindowMin: 15, // 短于这个长度的段直接丢弃
  longMin: 120, // 净可用 >= 2 小时
  mediumMin: 60, // 净可用 1~2 小时
  shortMin: 30, // 净可用 30~60 分钟
  mealWindows: [
    { start: '11:45', end: '13:15', label: '午休' },
    { start: '16:35', end: '17:30', label: '晚饭' },
  ],
};

const CATEGORY = {
  long: { key: 'long', label: '长时段', advice: '适合实验、写报告、整套刷题', color: '#1989fa' },
  medium: { key: 'medium', label: '中时段', advice: '适合复习一章、刷一套题', color: '#39b54a' },
  short: { key: 'short', label: '短时段', advice: '适合背单词、整理错题', color: '#f0ad4e' },
  fragment: { key: 'fragment', label: '碎片', advice: '回消息、预习下一节', color: '#999999' },
  meal: { key: 'meal', label: '饭点', advice: '先吃饭休息，不建议安排', color: '#bbbbbb' },
};

/* ---------- 基础工具 ---------- */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function toMinutes(text) {
  const parts = String(text).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function toText(minutes) {
  const total = Math.max(0, Math.round(minutes));
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function mergeIntervals(list, gap) {
  const sorted = list.slice().sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start - last.end <= gap) {
      last.end = Math.max(last.end, item.end);
    } else {
      merged.push({ start: item.start, end: item.end });
    }
  }
  return merged;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return total + ' 分钟';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
}

function getMealWindows(options) {
  return (options.mealWindows || []).map((m) => ({
    start: toMinutes(m.start),
    end: toMinutes(m.end),
    label: m.label || '休息',
  }));
}

function timeOfDay(startMin) {
  if (startMin < 600) return '早间';
  if (startMin < 720) return '上午';
  if (startMin < 840) return '午间';
  if (startMin < 1050) return '午后';
  if (startMin < 1150) return '傍晚';
  return '晚间';
}

/* ---------- 核心计算 ---------- */

// 把某天所有课展开成合并后的忙碌区间
function buildBusy(activeCourses, day, options) {
  const dayNum = parseInt(day, 10);
  const raw = [];
  for (const course of activeCourses) {
    const slots = Array.isArray(course.slots) ? course.slots : [];
    for (const slot of slots) {
      if (parseInt(slot.day, 10) !== dayNum) continue;
      const startSlot = parseInt(slot.startSlot, 10);
      const endSlot = parseInt(slot.endSlot, 10);
      if (!startSlot || !endSlot) continue;
      const startTime = SLOT_TIMES[startSlot - 1];
      const endTime = SLOT_TIMES[endSlot - 1];
      if (!startTime || !endTime) continue;
      raw.push({ start: toMinutes(startTime[0]), end: toMinutes(endTime[1]) });
    }
  }
  return mergeIntervals(raw, options.mergeGapMin);
}

// 在 [dayStart, dayEnd] 内求忙碌区间的补集
function complement(busy, dayStart, dayEnd) {
  const free = [];
  let cursor = dayStart;
  for (const item of busy) {
    if (item.start > cursor) {
      free.push({ start: cursor, end: Math.min(item.start, dayEnd) });
    }
    cursor = Math.max(cursor, item.end);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) {
    free.push({ start: cursor, end: dayEnd });
  }
  return free.filter((f) => f.end > f.start);
}

/**
 * 分析一天的空闲时段
 * @param {Array} courses 该课表下的全部课程（内部按周过滤）
 * @param {number} week 教学周
 * @param {number} day 1~7
 * @param {Object} [options]
 */
function analyzeDay(courses, week, day, options) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
  const activeCourses = getActiveCourses(courses, week);
  const dayStart = toMinutes(opts.dayStart);
  const dayEnd = toMinutes(opts.dayEnd);
  const meals = getMealWindows(opts);
  const busy = buildBusy(activeCourses, day, opts);
  const free = complement(busy, dayStart, dayEnd);

  const windows = [];
  let studyFreeMin = 0;
  let mealFreeMin = 0;
  let longCount = 0;

  for (const segment of free) {
    const duration = segment.end - segment.start;
    if (duration < opts.minWindowMin) continue;

    let mealOverlap = 0;
    const mealNotes = [];
    for (const meal of meals) {
      const ov = overlap(segment.start, segment.end, meal.start, meal.end);
      if (ov > 0) {
        mealOverlap += ov;
        mealNotes.push({ label: meal.label, minutes: ov });
      }
    }

    const studyMin = Math.max(0, duration - mealOverlap);
    let categoryKey;
    if (studyMin < opts.minWindowMin) {
      categoryKey = 'meal';
    } else if (studyMin >= opts.longMin) {
      categoryKey = 'long';
    } else if (studyMin >= opts.mediumMin) {
      categoryKey = 'medium';
    } else if (studyMin >= opts.shortMin) {
      categoryKey = 'short';
    } else {
      categoryKey = 'fragment';
    }
    const category = CATEGORY[categoryKey];
    const mealNote = mealNotes
      .filter((n) => n.minutes >= 15)
      .map((n) => n.label + ' ' + formatDuration(n.minutes))
      .join(' / ');

    windows.push({
      startMin: segment.start,
      endMin: segment.end,
      startText: toText(segment.start),
      endText: toText(segment.end),
      timeText: toText(segment.start) + '–' + toText(segment.end),
      durationMin: duration,
      durationText: formatDuration(duration),
      studyMin,
      studyText: formatDuration(studyMin),
      mealOverlapMin: mealOverlap,
      mealNote,
      category: categoryKey,
      categoryLabel: category.label,
      advice: category.advice,
      color: category.color,
      timeOfDay: timeOfDay(segment.start),
    });

    if (categoryKey === 'meal') {
      mealFreeMin += duration;
    } else {
      studyFreeMin += studyMin;
      if (categoryKey === 'long') longCount += 1;
    }
  }

  return {
    day: parseInt(day, 10),
    busy,
    free,
    windows,
    studyFreeMin,
    studyFreeText: formatDuration(studyFreeMin),
    mealFreeMin,
    longCount,
  };
}

/**
 * 一周的空闲概览
 * @param {Array} courses
 * @param {number} week
 * @param {number} dayCount 5 或 7
 * @param {Object} [options]
 */
function analyzeWeek(courses, week, dayCount, options) {
  const count = dayCount || 7;
  const days = [];
  let studyFreeMin = 0;
  let longCount = 0;
  let bestDay = null;

  for (let day = 1; day <= count; day++) {
    const result = analyzeDay(courses, week, day, options);
    days.push(result);
    studyFreeMin += result.studyFreeMin;
    longCount += result.longCount;
    if (!bestDay || result.studyFreeMin > bestDay.studyFreeMin) bestDay = result;
  }

  return {
    days,
    studyFreeMin,
    studyFreeText: formatDuration(studyFreeMin),
    longCount,
    bestDay,
  };
}

/**
 * 今天视角：在 analyzeDay 基础上补“接下来还有多久”
 * @param {Array} courses
 * @param {number} week
 * @param {number} day
 * @param {Object} [options]
 * @param {Date} [now]
 */
function analyzeToday(courses, week, day, options, now) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
  const result = analyzeDay(courses, week, day, opts);
  const dayStart = toMinutes(opts.dayStart);
  const meals = getMealWindows(opts);
  const nowDate = now || new Date();
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  let next = null;
  let remainingMin = 0;
  for (const window of result.windows) {
    if (window.category === 'meal') continue;
    if (window.endMin <= nowMin) continue;
    const start = Math.max(window.startMin, nowMin);
    let remain = window.endMin - start;
    for (const meal of meals) {
      remain -= overlap(start, window.endMin, meal.start, meal.end);
    }
    remain = Math.max(0, remain);
    if (remain >= opts.minWindowMin) {
      next = window;
      remainingMin = remain;
      break;
    }
  }

  let nextText = '';
  if (next) {
    if (nowMin < next.startMin) {
      nextText = '下一段空闲 ' + next.timeText;
    } else {
      nextText = '现在起到 ' + next.endText + '，还剩 ' + formatDuration(remainingMin);
    }
  } else if (nowMin < dayStart) {
    nextText = '今天 ' + opts.dayStart + ' 起有空';
  } else {
    nextText = '今天没有更多空闲了';
  }

  return Object.assign({}, result, {
    nowMin,
    next,
    remainingMin,
    nextText,
  });
}

module.exports = {
  DEFAULT_OPTIONS,
  CATEGORY,
  toMinutes,
  toText,
  formatDuration,
  mergeIntervals,
  complement,
  buildBusy,
  analyzeDay,
  analyzeWeek,
  analyzeToday,
};
