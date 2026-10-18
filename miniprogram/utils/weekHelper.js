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

module.exports = {
  buildWeeks,
  detectWeekType,
};
