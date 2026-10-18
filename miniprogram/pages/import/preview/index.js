// pages/import/preview/index.js
// 步骤2：展示解析结果，用户可逐条编辑/删除，确认后批量写入云数据库
const synu = require("../../../config/synu");
const app = getApp();

const WEEKDAY_NAMES = synu.WEEKDAY_NAMES;

Page({
  data: {
    timetableId: "",
    timetableName: "",
    courses: [],
    displayCourses: [],
    slotTextList: [],
    stats: { total: 0, merged: 0, dropped: 0 },
    warnings: [],
    weekTypeLabel: { all: "全周", odd: "单周", even: "双周", custom: "自定义" },
    editingIdx: -1,
    importing: false,
    bgImage: "",
    bgOpacity: 0,
  },

  onLoad(options) {
    this.loadBg();
    if (!options.data) {
      wx.showToast({ title: "参数缺失", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    let payload;
    try {
      payload = JSON.parse(decodeURIComponent(options.data));
    } catch (e) {
      wx.showToast({ title: "参数解析失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const { timetableId, courses, warnings, stats, rawText } = payload;
    this.setData({
      timetableId,
      courses,
      stats,
      warnings: warnings || [],
      rawText: rawText || "",
    });
    this.recomputeDisplays();
    this.loadTimetableName();
  },

  onShow() {
    this.loadBg();
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },

  loadTimetableName() {
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getTimetables" },
      })
      .then((res) => {
        if (res.result && res.result.success) {
          const list = res.result.data || [];
          const t = list.find((x) => x._id === this.data.timetableId);
          if (t) this.setData({ timetableName: t.name });
        }
      });
  },

  recomputeDisplays() {
    const slotTextList = this.data.courses.map((c) => formatSlots(c.slots));
    this.setData({ displayCourses: this.data.courses, slotTextList });
  },

  toggleEdit(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    this.setData({ editingIdx: this.data.editingIdx === idx ? -1 : idx });
  },

  editCourse(e) {
    // 阻止冒泡到 toggleEdit（编辑按钮单独处理）
    const idx = parseInt(e.currentTarget.dataset.idx);
    this.setData({ editingIdx: this.data.editingIdx === idx ? -1 : idx });
  },

  onCourseInput(e) {
    const { idx, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const courses = this.data.courses.slice();
    const target = { ...courses[idx] };
    if (field === "startWeek" || field === "endWeek") {
      target[field] = parseInt(value) || 0;
    } else {
      target[field] = value;
    }
    courses[idx] = target;
    this.setData({ courses });
    // 同步更新显示（仅当显示文本可能变化时）
    if (field === "name") {
      this.recomputeDisplays();
    }
  },

  removeCourse(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    wx.showModal({
      title: "移除课程",
      content: `确定从本次导入中移除「${this.data.courses[idx].name}」吗？`,
      confirmColor: "#e74c3c",
      success: (r) => {
        if (!r.confirm) return;
        const courses = this.data.courses.slice();
        courses.splice(idx, 1);
        this.setData({ courses, editingIdx: -1 });
        this.recomputeDisplays();
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },

  doImport() {
    if (this.data.courses.length === 0) {
      wx.showToast({ title: "没有可导入的课程", icon: "none" });
      return;
    }
    if (!this.data.timetableId) {
      wx.showToast({ title: "缺少目标课表", icon: "none" });
      return;
    }
    const courses = this.data.courses.map((c) => {
      // 转换为云函数 addCourseBatch 期望的格式
      // timetableId 由云函数在写入时统一附加，per-course 不再带
      return {
        name: String(c.name || "").trim(),
        teacher: String(c.teacher || "").trim(),
        room: String(c.room || "").trim(),
        slots: Array.isArray(c.slots) ? c.slots : [],
        startWeek: parseInt(c.startWeek) || 1,
        endWeek: parseInt(c.endWeek) || 18,
        weekType: c.weekType || "all",
        weeks: Array.isArray(c.weeks) ? c.weeks : [],
        remark: String(c.remark || "").trim(),
      };
    });

    this.setData({ importing: true });
    wx.showLoading({ title: "导入中", mask: true });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "addCourseBatch", data: { timetableId: this.data.timetableId, courses } },
      })
      .then((res) => {
        wx.hideLoading();
        this.setData({ importing: false });
        if (res.result && res.result.success) {
          const added = res.result.addedCount || 0;
          const failed = res.result.failed || [];
          let title = `已导入 ${added} 门课程`;
          if (failed.length > 0) title += `，${failed.length} 条失败`;
          wx.showModal({
            title: "导入完成",
            content: title,
            showCancel: false,
            success: () => {
              // 切换到目标课表并 reLaunch 课表管理页
              // 通过 from=importDone 让管理页自动打开编辑弹窗，提醒设置开学日期
              app.globalData.activeTimetableId = this.data.timetableId;
              wx.reLaunch({ url: "/pages/timetable/manage/index?from=importDone" });
            },
          });
        } else {
          wx.showToast({
            title: (res.result && res.result.errMsg) || "导入失败",
            icon: "none",
          });
        }
      })
      .catch((e) => {
        wx.hideLoading();
        this.setData({ importing: false });
        const m = (e && e.errMsg) || "";
        if (m.includes("Environment")) {
          wx.showModal({ title: "云环境未配置", content: "请在 app.js 填写 env", showCancel: false });
        } else {
          wx.showToast({ title: "网络错误", icon: "none" });
        }
      });
  },
});

function formatSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return "时间未指定";
  return slots
    .map((s) => {
      const day = WEEKDAY_NAMES[(s.day || 1) - 1] || "周?";
      return `${day} 第${s.startSlot}-${s.endSlot}节`;
    })
    .join("，");
}
