// pages/timetable/manage/index.js
const app = getApp();

Page({
  data: {
    timetables: [],
    activeId: null,
    showModal: false,
    editingId: "",
    form: { name: "", startDate: "", totalWeeks: 18, showWeekend: true },
    weekOptions: [],
    bgImage: "",
    bgOpacity: 0,
    // 来自导入完成：自动打开编辑弹窗，并加"请设置开学日期"横幅
    fromImport: false,
    highlightStartDate: false,
  },

  onLoad(options) {
    this.loadBg();
    const weekOptions = [];
    for (let i = 1; i <= 20; i++) weekOptions.push(`${i}周`);
    this.setData({ weekOptions });
    // 来自导入完成：准备在加载完课表后自动打开编辑弹窗
    if (options.from === "importDone") {
      this.setData({ fromImport: true, highlightStartDate: true });
    }
  },

  onShow() {
    this.loadBg();
    this.loadTimetables();
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
        if (res.result.success) {
          const timetables = res.result.data || [];
          const activeId = app.globalData.activeTimetableId;
          this.setData({ timetables, activeId });
          // 来自导入完成 → 自动打开当前激活课表的编辑弹窗
          if (this.data.fromImport && activeId) {
            const t = timetables.find((x) => x._id === activeId);
            if (t) {
              this.openModal({ currentTarget: { dataset: { id: activeId } } });
            }
          }
        }
      });
  },

  // 设为当前课表
  selectTimetable(e) {
    const { id } = e.currentTarget.dataset;
    app.globalData.activeTimetableId = id;
    wx.navigateBack();
  },

  // 打开编辑弹窗（传入已有数据或空数据）
  openModal(e) {
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : null;
    if (id) {
      const t = this.data.timetables.find((item) => item._id === id);
      if (t) {
        this.setData({
          showModal: true,
          editingId: id,
          form: {
            name: t.name,
            startDate: t.startDate || "",
            totalWeeks: t.totalWeeks || 18,
            showWeekend: t.showWeekend !== false,
          },
        });
        return;
      }
    }
    // 新建模式
    const now = new Date();
    const startDate = now.getMonth() + 1 >= 2 && now.getMonth() + 1 <= 7
      ? `${now.getFullYear()}-02-25`
      : `${now.getFullYear()}-09-01`;
    this.setData({
      showModal: true,
      editingId: "",
      form: { name: "", startDate, totalWeeks: 18, showWeekend: true },
    });
  },

  closeModal() {
    this.setData({ showModal: false, fromImport: false, highlightStartDate: false });
  },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'form.startDate': e.detail.value });
  },

  onWeeksChange(e) {
    this.setData({ 'form.totalWeeks': parseInt(e.detail.value) + 1 });
  },

  toggleWeekend() {
    this.setData({ 'form.showWeekend': !this.data.form.showWeekend });
  },

  // 保存（新建或更新）
  saveTimetable() {
    const { form, editingId } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: "请输入课表名称", icon: "none" });
      return;
    }
    if (!form.startDate) {
      wx.showToast({ title: "请选择开学日期", icon: "none" });
      return;
    }

    const type = editingId ? "updateTimetable" : "addTimetable";
    const data = editingId ? { ...form, _id: editingId } : form;

    wx.showLoading({ title: "保存中" });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type, data },
      })
      .then((res) => {
        wx.hideLoading();
        if (res.result.success) {
          if (!editingId) {
            app.globalData.activeTimetableId = res.result._id;
          }
          this.closeModal();
          this.loadTimetables();
        } else {
          wx.showToast({ title: res.result.errMsg || "保存失败", icon: "none" });
        }
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "网络错误", icon: "none" });
      });
  },

  // 删除课表
  deleteTimetable(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: "删除课表",
      content: `确定删除"${name}"及其全部课程吗？`,
      confirmColor: "#e74c3c",
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: "删除中" });
        wx.cloud
          .callFunction({
            name: "quickstartFunctions",
            data: { type: "deleteTimetable", data: { _id: id } },
          })
          .then((res) => {
            wx.hideLoading();
            if (res.result.success) {
              if (app.globalData.activeTimetableId === id) {
                app.globalData.activeTimetableId = null;
              }
              this.loadTimetables();
            } else {
              wx.showToast({ title: "删除失败", icon: "none" });
            }
          });
      },
    });
  },

  // 跳转到导入页（步骤1）
  goImport() {
    wx.navigateTo({
      url: "/pages/import/index",
    });
  },

});
