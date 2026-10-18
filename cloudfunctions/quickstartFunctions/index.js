const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// ===== 订阅消息（微信服务通知）=====
// 模板 ID 与字段名必须和公众平台「订阅消息 → 我的模板」里的定义一致。
// 若模板字段不是 thing1/time2/thing3/thing4，改这里的映射即可（键是字段名，值是消息内容）。
const SUBSCRIBE_TEMPLATE_ID = "pYTJQ7vfPxbqXX-P7UmX69E5QDa_2gaET9BrC54o1l8";
const SUBSCRIBE_FIELDS = {
  courseName: "thing1", // 课程名称
  time: "time2", // 上课时间
  room: "thing3", // 上课地点
  remark: "thing4", // 备注
};
// 一次性订阅：每发一条消耗一次授权；若模板是“长期订阅”，改成 true（不扣次数）
const SUBSCRIBE_LONG_TERM = false;
const REMINDER_COLLECTION = "class_reminders";
const REMINDER_MAX_QUOTA = 20;

function clipText(value, max) {
  const text = String(value === undefined || value === null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  const limit = max || 20;
  return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
}

function buildReminderMessage(task) {
  const data = {};
  if (SUBSCRIBE_FIELDS.courseName) data[SUBSCRIBE_FIELDS.courseName] = { value: clipText(task.courseName, 20) };
  if (SUBSCRIBE_FIELDS.time) data[SUBSCRIBE_FIELDS.time] = { value: clipText(task.timeFullText || task.timeText, 20) };
  if (SUBSCRIBE_FIELDS.room) data[SUBSCRIBE_FIELDS.room] = { value: clipText(task.room || "待定", 20) };
  if (SUBSCRIBE_FIELDS.remark) data[SUBSCRIBE_FIELDS.remark] = { value: clipText(task.remark || "记得提前到教室", 20) };
  return data;
}

// 集合没建时给出明确提示，而不是 500
function isCollectionMissing(err) {
  const msg = String((err && (err.errMsg || err.message)) || "");
  return (
    msg.indexOf("-502005") >= 0 ||
    msg.indexOf("collection not exists") >= 0 ||
    msg.indexOf("DATABASE_COLLECTION_NOT_EXIST") >= 0
  );
}

// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// ========== 课程表 CRUD ==========

// 新增课程
const addCourse = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const course = event.data;
    const result = await db.collection("courses").add({
      data: {
        ...course,
        _openid: wxContext.OPENID,
        createTime: db.serverDate(),
      },
    });
    return { success: true, _id: result._id };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// 更新课程
const updateCourse = async (event) => {
  try {
    const { _id, ...course } = event.data;
    await db
      .collection("courses")
      .doc(_id)
      .update({
        data: course,
      });
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// 删除课程
const deleteCourse = async (event) => {
  try {
    await db
      .collection("courses")
      .doc(event.data._id)
      .remove();
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// 查询课程 (按课表)
const getCourses = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const { data } = await db
      .collection("courses")
      .where({
        _openid: wxContext.OPENID,
        timetableId: event.data.timetableId,
      })
      .get();
    return { success: true, data };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// 批量新增课程（用于"从教务系统文本导入"功能）
// 校验目标课表归属，20 条/批分批写入
const addCourseBatch = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const { timetableId, courses } = event.data || {};

    if (!wxContext.OPENID) {
      return { success: false, errMsg: "未登录或会话失效" };
    }
    if (!timetableId) {
      return { success: false, errMsg: "缺少 timetableId" };
    }
    if (!Array.isArray(courses) || courses.length === 0) {
      return { success: false, errMsg: "课程列表为空" };
    }

    // 验证目标课表属于当前用户（防止越权写入别人课表）
    const tRes = await db.collection("timetables").doc(timetableId).get();
    if (!tRes.data || tRes.data._openid !== wxContext.OPENID) {
      return { success: false, errMsg: "目标课表不存在或无权访问" };
    }

    // 数据清洗
    const cleaned = courses.map((c) => {
      const slots = Array.isArray(c.slots)
        ? c.slots
            .map((s) => ({
              day: parseInt(s.day, 10),
              startSlot: parseInt(s.startSlot, 10),
              endSlot: parseInt(s.endSlot, 10),
            }))
            .filter((s) => s.day >= 1 && s.day <= 7 && s.startSlot >= 1 && s.endSlot >= s.startSlot)
        : [];
      const weeks = Array.isArray(c.weeks)
        ? Array.from(new Set(c.weeks.map((w) => String(parseInt(w, 10))))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        : [];
      const startWeek = weeks.length > 0 ? parseInt(weeks[0], 10) : parseInt(c.startWeek, 10) || 1;
      const endWeek = weeks.length > 0 ? parseInt(weeks[weeks.length - 1], 10) : parseInt(c.endWeek, 10) || 18;
      const allowedWT = ["all", "odd", "even", "custom"];
      return {
        name: String(c.name || "").trim(),
        teacher: String(c.teacher || "").trim(),
        room: String(c.room || "").trim(),
        slots,
        startWeek,
        endWeek,
        weekType: allowedWT.indexOf(c.weekType) >= 0 ? c.weekType : "all",
        weeks,
        remark: String(c.remark || "").trim(),
      };
    }).filter((c) => c.name && c.slots.length > 0 && c.weeks.length > 0);

    if (cleaned.length === 0) {
      return { success: false, errMsg: "解析后无可用课程" };
    }

    // 20 条/批，批内并发、批间串行
    const BATCH = 20;
    const ids = [];
    const failed = [];
    for (let i = 0; i < cleaned.length; i += BATCH) {
      const slice = cleaned.slice(i, i + BATCH);
      const writes = slice.map((c) =>
        db
          .collection("courses")
          .add({
            data: {
              ...c,
              timetableId,
              _openid: wxContext.OPENID,
              createTime: db.serverDate(),
            },
          })
          .then((r) => ids.push(r._id))
          .catch((e) => {
            console.error("addCourseBatch 单条失败", c.name, e);
            failed.push(c.name);
          })
      );
      await Promise.all(writes);
    }
    return {
      success: true,
      addedCount: ids.length,
      failed,
      _ids: ids,
    };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// ========== 课表管理 CRUD ==========

const addTimetable = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const { name, startDate, totalWeeks, showWeekend } = event.data;
    const result = await db.collection("timetables").add({
      data: {
        _openid: wxContext.OPENID,
        name,
        startDate,
        totalWeeks: totalWeeks || 18,
        showWeekend: showWeekend !== false,
        createTime: db.serverDate(),
      },
    });
    return { success: true, _id: result._id };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

const getTimetables = async () => {
  try {
    const wxContext = cloud.getWXContext();
    const { data } = await db
      .collection("timetables")
      .where({ _openid: wxContext.OPENID })
      .orderBy("createTime", "desc")
      .get();
    return { success: true, data };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

const updateTimetable = async (event) => {
  try {
    const { _id, ...rest } = event.data;
    await db.collection("timetables").doc(_id).update({ data: rest });
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

const deleteTimetable = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const { _id } = event.data;
    await db.collection("timetables").doc(_id).remove();
    // 同时删除该课表下的所有课程
    await db
      .collection("courses")
      .where({ _openid: wxContext.OPENID, timetableId: _id })
      .remove();
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// ========== 用户信息 ==========

const saveProfile = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { avatarUrl, nickName } = event.data;
    const exist = await db.collection("users").where({ _openid: openid }).get();
    if (exist.data.length > 0) {
      await db.collection("users").doc(exist.data[0]._id).update({
        data: { avatarUrl, nickName, updateTime: db.serverDate() },
      });
    } else {
      await db.collection("users").add({
        data: { _openid: openid, avatarUrl, nickName, createTime: db.serverDate() },
      });
    }
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

const getProfile = async () => {
  try {
    const wxContext = cloud.getWXContext();
    const { data } = await db
      .collection("users")
      .where({ _openid: wxContext.OPENID })
      .get();
    return { success: true, data: data[0] || null };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};

// ========== 订阅消息（微信服务通知）==========

// 客户端授权成功后调用：可发送次数 +1，并用最新课表快照重建排期
const subscribeReminder = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return { success: false, errMsg: "未登录或会话失效" };

    const { timetableId, remindMinutes, tasks } = event.data || {};
    if (!timetableId) return { success: false, errMsg: "缺少 timetableId" };

    const now = Date.now();
    const safeTasks = (Array.isArray(tasks) ? tasks : [])
      .slice(0, 50)
      .map((t) => ({
        sendAt: parseInt(t.sendAt, 10),
        startAt: parseInt(t.startAt, 10),
        courseName: clipText(t.courseName, 40),
        room: clipText(t.room, 40),
        teacher: clipText(t.teacher, 40),
        timeText: clipText(t.timeText, 40),
        timeFullText: clipText(t.timeFullText, 40),
        remark: clipText(t.remark, 40),
      }))
      .filter((t) => t.sendAt > now && t.courseName);

    // 次数 +1（有上限，避免一次刷太多）
    const quotaRes = await db.collection(REMINDER_COLLECTION).where({ type: "quota", _openid: openid }).get();
    const quotaDoc = quotaRes.data[0];
    const quota = Math.min(REMINDER_MAX_QUOTA, (quotaDoc ? quotaDoc.count || 0 : 0) + 1);
    const remind = parseInt(remindMinutes, 10) || 10;
    if (quotaDoc) {
      await db.collection(REMINDER_COLLECTION).doc(quotaDoc._id).update({
        data: { count: quota, remindMinutes: remind, timetableId, updateTime: db.serverDate() },
      });
    } else {
      await db.collection(REMINDER_COLLECTION).add({
        data: {
          type: "quota",
          _openid: openid,
          count: quota,
          remindMinutes: remind,
          timetableId,
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
        },
      });
    }

    // 重建排期：删掉旧的待发送任务，写入最新快照
    await db
      .collection(REMINDER_COLLECTION)
      .where({ type: "task", _openid: openid, status: "pending" })
      .remove();
    for (let i = 0; i < safeTasks.length; i += 20) {
      const slice = safeTasks.slice(i, i + 20);
      await Promise.all(
        slice.map((task) =>
          db.collection(REMINDER_COLLECTION).add({
            data: Object.assign({}, task, {
              type: "task",
              _openid: openid,
              status: "pending",
              createTime: db.serverDate(),
            }),
          })
        )
      );
    }

    return { success: true, data: { quota, pending: safeTasks.length } };
  } catch (e) {
    console.error("subscribeReminder 失败", e);
    if (isCollectionMissing(e)) {
      return { success: false, errMsg: "请先在云开发控制台创建 class_reminders 集合" };
    }
    return { success: false, errMsg: e.message };
  }
};

const getReminderStatus = async () => {
  try {
    const openid = cloud.getWXContext().OPENID;
    const quotaRes = await db.collection(REMINDER_COLLECTION).where({ type: "quota", _openid: openid }).get();
    const quotaDoc = quotaRes.data[0];
    const pendingRes = await db
      .collection(REMINDER_COLLECTION)
      .where({ type: "task", _openid: openid, status: "pending" })
      .count();
    const sentRes = await db
      .collection(REMINDER_COLLECTION)
      .where({ type: "task", _openid: openid, status: "sent" })
      .orderBy("sendAt", "desc")
      .limit(1)
      .get();
    return {
      success: true,
      data: {
        quota: quotaDoc ? quotaDoc.count || 0 : 0,
        pending: (pendingRes && pendingRes.total) || 0,
        lastSentAt: sentRes.data[0] ? sentRes.data[0].sendAt : null,
      },
    };
  } catch (e) {
    if (isCollectionMissing(e)) {
      return { success: false, errMsg: "请先在云开发控制台创建 class_reminders 集合" };
    }
    return { success: false, errMsg: e.message };
  }
};

// 定时触发器每分钟跑一次：把到点的任务发出去
const remindTick = async () => {
  try {
    const _ = db.command;
    const now = Date.now();
    const res = await db
      .collection(REMINDER_COLLECTION)
      .where({ type: "task", status: "pending", sendAt: _.lte(now) })
      .limit(50)
      .get();
    const tasks = res.data || [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const quotaCache = {};

    for (const task of tasks) {
      const openid = task._openid;
      const mark = async (status, error) => {
        await db.collection(REMINDER_COLLECTION).doc(task._id).update({
          data: {
            status,
            updateTime: db.serverDate(),
            error: error ? String(error).slice(0, 200) : "",
          },
        });
      };

      if (!openid) {
        await mark("invalid", "missing openid");
        skipped += 1;
        continue;
      }

      if (!quotaCache[openid]) {
        const quotaRes = await db.collection(REMINDER_COLLECTION).where({ type: "quota", _openid: openid }).get();
        const quotaDoc = quotaRes.data[0];
        quotaCache[openid] = { docId: quotaDoc && quotaDoc._id, count: quotaDoc ? quotaDoc.count || 0 : 0 };
      }
      const cache = quotaCache[openid];

      if (!SUBSCRIBE_LONG_TERM && cache.count <= 0) {
        await mark("no_quota", "没有可用的订阅授权");
        skipped += 1;
        continue;
      }

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId: SUBSCRIBE_TEMPLATE_ID,
          page: "pages/index/index",
          data: buildReminderMessage(task),
          miniprogramState: "formal",
        });
        await mark("sent");
        if (!SUBSCRIBE_LONG_TERM) {
          cache.count -= 1;
          if (cache.docId) {
            await db.collection(REMINDER_COLLECTION).doc(cache.docId).update({
              data: { count: cache.count, updateTime: db.serverDate() },
            });
          }
        }
        sent += 1;
      } catch (e) {
        failed += 1;
        console.error("发送订阅消息失败", task._id, e);
        await mark("failed", (e && (e.errMsg || e.message)) || e);
      }
    }

    return { success: true, data: { scanned: tasks.length, sent, skipped, failed } };
  } catch (e) {
    if (isCollectionMissing(e)) {
      return { success: true, data: { scanned: 0, sent: 0, skipped: 0, failed: 0, note: "集合不存在" } };
    }
    console.error("remindTick 失败", e);
    return { success: false, errMsg: e.message };
  }
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
  // 云函数定时触发器（config.json → triggers）：每分钟检查到点的上课提醒
  if (event && event.Type === "Timer") {
    return await remindTick();
  }
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
    case "addCourse":
      return await addCourse(event);
    case "updateCourse":
      return await updateCourse(event);
    case "deleteCourse":
      return await deleteCourse(event);
    case "getCourses":
      return await getCourses(event);
    case "addCourseBatch":
      return await addCourseBatch(event);
    case "addTimetable":
      return await addTimetable(event);
    case "getTimetables":
      return await getTimetables();
    case "updateTimetable":
      return await updateTimetable(event);
    case "deleteTimetable":
      return await deleteTimetable(event);
    case "saveProfile":
      return await saveProfile(event);
    case "getProfile":
      return await getProfile();
    case "subscribeReminder":
      return await subscribeReminder(event);
    case "getReminderStatus":
      return await getReminderStatus();
    case "remindTick":
      // 手动触发一次（调试用：先手动排期，再调它就能立刻发）
      return await remindTick();
  }
};
