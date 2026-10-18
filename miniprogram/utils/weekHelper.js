// utils/weekHelper.js
// 周次相关的纯函数工具，被解析器和课程编辑页共享

/**
 * 根据起止周和周类型，生成实际周次数组
 * @param {number} start - 起始周（1-based）
 * @param {number} end - 结束周（1-based）
 * @param {'all'|'odd'|'even'|'custom'} weekType
 * @returns {string[]} 字符串形式的周次数组
 */
function buildWeeks(start, end, weekType) {
  const result = [];
  for (let i = start; i <= end; i++) {
    if (weekType === 'odd' && i % 2 === 0) continue;
    if (weekType === 'even' && i % 2 === 1) continue;
    result.push(String(i));
  }
  return result;
}

/**
 * 从 weeks 数组反推 weekType
 * @param {number} start
 * @param {number} end
 * @param {string[]} weeks
 * @returns {'all'|'odd'|'even'|'custom'}
 */
function detectWeekType(start, end, weeks) {
  if (!weeks || weeks.length === 0) return 'all';
  const odd = weeks.every((w) => parseInt(w) % 2 === 1);
  const even = weeks.every((w) => parseInt(w) % 2 === 0);
  if (odd) {
    const expected = buildWeeks(start, end, 'odd');
    if (expected.length === weeks.length && expected.every((w) => weeks.indexOf(w) >= 0)) return 'odd';
  }
  if (even) {
    const expected = buildWeeks(start, end, 'even');
    if (expected.length === weeks.length && expected.every((w) => weeks.indexOf(w) >= 0)) return 'even';
  }
  return 'custom';
}

/**
 * 把周次数组压成可读文案
 * 例：[1,2,3,5] → "第1-3周、第5周"；[1,3,5,7] → "第1-7周（单周）"
 * @param {Array<number|string>} weeks
 * @returns {string}
 */
function formatWeeks(weeks) {
  if (!weeks || weeks.length === 0) return '无';
  const sorted = Array.from(
    new Set(
      weeks
        .map((w) => parseInt(w, 10))
        .filter((n) => !isNaN(n) && n > 0)
    )
  ).sort((a, b) => a - b);
  if (!sorted.length) return '无';

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // 连续的单周 / 双周，压缩成 "第1-17周（单周）"
  const step = sorted.length > 1 ? sorted[1] - sorted[0] : 0;
  const evenStep = sorted.every((w, i) => i === 0 || w - sorted[i - 1] === step);
  if (sorted.length >= 4 && evenStep && (step === 2) && first % 2 === 1) {
    return '第' + first + '-' + last + '周（单周）';
  }
  if (sorted.length >= 4 && evenStep && (step === 2) && first % 2 === 0) {
    return '第' + first + '-' + last + '周（双周）';
  }

  const runs = [];
  sorted.forEach((w) => {
    const prev = runs[runs.length - 1];
    if (prev && w === prev[1] + 1) prev[1] = w;
    else runs.push([w, w]);
  });

  const parts = [];
  runs.forEach(([a, b]) => {
    if (a === b) parts.push('第' + a + '周');
    else parts.push('第' + a + '-' + b + '周');
  });

  if (parts.length > 4) {
    return parts.slice(0, 3).join('、') + ' 等 ' + sorted.length + ' 周';
  }
  return parts.join('、');
}

module.exports = {
  buildWeeks,
  detectWeekType,
  formatWeeks,
};
