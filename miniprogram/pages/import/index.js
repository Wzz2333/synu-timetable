// pages/import/index.js
// 步骤1：用户从教务系统复制纯文本后，粘贴到此处并选择目标课表，再进入预览页
const parseScheduleText = require("../../utils/parseScheduleText");
const app = getApp();

Page({
  data: {
    timetables: [],
    timetableNames: [],
    timetableIndex: 0,
    selectedTimetableId: "",
    rawText: "",
    parsedStats: { total: 0, merged: 0, dropped: 0 },
    warnings: [],
    hasParsed: false,
    canPreview: false,
    bgImage: "",
    bgOpacity: 0,
    // 新建课表弹窗状态
    showCreateModal: false,
    creating: false,
    createForm: { name: "", startDate: "" },
  },

  onLoad() {
    this.loadBg();
    this.loadTimetables();
  },

  onShow() {
    this.loadBg();
    this.loadTimetables();
    this.recheckCanPreview();
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },

  loadTimetables() {
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getTimetables" },
      })
      .then((res) => {
        if (res.result && res.result.success) {
          const list = res.result.data || [];
          const timetableNames = list.map((t) => t.name);
          // 默认选中当前激活课表
          let idx = 0;
          const activeId = app.globalData.activeTimetableId;
          if (activeId) {
            const i = list.findIndex((t) => t._id === activeId);
            if (i >= 0) idx = i;
          }
          const selectedTimetableId = list[idx] ? list[idx]._id : "";
          this.setData({ timetables: list, timetableNames, timetableIndex: idx, selectedTimetableId });
          this.recheckCanPreview();
        }
      });
  },

  onTimetableChange(e) {
    const idx = parseInt(e.detail.value);
    const t = this.data.timetables[idx];
    this.setData({
      timetableIndex: idx,
      selectedTimetableId: t ? t._id : "",
    });
    this.recheckCanPreview();
  },

  onTextInput(e) {
    this.setData({ rawText: e.detail.value });
    this.recheckCanPreview();
  },

  clearText() {
    this.setData({
      rawText: "",
      parsedStats: { total: 0, merged: 0, dropped: 0 },
      warnings: [],
      hasParsed: false,
    });
    this.recheckCanPreview();
  },

  recheckCanPreview() {
    // 只要有文本+目标课表就允许；解析放到 preview 入口做（避免这里跑大文本）
    const canPreview = !!this.data.rawText.trim() && !!this.data.selectedTimetableId;
    if (canPreview !== this.data.canPreview) {
      this.setData({ canPreview });
    }
  },

  goPreview() {
    const { rawText, selectedTimetableId } = this.data;
    if (!rawText.trim()) {
      wx.showToast({ title: "请先粘贴课表文本", icon: "none" });
      return;
    }
    if (!selectedTimetableId) {
      wx.showToast({ title: "请先选择目标课表", icon: "none" });
      return;
    }
    // 调试日志：vConsole 可见，便于真机定位（如果看不到这段输出，说明前端代码未上传）
    console.log("[import] rawText.length =", rawText.length);
    console.log("[import] rawText 前200字符 =", rawText.substring(0, 200));
    console.log("[import] rawText 后200字符 =", rawText.substring(Math.max(0, rawText.length - 200)));
    // 立即解析以便在选择页面展示首屏状态
    const result = parseScheduleText(rawText);
    console.log("[import] parseScheduleText 解析结果: courses=" + result.courses.length + ", warnings=", result.warnings);
    if (result.courses.length === 0) {
      wx.showModal({
        title: "未识别到课程",
        content: (result.warnings && result.warnings[0]) || "请检查粘贴内容是否完整，或确认是从教务系统「个人课表查询」复制的。",
        showCancel: false,
        confirmText: "我知道了",
      });
      return;
    }
    // 序列化后通过 URL 传过去（避免大对象存全局状态）
    const payload = encodeURIComponent(JSON.stringify({
      rawText,
      timetableId: selectedTimetableId,
      courses: result.courses,
      warnings: result.warnings || [],
      stats: result.stats || { total: 0, merged: 0, dropped: 0 },
    }));
    wx.navigateTo({
      url: `/pages/import/preview/index?data=${payload}`,
    });
  },

  // --- 新建课表（导入页内联） ---
  openCreateModal() {
    const now = new Date();
    // 学期默认：上半年（2-7 月）→ 2-25 开学；下半年（8-1 月）→ 9-01 开学
    const m = now.getMonth() + 1;
    const startDate = m >= 2 && m <= 7
      ? `${now.getFullYear()}-02-25`
      : `${now.getFullYear()}-09-01`;
    this.setData({
      showCreateModal: true,
      createForm: { name: "", startDate },
    });
  },

  closeCreateModal() {
    if (this.data.creating) return;
    this.setData({ showCreateModal: false });
  },

  onCreateInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`createForm.${field}`]: e.detail.value });
  },

  onCreateDateChange(e) {
    this.setData({ 'createForm.startDate': e.detail.value });
  },

  doCreateTimetable() {
    const { name, startDate } = this.data.createForm;
    if (!name || !name.trim()) {
      wx.showToast({ title: "请输入课表名称", icon: "none" });
      return;
    }
    if (!startDate) {
      wx.showToast({ title: "请选择开学日期", icon: "none" });
      return;
    }
    this.setData({ creating: true });
    wx.showLoading({ title: "创建中", mask: true });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "addTimetable",
          data: { name: name.trim(), startDate, totalWeeks: 18, showWeekend: true },
        },
      })
      .then((res) => {
        wx.hideLoading();
        this.setData({ creating: false });
        if (res.result && res.result.success) {
          const newId = res.result._id;
          this.setData({ showCreateModal: false });
          // 刷新列表并自动选中新课表
          app.globalData.activeTimetableId = newId;
          this.loadTimetables();
          wx.showToast({ title: "已创建并选中", icon: "success" });
        } else {
          wx.showToast({ title: (res.result && res.result.errMsg) || "创建失败", icon: "none" });
        }
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ creating: false });
        wx.showToast({ title: "网络错误", icon: "none" });
      });
  },
});
