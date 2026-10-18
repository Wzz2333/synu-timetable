const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
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

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
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
  }
};
