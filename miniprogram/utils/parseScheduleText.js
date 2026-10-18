// utils/parseScheduleText.js
// 解析沈阳师范大学教务系统（jwxt.synu.edu.cn）"个人课表查询"页 Ctrl+A Ctrl+C 后的纯文本
// 输出仅含现有 course schema 实际用到的 9 个业务字段：name/teacher/room/slots/startWeek/endWeek/weekType/weeks/remark
// 教务系统里的课程编号/学分/学时/教学班组成/考核方式/课程性质/校区/选课备注 等字段全部不解析不存储

const { detectWeekType } = require('./weekHelper');

// 支持 "星期一" / "周一" / "礼拜一" / "周天" 各种口语/书面写法
const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

// 在任意位置匹配 "周X"/"星期X"/"礼拜X" + 节次区间（如 "星期一1-2"、"周一1-2"）
// 归一化后所有破折号都已是 ASCII "-"，所以这里只需纯 ASCII
const RE_WEEKDAY_ANY = /(?:周|星期|礼拜)([一二三四五六日天])\s*(\d+)\s*-\s*(\d+)/;

// 纯星期头（独占一行，不带节次）："星期一" / "周二" / "礼拜日" / "周天"
// 用 ^...$ 锚定整行，避免误匹配"星期一3-4"中的"星期一"
const RE_WEEKDAY_PURE = /^\s*(?:周|星期|礼拜)([一二三四五六日天])\s*$/;

// 独立节次行（无星期前缀）："3-4"、"5-6"、"1-4"
const RE_SLOT_ONLY = /^\s*(\d+)\s*-\s*(\d+)\s*$/;

// "其它课程：" 行（后续内容全部丢弃）
const RE_OTHER = /^\s*其它课程[：:]/;

// 标签行：必须包含 "周数" 才视为合法课程行（冒号兼容 ：/:/半全角空格）
const RE_TAG_HAS_WEEKS = /周数\s*[：:]/;

// 课程名行开头要剥除的符号前缀（可叠加）
const RE_NAME_PREFIX = /^(?:[△◇◆○●]\s*|\s*)+/;

// 字段标签全集（教务系统行内可能出现的所有标签；顺序无关，按出现位置切分）
const ALL_FIELD_LABELS = [
  '校区', '上课地点', '教师', '教学班', '课程学时',
  '考核方式', '选课备注', '课程性质', '学分', '周学时', '总学时',
];
// 标签 "周数：" 的结束边界（任意其它字段都视为结束）
const WEEKS_STOP_KEYWORDS = ['上课地点', '校区', '教师', '教学班', '课程学时', '考核方式', '选课备注', '课程性质', '学分', '周学时', '总学时'];
// 标签 "教师 ：" 的结束边界（必须包含"上课地点"和"校区"，否则会吞掉后面字段）
const TEACHER_STOP_KEYWORDS = ['上课地点', '校区', '教学班', '课程学时', '考核方式', '选课备注', '课程性质', '学分', '周学时', '总学时'];
// 标签 "上课地点：" 的结束边界（"校区"在"上课地点"之后可能紧跟）
const ROOM_STOP_KEYWORDS = ['校区', '教师', '教学班', '课程学时', '考核方式', '选课备注', '课程性质', '学分', '周学时', '总学时'];

/**
 * 强力归一化文本：解决真机上从浏览器复制的文本含特殊字符导致解析失败的问题
 * - 去掉 BOM / 零宽字符 / 双向控制符
 * - 统一换行符 (\r\n / \r / \u2028 / \u2029 / \u0085 → \n)
 * - 统一破折号 (en-dash / em-dash / 全角横线 / minus → ASCII "-")
 * - 统一空白 (不间断空格 / 全角空格 / narrow no-break → ASCII space)
 * - 每行内多空白折叠、trim、空行过滤
 */
function normalizeText(rawText) {
  if (!rawText) return '';
  return String(rawText)
    // 1) 不可见字符：BOM、零宽空格、零宽连字、零宽不连字、LTR/RTL 标记、连字控制符
    .replace(/[\uFEFF\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
    // 2) 换行符归一
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029\u0085]/g, '\n')
    // 3) 各种破折号 → ASCII hyphen
    //    U+2010‐ U+2011‑ U+2012‒ U+2013– U+2014— U+2015― U+2212− U+FF0D－
    .replace(/[\u2010-\u2015\u2212\uFF0D]/g, '-')
    // 4) 各种空白 → ASCII space
    //    U+00A0 不间断空格, U+2000-200A 各类排版空格, U+202F 窄不间断, U+205F 中数空格, U+3000 全角空格
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // 5) 行内整理
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * 取 tag 行中 label 之后到首个 stopKeyword 之前的子串（trim 后）
 */
function extractAfter(text, label, stopKeywords) {
  const idx = text.indexOf(label);
  if (idx < 0) return '';
  const start = idx + label.length;
  let rest = text.substring(start);
  // 去掉开头全/半角空白 + 全/半角冒号（"周数：1-17周" 这种标签后必须把冒号剥掉）
  rest = rest.replace(/^[\s　：:]+/, '');
  let endIdx = rest.length;
  for (const kw of stopKeywords) {
    const k = rest.indexOf(kw);
    if (k >= 0 && k < endIdx) endIdx = k;
  }
  return rest.substring(0, endIdx).trim();
}

/**
 * 解析周次字符串为字符串数组
 * 支持：1-15周, 1-13周,15周, 1-15周(单), 14周, 1-15周（双）
 * 额外过滤掉"共N周"格式（非连续周次，如"共3周"）—— 返回空数组
 */
function parseWeeksString(raw) {
  if (!raw) return [];
  let text = String(raw).trim();
  // 去掉 (单)/(双) 标记先
  let oddEven = null;
  const parenMatch = text.match(/[（(](\S+?)[）)]/);
  if (parenMatch) {
    const tag = parenMatch[1];
    if (tag === '单' || tag === '单周') oddEven = 'odd';
    else if (tag === '双' || tag === '双周') oddEven = 'even';
  }
  // 去掉"周"以及之后的所有内容
  let body = text.replace(/周.*$/, '').trim();
  // 处理 "共N周" 这种格式（无法映射到具体周次）
  if (/^共\d+/.test(body)) return [];
  // 拆分逗号
  const parts = body.split(/[,,]/).map((p) => p.trim()).filter(Boolean);
  const set = new Set();
  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      set.add(p);
    } else {
      const mm = p.match(/^(\d+)\s*[-－]\s*(\d+)$/);
      if (mm) {
        const a = parseInt(mm[1], 10);
        const b = parseInt(mm[2], 10);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let k = lo; k <= hi; k++) set.add(String(k));
      }
    }
  }
  let arr = Array.from(set).sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
  if (oddEven === 'odd') arr = arr.filter((w) => parseInt(w, 10) % 2 === 1);
  else if (oddEven === 'even') arr = arr.filter((w) => parseInt(w, 10) % 2 === 0);
  return arr;
}

/**
 * 去掉课程名前的装饰前缀（△◇◆○● 等）
 */
function stripCourseNamePrefix(name) {
  if (!name) return '';
  let s = String(name);
  s = s.replace(/【调】/g, '');
  s = s.replace(/[△◇◆○●]\s*/g, '');
  s = s.replace(/^[\s　]+|[\s　]+$/g, '');
  return s;
}

/**
 * 判断是否为调课课程名（含"【调】"）
 */
function isAdjustedClass(name) {
  return /【调】/.test(String(name || ''));
}

/**
 * 把原始课程块（带 day + slot）转换为标准 course 对象
 */
function buildCourse(name, teacher, room, weeksArr, day, startSlot, endSlot) {
  const cleanName = stripCourseNamePrefix(name);
  if (!cleanName) return null;
  const wks = weeksArr && weeksArr.length > 0 ? weeksArr.slice() : [];
  wks.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const startWeek = wks.length > 0 ? parseInt(wks[0], 10) : 1;
  const endWeek = wks.length > 0 ? parseInt(wks[wks.length - 1], 10) : 18;
  const weekType = wks.length > 0 ? detectWeekType(startWeek, endWeek, wks) : 'all';
  return {
    name: cleanName,
    teacher: (teacher || '').trim(),
    room: (room || '').trim(),
    slots: [{ day, startSlot, endSlot }],
    startWeek,
    endWeek,
    weekType,
    weeks: wks,
    remark: '',
    _adjusted: isAdjustedClass(name),
  };
}

/**
 * 判断两个 slot 列表是否存在完全相同的 slot（同一 day+startSlot+endSlot）
 */
function hasOverlappingSlot(slotsA, slotsB) {
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.day === b.day && a.startSlot === b.startSlot && a.endSlot === b.endSlot) return true;
    }
  }
  return false;
}

/**
 * 合并原始课程列表：
 * Pass 1: 按 (name, teacher) + slot 链重叠（传递）分组
 *        - 同名同师且时段有重叠 → 合并为同一门课（保留第一个非空 room）
 *        - 同名同师但时段完全不重叠（如理论 1-2 节 + 实验 5-6 节）→ 视为不同课程
 * Pass 2: 同 name 但不同 teacher 且 slot 重叠 → 视为调课，合并到主组，remark 写 "X周Y代课"
 * 教室不同的多 slot 课程不强制提示
 */
function mergeCourses(rawCourses) {
  // Pass 1: 按 (name, teacher) + slot 链重叠（传递性）分组
  // 用数组而非 Map，因为分组 key 不能简单表达"传递性重叠"
  const groups = [];
  for (const c of rawCourses) {
    let target = null;
    for (const g of groups) {
      if (g.name !== c.name) continue;
      if (g.teacher !== c.teacher) continue;
      if (hasOverlappingSlot(g.slots, c.slots)) {
        target = g;
        break;
      }
    }
    if (target) {
      for (const s of c.slots) {
        if (!target.slots.some((x) => x.day === s.day && x.startSlot === s.startSlot && x.endSlot === s.endSlot)) {
          target.slots.push(s);
        }
      }
      for (const w of c.weeks) target.weeks.add(w);
      // 教室：保留第一个非空值（合并场景下不丢失信息）
      if (!target.room && c.room) target.room = c.room;
    } else {
      groups.push({
        name: c.name,
        teacher: c.teacher,
        room: c.room,
        slots: c.slots.slice(),
        weeks: new Set(c.weeks),
      });
    }
  }

  // Pass 2: 调课合并（同 name 但不同 teacher 且 slot 重叠）
  const consumed = new Set();
  const result = [];
  for (let i = 0; i < groups.length; i++) {
    if (consumed.has(i)) continue;
    const g = groups[i];
    const adjustedTeachers = new Map(); // teacher -> Set<week>
    for (let j = i + 1; j < groups.length; j++) {
      if (consumed.has(j)) continue;
      const other = groups[j];
      if (other.name !== g.name) continue;
      if (other.teacher === g.teacher) continue;
      if (!hasOverlappingSlot(g.slots, other.slots)) continue;
      // 调课：合并到主组
      for (const w of other.weeks) g.weeks.add(w);
      if (!adjustedTeachers.has(other.teacher)) adjustedTeachers.set(other.teacher, new Set());
      for (const w of other.weeks) adjustedTeachers.get(other.teacher).add(w);
      consumed.add(j);
    }
    g.slots.sort((a, b) => (a.day - b.day) || (a.startSlot - b.startSlot));
    const wks = Array.from(g.weeks).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const startWeek = wks.length > 0 ? parseInt(wks[0], 10) : 1;
    const endWeek = wks.length > 0 ? parseInt(wks[wks.length - 1], 10) : 18;
    const weekType = wks.length > 0 ? detectWeekType(startWeek, endWeek, wks) : 'all';
    const remarkParts = [];
    if (adjustedTeachers.size > 0) {
      for (const [tch, ws] of adjustedTeachers.entries()) {
        const wkList = Array.from(ws).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).join('/');
        remarkParts.push(`${wkList}周${tch}代课`);
      }
    }
    result.push({
      name: g.name,
      teacher: g.teacher,
      room: g.room,
      slots: g.slots,
      startWeek,
      endWeek,
      weekType,
      weeks: wks,
      remark: remarkParts.join('；'),
    });
    consumed.add(i);
  }
  return result;
}

/**
 * 解析入口
 * @param {string} rawText 教务系统纯文本
 * @returns {{ courses: Array, warnings: string[], stats: { total: number, dropped: number, merged: number } }}
 */
function parseScheduleText(rawText) {
  const warnings = [];
  if (!rawText || typeof rawText !== 'string') {
    return { courses: [], warnings: ['未识别到任何课程，粘贴内容为空。'], stats: { total: 0, dropped: 0, merged: 0 } };
  }

  // 强力归一化：解决真机从浏览器复制带来的 BOM/零宽/全角破折号/特殊空白/Unicode 换行 等问题
  // normalizeText 返回 string，下一步 split('\n') 转为行数组供主循环按行处理
  const normalized = normalizeText(rawText);
  const text = normalized.split('\n');

  const rawCourses = [];
  let dropped = 0;
  let currentDay = null;
  let currentStart = null;
  let currentEnd = null;
  // 旧格式兼容：tag 行之前的独立课程名行（新格式下永远为空字符串）
  let pendingName = '';

  let i = 0;
  while (i < text.length) {
    const line = text[i];

    // 1) 遇到"其它课程：" → 整段丢弃，停止
    if (RE_OTHER.test(line)) {
      dropped += 1;
      break;
    }

    // 2) 同行 weekday+slot（兼容旧格式："星期一1-2" / "周一3-4" / "礼拜日 5 - 6"）
    const wa = line.match(RE_WEEKDAY_ANY);
    if (wa) {
      currentDay = WEEKDAY_MAP[wa[1]];
      currentStart = parseInt(wa[2], 10);
      currentEnd = parseInt(wa[3], 10);
      pendingName = '';
      i += 1;
      continue;
    }

    // 3) 纯星期头（独占一行，新格式："星期一" / "周二"）
    const wm = line.match(RE_WEEKDAY_PURE);
    if (wm) {
      currentDay = WEEKDAY_MAP[wm[1]];
      pendingName = '';
      i += 1;
      continue;
    }

    // 4) 独立节次行（无星期前缀，新格式："3-4"）
    const sm = line.match(RE_SLOT_ONLY);
    if (sm) {
      currentStart = parseInt(sm[1], 10);
      currentEnd = parseInt(sm[2], 10);
      pendingName = '';
      i += 1;
      continue;
    }

    // 5) 课程/Tag 行：必须包含 "周数" 才视为合法
    //    兼容两种格式：
    //    a) 新格式：行首是 "△课程名 ..."，周数/教师/上课地点 全在同行
    //    b) 旧格式：行内只有 tag 信息，课程名在上一独立行（pendingName）
    if (currentDay !== null && currentStart !== null && RE_TAG_HAS_WEEKS.test(line)) {
      // 用 tag 模式匹配定位"周数"，避免误中课程名里出现的"周数"
      const tagMatch = line.match(/周数\s*[：:]/);
      const tagIdx = tagMatch ? tagMatch.index : line.indexOf('周数');
      let nameRaw = '';
      if (tagIdx > 0) {
        // 新格式：同行 "课程名 周数：..."
        nameRaw = line.substring(0, tagIdx).trim();
      } else if (pendingName) {
        // 旧格式：上一独立行就是课程名
        nameRaw = pendingName;
      }
      const cleanName = stripCourseNamePrefix(nameRaw);
      if (cleanName) {
        const weeksRaw = extractAfter(line, '周数', WEEKS_STOP_KEYWORDS);
        const teacherRaw = extractAfter(line, '教师', TEACHER_STOP_KEYWORDS);
        const roomRaw = extractAfter(line, '上课地点', ROOM_STOP_KEYWORDS);
        const weeksArr = parseWeeksString(weeksRaw);
        if (weeksArr.length === 0) {
          warnings.push(`"${cleanName}" 周次为空，已跳过。`);
        } else {
          const course = buildCourse(cleanName, teacherRaw, roomRaw, weeksArr, currentDay, currentStart, currentEnd);
          if (course) rawCourses.push(course);
        }
      }
      pendingName = '';
      // 注意：currentStart/currentEnd 不重置
      // - 调课（old）：下一门课不重新写 weekday+slot，共享同一时段
      // - 新格式：下一门课自带新的 weekday+slot 头，会被覆盖
      // - 同 slot 多门课（新格式少见但合法）：也会共享
      i += 1;
      continue;
    }

    // 6) 候选"旧格式课程名行"：在 weekday+slot 之后、tag 之前的纯文字行
    //    必须有 currentDay + currentStart 已就位才认账（否则是 header/title，应丢弃）
    if (currentDay !== null && currentStart !== null && line.trim() && !RE_TAG_HAS_WEEKS.test(line)) {
      pendingName = line;
    }

    // 7) 其他行（标题/分隔/header）：跳过
    i += 1;
  }

  if (rawCourses.length === 0) {
    if (warnings.length === 0) warnings.push('未识别到任何课程，请检查粘贴内容是否完整。');
    return { courses: [], warnings, stats: { total: 0, dropped, merged: 0 } };
  }

  const beforeMerge = rawCourses.length;
  const courses = mergeCourses(rawCourses);
  const merged = beforeMerge - courses.length;
  return {
    courses,
    warnings,
    stats: { total: courses.length, dropped, merged },
  };
}

module.exports = parseScheduleText;
