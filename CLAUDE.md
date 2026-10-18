# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

沈阳师范大学特供版课程表小程序，基于微信云开发 (WeChat Cloud Base)。面向沈师学子，提供课程表管理、教务系统课表导入、个性化外观等完整功能。

## 技术栈与工具链

- **开发工具**: 微信开发者工具 (WeChat DevTools)
- **小程序框架**: 原生微信小程序 (WeChat Mini Program native framework)
- **后端**: 微信云开发 — 云函数 (Cloud Functions) + 云数据库 (Cloud Database) + 云存储 (Cloud Storage)
- **基础库版本**: 2.20.1+
- **AppID**: `wx340bfe178cb2ba4d`
- **云开发环境**: `cloud1-d6gz4okgv3c630e15` (在 `miniprogram/app.js` 中配置)

## 目录结构

```
├── miniprogram/                  # 小程序前端代码
│   ├── app.js                    # 入口文件, 云开发初始化 + resolveBackground()
│   ├── app.json                  # 页面注册、窗口配置
│   ├── app.wxss                  # 全局样式 + 动态文字/边框颜色类
│   ├── config/
│   │   ├── synu.js               # 沈师配置：作息表、教学楼、配色、学期计算
│   │   └── subscribe.js          # 订阅消息：模板 ID、排期天数 / 条数上限
│   ├── pages/
│   │   ├── index/                # 主页：周视图课程表 (触摸滑动切周 + 今天指示)
│   │   ├── free-time/            # 空闲时段：今天 / 本周 双视图 (纯前端计算)
│   │   ├── course/edit/          # 课程新增/编辑 (多时段 + 自定义周次)
│   │   ├── timetable/manage/     # 课表管理 (新建/选择/编辑/删除)
│   │   ├── import/               # 导入步骤1：粘贴教务系统文本 + 选择目标课表
│   │   │   └── preview/          # 导入步骤2：预览解析结果 + 逐条编辑 + 批量入库
│   │   ├── settings/             # 设置：主题/自定义背景/文字边框配色
│   │   └── profile/              # 微信头像昵称登录
│   ├── components/
│   │   ├── background/           # 背景图层组件
│   │   └── cloudTipModal/        # 云开发提示组件
│   └── utils/
│       ├── parseScheduleText.js  # 教务系统文本解析器 (406行，核心模块)
│       ├── weekHelper.js         # 周次工具：buildWeeks / detectWeekType
│       ├── courseHelper.js       # "某门课在某周是否生效"判断，首页 / 空闲页共用
│       ├── dateHelper.js         # 日期与教学周纯函数：今天、真实周次、逐日日期
│       ├── freeTime.js           # 空闲时段计算：忙碌区间 → 补集 → 分档
│       ├── courseConflict.js     # 时间冲突检测：同天 + 节次重叠 + 周次交集
│       └── classReminder.js      # 上课提醒：下一节课 + 生成手机日历事件
├── cloudfunctions/
│   └── quickstartFunctions/      # 入口云函数 (按 event.type 路由分发)
├── test-samples/                 # 解析器回归测试 (Node.js 直接运行)
├── samples/                      # 教务系统文本样本
└── project.config.json           # 微信开发者工具项目配置
```

## 云数据库数据模型

| 集合名 | 字段 | 说明 |
|--------|------|------|
| `timetables` | `_openid, name, startDate, totalWeeks, showWeekend, createTime` | 课表，按 `_openid` 隔离 |
| `courses` | `_openid, timetableId, name, teacher, room, slots[], startWeek, endWeek, weekType, weeks[], remark, createTime` | 课程，关联 `timetableId` |
| `users` | `_openid, avatarUrl, nickName, createTime, updateTime` | 用户资料 |
| `class_reminders` | `_openid, type, count, sendAt, courseName, timeText, status, ...` | 上课提醒：`type=quota` 存可发送次数，`type=task` 存排期任务，由云函数读写 |

**课程核心字段说明**：
- `slots[]`: 数组，每个元素 `{ day, startSlot, endSlot }`，支持一门课多个时间段
- `weekType`: `"all"` / `"odd"` / `"even"` / `"custom"`
- `weeks[]`: 字符串数组，如 `["1","3","5","7","9","11","13","15","17"]`
- 数据按 `_openid` 隔离，云函数通过 `cloud.getWXContext().OPENID` 自动注入

## 云函数路由 (quickstartFunctions/index.js)

通过 `wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'xxx', data: {...} } })` 调用。`switch (event.type)` 分发到以下业务接口：

| type | 功能 | 说明 |
|------|------|------|
| `addCourse` | 新增课程 | 单个课程写入，自动注入 `_openid` |
| `updateCourse` | 更新课程 | 按 `_id` 更新 |
| `deleteCourse` | 删除课程 | 按 `_id` 删除 |
| `getCourses` | 查询课程 | 按 `timetableId` + `_openid` 过滤 |
| `addCourseBatch` | 批量导入课程 | 校验课表归属 → 数据清洗 → 20条/批并发写入 |
| `addTimetable` | 新建课表 | 自动注入 `_openid` |
| `getTimetables` | 查询课表列表 | 按 `_openid` 过滤，按 `createTime` 降序 |
| `updateTimetable` | 更新课表 | 按 `_id` 更新 |
| `deleteTimetable` | 删除课表及关联课程 | 先删课表，再删该课表下所有课程 |
| `saveProfile` | 保存用户资料 | upsert 模式（有则更新，无则新建） |
| `getProfile` | 获取用户资料 | 按 `_openid` 查询 |
| `subscribeReminder` | 保存订阅授权 | 可发送次数 +1，按最新课表快照重建排期（`class_reminders` 的 task 记录） |
| `getReminderStatus` | 查询订阅状态 | 剩余可发送次数 / 待发送条数 / 最近发送时间 |
| `sendTestReminder` | 发一条测试提醒 | 消耗 1 次授权，用测试内容立即发送，用于验证模板字段 |
| `rescheduleReminder` | 重建排期 | 改提前量 / 改课表后调用，不改变可发送次数 |
| `checkMyReminders` | 到点检查 | 只处理当前用户已到点的任务，设置页用来区分「没排上」和「定时器没跑」 |
| `remindTick` | 发送到点提醒 | 定时触发器每分钟调用；也可手动触发调试 |

> 注：`getOpenId`, `getMiniProgramCode`, `createCollection`, `selectRecord`, `updateRecord`, `insertRecord`, `deleteRecord` 为 QuickStart 模板遗留的演示接口，未被前端调用。

## 核心功能详解

### 1. 多课表管理 (timetable/manage + app.globalData)
- 用户可创建多张课表（如"大二上学期"、"大二下学期"）
- 当前活跃课表通过 `app.globalData.activeTimetableId` 维护
- 首页 (`pages/index`) 自动加载活跃课表，无课表时显示新建提示
- 删除课表时自动级联删除该课表下所有课程
- 导入完成后自动打开课表编辑弹窗，提醒设置开学日期

### 2. 课程编辑 (course/edit)
- 支持多时段配置 (`slots[]` 数组)，可动态增减时间段
- 周次支持四种模式：全部周 / 单周 / 双周 / 自定义（弹窗勾选）
- 通过 `weekHelper.buildWeeks()` / `detectWeekType()` 实现周次 ←→ 类型的双向转换
- 编辑页通过 URL query string 传递所有字段（含 `encodeURIComponent(JSON.stringify())` 的数组）
- 教学楼选项来自 `synu.js` 的 `BUILDINGS` 配置

### 3. 教务系统文本导入 (import → preview + parseScheduleText.js)
这是项目最复杂的模块，实现从沈阳师范大学教务系统（jwxt.synu.edu.cn）"个人课表查询"页面 Ctrl+A Ctrl+C 的纯文本中自动提取课程。

**解析流程 (parseScheduleText.js, 406行)**：
- **强力归一化**：处理 BOM / 零宽字符 / 全角破折号 / Unicode 换行符 / 不间断空格等真机复制带来的特殊字符
- **状态机行解析**：逐行识别 "星期一/周二" → "3-4节" → "△课程名 周数:..." 的层级结构，兼容新旧两种教务系统格式
- **两遍合并 (mergeCourses)**：
  - Pass 1：同名同师 + slot 重叠（传递性）→ 合并为一门课
  - Pass 2：同名不同师 + slot 重叠 → 调课合并，remark 写入 "X周Y代课"
- **数据清洗**：`addCourseBatch` 云函数对 `slots`/`weeks` 做二次校验，20 条/批并发写入

**导入流程**：
1. `pages/import/index` — 粘贴文本 + 选择目标课表（也可内联新建课表）
2. `pages/import/preview/index` — 展示解析结果，可逐条编辑/删除
3. 确认后调用 `addCourseBatch` 批量入库，完成后自动跳转管理页设置开学日期

**测试**：`test-samples/` 下有 9 个 Node.js 脚本可独立运行（解析器 4 个 + 日期 1 个 + 空闲时段 1 个 + 时间冲突 1 个 + 上课提醒 1 个 + 订阅排期 1 个）。

### 4. 个性化外观 (settings)
- 主题切换：浅色 (white.jpg) / 深色 (black.jpg)，存在 `wx.storage` 的 `theme` 键
- 自定义背景：选择图片 → 上传云存储 → 存 `fileID` 到 `bgImage`
- 背景不透明度：滑块控制 (0~1)，存 `bgOpacity`
- 文字/边框配色：预设色板，通过 `.fc-xxx` / `.bc-xxx` 动态 class 生效
- `app.resolveBackground()` 统一解析背景配置，所有页面在 `onShow` 中调用 `loadBg()`

### 5. 沈师特色配置 (config/synu.js)
- 10 节作息：`08:20-19:10`，含 12:00-13:15 午休、17:30-18:25 晚饭
- 9 栋教学楼：博文楼、汇文楼、弘文楼、国际楼、综合楼、美术楼、音乐楼、体育楼、实验楼
- 12 色课程卡片配色方案
- 学期预设：`getCurrentSemester()` 根据月份（2-7月→春季 / 8-1月→秋季）自动推荐开学日期
- 教学周计算：`getCurrentWeek()` 从开学周一开始算当前周

### 6. 用户登录 (profile)
- 通过微信原生 `<button open-type="chooseAvatar">` 获取头像
- 通过 `<input type="nickname">` 获取昵称
- 头像上传云存储 → 资料存入 `users` 集合（upsert 模式）
- 登录态本地缓存到 `wx.storage.profile`

### 7. 空闲时段与今天指示 (free-time + dateHelper + freeTime)
- 首页顶部「今天条」显示今天周几 / 日期 / 今天剩余空闲，点开进入空闲时段页
- 今天所在列高亮（仅在浏览真实教学周时）；翻到别的周时出现「回到本周」
- 空闲时段页：「今天」列出连续空闲窗口（长 / 中 / 短 / 碎片 / 饭点），「本周」按天汇总
- 计算规则（`utils/freeTime.js`）：
  - 按周过滤课程（`courseHelper.isCourseActiveInWeek`，与首页网格同一套判断）
  - slot 按 `SLOT_TIMES` 展开成分钟区间，间隔 ≤15 分钟的课间先合并
  - 在 08:20–22:00 内求补集 → 扣掉午休 (11:45–13:15) / 晚饭 (16:35–17:30) 的分钟数
  - 按净可用时长分档：长 ≥2h / 中 1–2h / 短 30–60min / 碎片 15–30min / 饭点
- 全部为纯前端计算，不改云函数与数据库；`dateHelper` / `courseHelper` / `freeTime` 均为纯函数，可直接 node 跑测试

### 8. 时间冲突检测 (course/edit + courseConflict)
- 保存课程前读取同课表已有课程，比对「同一天 + 节次重叠 + 周次有交集」
- 有冲突时弹窗列出最多 3 门课与具体时间（如「与《大学物理》周三 第3-4节，第1-16周冲突」），可选「仍然保存」或「返回修改」；编辑自己时自动排除
- 周次判定：`weeks` 数组优先（单周课为 [1,3,5...]），否则按 startWeek/endWeek + 单双周展开
- 读取已有课程失败时降级为「未做冲突检查，是否仍然保存」，不阻断保存
- 提交前若没在「详细设置」手工勾选过周次，会按起始周 / 结束周 + 单双周重算一次，避免「输入了周次但没失焦就直接保存」导致周次仍是默认 1-18；冲突弹窗首行会显示「本次课程：第 X 周」，并列出重叠周次
- 纯函数在 `utils/courseConflict.js`，与编辑页解耦、可单独测试

### 9. 上课提醒 (index + settings + classReminder)
- 首页：上课前 N 分钟（默认 10，设置页可任意填 1~240 分钟，快捷档位 1/5/10/15/30）顶部出现「12 分钟后 · 高等数学 · 博文202」提醒条，点开课程详情；每 30 秒刷新一次
- 设置页「上课提醒」：一键「同步到手机日历」，用 `wx.addPhoneRepeatCalendar` 把本学期课程写进系统日历（`alarmOffset` 为提前秒数）
  - 连续周次（如 1-16 周）合并成一条「每周重复」事件
  - 不连续周次（如单周 1,3,5）拆成单次事件
- 系统日历提醒不依赖网络；微信服务通知（订阅消息）见第 10 节
- 纯函数在 `utils/classReminder.js`：`getUpcomingClass` / `buildCalendarEvents`，可 Node 测试

### 10. 微信服务通知（订阅消息）
- 模板 ID 在 `config/subscribe.js`；模板是「日程提醒」（编号 571），字段映射在 `cloudfunctions/quickstartFunctions/index.js` 顶部的 `SUBSCRIBE_FIELDS`：`thing27` 课程名称 / `thing15` 教师 / `thing10` 地点 / `thing2` 提醒内容 / `time6` 开始时间
- 设置页「微信服务通知」→「订阅一次提醒」：`wx.requestSubscribeMessage` 授权 → `buildSubscribeTasks` 生成未来 30 天每次课的排期 → 云函数 `subscribeReminder` 保存并把可发送次数 +1
- 云函数 `config.json` 带 `subscribeMessage.send` 权限和每分钟执行的定时触发器；`remindTick` 查找到点任务 → 发消息 → 扣减次数，次数用完的任务标记 `no_quota`
- 消息点开跳首页；`SUBSCRIBE_MINIPROGRAM_STATE` 默认 `formal`（正式版），测试阶段改成 `developer` / `trial`
- 一次性订阅：一次授权只能发一条，想连续多条需多次点订阅；若模板是长期订阅，把 `SUBSCRIBE_LONG_TERM` 改成 `true`
- 设置页「立即发一条测试提醒」：消耗 1 次授权，用测试内容（测试课程/测试老师/测试地点）立刻发一条，用来验证模板字段与权限；对应云函数 `sendTestReminder`
- 改提前量会自动调用 `rescheduleReminder` 重建排期（不消耗授权）；改完课表可点「刷新排期」手动重建。状态栏显示剩余次数 / 待发条数 / 下一条发送时间（`nextSendAt`）
- 排期宽限 2 分钟：提醒时刻前后 2 分钟内的到点任务仍会补排，避免「刚好到点才订阅」导致漏提醒
- 每次定时器运行都会写一条 `type=tick` 记录（最近运行时间 / 扫描 / 发送条数），设置页显示「定时器最近运行…」，超过 5 分钟没运行会变黄提示；「立即执行一次到点检查」调用 `checkMyReminders` 手动跑一次，用来判断是触发器没上传还是任务没排上
- 定时器事件兼容 `Type` / `type` / `TriggerName` 三种形态；日志里带 `[timer]` 前缀；失败时也会写 tick 记录，方便确认触发器到底有没有在调用
- 前置条件：首次订阅时云函数会自动创建 `class_reminders` 集合；若提示失败，多半是云函数没重新部署。另外要重新部署云函数并确认定时触发器已上传（右键云函数 →「上传触发器」）

## 关键架构约定

- **页面路由**: 在 `app.json` → `pages` 中注册，框架自动按路径映射。新增页面需同时在这里注册。
- **云函数调用**: 统一通过 `wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'xxx', data: {...} } })` 路由。
- **跨页传参**: 复杂对象（如 `slots[]`, `weeks[]`）通过 URL query string 传递，使用 `encodeURIComponent(JSON.stringify())`。
- **全局状态**: `app.globalData.activeTimetableId` 维护当前课表，`app.resolveBackground()` 统一解析背景。
- **样式单位**: 使用 `rpx` (responsive pixel)，750rpx = 屏幕宽度。
- **本地存储键**: `hasLaunched`, `bgImage`, `bgOpacity`, `theme`, `fontColor`, `borderColor`, `profile`, `remindMinutes`

## 开发命令

本项目无 CLI 构建工具，所有操作在微信开发者工具中完成：

- **预览/调试**: 微信开发者工具 → 点击「编译」或 `Ctrl+B`
- **上传云函数**: 在 `cloudfunctions/quickstartFunctions` 目录右键 → 「上传并部署-云端安装依赖」
- **真机预览**: 微信开发者工具 → 点击「预览」生成二维码
- **上传代码**: 微信开发者工具 → 点击「上传」
- **运行解析器测试**: `node test-samples/test-real-raw.js`
- **运行日期测试**: `node test-samples/test-date-helper.js`
- **运行空闲时段测试**: `node test-samples/test-free-time.js`
- **运行时间冲突测试**: `node test-samples/test-course-conflict.js`
- **运行上课提醒测试**: `node test-samples/test-class-reminder.js`
- **运行订阅排期测试**: `node test-samples/test-reminder-tasks.js`

## 已完成的改造工作

- [x] 将 QuickStart 模板改造为课程表应用，替换全部页面
- [x] 实现云数据库三张核心表 (timetables / courses / users)
- [x] 实现云函数 11 个业务接口
- [x] 实现教务系统文本解析器 + 批量导入流程
- [x] 实现多课表管理 + 课程 CRUD
- [x] 实现个性化设置（主题/背景/配色）
- [x] 实现微信头像昵称登录
- [x] 删除首次启动登录引导弹窗（2026-06-08）
- [x] 实现空闲时段挖掘（今天 / 本周，含饭点标记与实时剩余）
- [x] 首页今天周几指示 + 今天列高亮 + 回到本周
- [x] 引入 git 版本控制（2026-10-18）
- [x] 课程保存前时间冲突检测（2026-10-18）
- [x] 上课提醒：首页提醒条 + 一键写入手机日历（2026-10-18）
- [x] 微信服务通知（订阅消息 + 每分钟定时发送）（2026-10-18）

## 待清理的 QuickStart 遗留

- [ ] 云函数中 7 个演示接口 (`getOpenId`, `getMiniProgramCode`, `createCollection`, `selectRecord`, `updateRecord`, `insertRecord`, `deleteRecord`)
- [ ] `miniprogram/envList.js` (空模块)
- [ ] `project.config.json` 中 `condition.miniprogram.list` 的 `databaseGuide` 引用
- [ ] 项目名 `quickstart-wx-cloud` → 可改为 `synu-timetable`
