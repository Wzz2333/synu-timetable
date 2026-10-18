// pages/course/edit/index.js
const synu = require("../../../config/synu");
const weekHelper = require("../../../utils/weekHelper");
const { findConflicts, formatConflicts } = require("../../../utils/courseConflict");
const app = getApp();

Page({
  data: {
    isEdit: false,
    courseId: "",
    form: {
      name: "",
      teacher: "",
      room: "",
      slots: [{ day: 1, startSlot: 1, endSlot: 2 }],
      startWeek: 1,
      endWeek: 18,
      weekType: "all",
      weeks: [],
      timetableId: "",
      remark: "",
    },
    showWeekModal: false,
    displayWeeks: [],
    dayOptions: synu.WEEKDAY_NAMES,
    slotOptions: synu.SLOT_TIMES.map((t, i) => `第${i + 1}节 (${t[0]}-${t[1]})`),
    weekNums: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18"],
    weekTypeOptions: ["全部周", "单周", "双周", "自定义"],
    weekTypeValues: ["all", "odd", "even", "custom"],
    weekTypeIndex: 0,
    buildingList: synu.BUILDINGS,
    bgImage: "",
    bgOpacity: 0,
    // 详细设置用
    modalWeeks: [],
  },

  onLoad(options) {
    this.loadBg();
    const form = { ...this.data.form };
    let weekTypeIndex = this.data.weekTypeValues.indexOf(form.weekType);

    if (options.id) {
      form.name = decodeURIComponent(options.name || '');
      form.teacher = decodeURIComponent(options.teacher || '');
      form.room = decodeURIComponent(options.room || '');
      form.startWeek = parseInt(options.startWeek) || 1;
      form.endWeek = parseInt(options.endWeek) || 18;
      form.timetableId = options.timetableId || "";
      form.remark = decodeURIComponent(options.remark || '');
      form.weekType = options.weekType || "all";
      const wt = this.data.weekTypeValues.indexOf(form.weekType);
      if (wt >= 0) weekTypeIndex = wt;
      if (options.slots) {
        try { form.slots = JSON.parse(decodeURIComponent(options.slots)); }
        catch (e) { form.slots = [{ day: 1, startSlot: 1, endSlot: 2 }]; }
      }
      if (options.weeks) {
        try { form.weeks = JSON.parse(decodeURIComponent(options.weeks)); }
        catch (e) { form.weeks = this.buildWeeks(form.startWeek, form.endWeek, form.weekType); }
      } else {
        form.weeks = this.buildWeeks(form.startWeek, form.endWeek, form.weekType);
      }
    } else {
      if (options.day && options.startSlot) {
        form.slots = [{ day: parseInt(options.day), startSlot: parseInt(options.startSlot), endSlot: parseInt(options.startSlot) + 1 }];
      }
      if (options.timetableId) form.timetableId = options.timetableId;
      form.weeks = this.buildWeeks(form.startWeek, form.endWeek, form.weekType);
    }
    this.setData({ isEdit: !!options.id, courseId: options.id || "", form, weekTypeIndex });
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  onSlotFieldChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const val = parseInt(e.detail.value);
    const slots = [...this.data.form.slots];
    slots[index][field] = val + 1;
    if (field === 'startSlot' && slots[index].startSlot >= slots[index].endSlot) {
      slots[index].endSlot = slots[index].startSlot + 1;
    }
    this.setData({ 'form.slots': slots });
  },

  addSlot() {
    const slots = [...this.data.form.slots];
    const last = slots[slots.length - 1];
    slots.push({ day: last.day, startSlot: last.endSlot, endSlot: Math.min(last.endSlot + 2, synu.SLOT_TIMES.length) });
    this.setData({ 'form.slots': slots });
  },

  removeSlot(e) {
    const slots = [...this.data.form.slots];
    if (slots.length <= 1) return;
    slots.splice(parseInt(e.currentTarget.dataset.index), 1);
    this.setData({ 'form.slots': slots });
  },

  buildWeeks(start, end, weekType) {
    return weekHelper.buildWeeks(start, end, weekType);
  },

  // 从 weeks 判断 weekType
  detectWeekType(start, end, weeks) {
    return weekHelper.detectWeekType(start, end, weeks);
  },

  onStartWeekInput(e) { this.setData({ 'form.startWeek': e.detail.value }); },
  onStartWeekBlur(e) {
    const val = parseInt(e.detail.value) || 1;
    this.setData({ 'form.startWeek': val });
    this.applyWeekPreset();
  },
  onEndWeekInput(e) { this.setData({ 'form.endWeek': e.detail.value }); },
  onEndWeekBlur(e) {
    const val = parseInt(e.detail.value) || 18;
    this.setData({ 'form.endWeek': val });
    this.applyWeekPreset();
  },

  applyWeekPreset() {
    const start = parseInt(this.data.form.startWeek) || 1;
    const end = parseInt(this.data.form.endWeek) || 18;
    if (start > end) { wx.showToast({ title: "起始周不能大于结束周", icon: "none" }); return; }
    const weeks = this.buildWeeks(start, end, this.data.form.weekType);
    this.setData({ 'form.weeks': weeks });
  },

  onWeekTypeChange(e) {
    const idx = parseInt(e.detail.value);
    const weekType = this.data.weekTypeValues[idx];
    const start = parseInt(this.data.form.startWeek) || 1;
    const end = parseInt(this.data.form.endWeek) || 18;
    const weeks = this.buildWeeks(start, end, weekType);
    this.setData({ weekTypeIndex: idx, 'form.weekType': weekType, 'form.weeks': weeks });
  },

  // ===== 详细设置弹窗 =====
  showWeekModal() {
    const start = parseInt(this.data.form.startWeek) || 1;
    const end = parseInt(this.data.form.endWeek) || 18;
    const formWeeks = this.data.form.weeks || [];
    // 预计算待显示的周次（已选/未选）
    const displayWeeks = [];
    for (let i = start; i <= end; i++) {
      const n = String(i);
      displayWeeks.push({
        value: n,
        label: "第" + n + "周",
        selected: formWeeks.indexOf(n) >= 0,
      });
    }
    this.setData({
      displayWeeks,
      modalWeeks: JSON.parse(JSON.stringify(formWeeks)),
      showWeekModal: true,
    });
  },

  hideWeekModal() {
    const weeks = this.data.displayWeeks.filter(w => w.selected).map(w => w.value);
    this.setData({ showWeekModal: false });
    if (weeks.length > 0) {
      const nums = weeks.map(w => parseInt(w));
      this.setData({
        'form.weeks': weeks,
        'form.startWeek': Math.min(...nums),
        'form.endWeek': Math.max(...nums),
      });
    } else {
      this.setData({ 'form.weeks': weeks });
      return;
    }
    // 检测 weekType
    const start = parseInt(this.data.form.startWeek) || 1;
    const end = parseInt(this.data.form.endWeek) || 18;
    const detected = this.detectWeekType(start, end, weeks);
    if (detected !== this.data.form.weekType) {
      const idx = this.data.weekTypeValues.indexOf(detected);
      this.setData({
        'form.weekType': detected,
        weekTypeIndex: idx >= 0 ? idx : this.data.weekTypeValues.indexOf("custom"),
      });
    }
  },

  toggleModalWeek(e) {
    const week = String(e.currentTarget.dataset.week);
    const dw = this.data.displayWeeks.map(w => {
      if (w.value === week) w.selected = !w.selected;
      return w;
    });
    this.setData({ displayWeeks: dw });
  },

  modalPreset(e) {
    const type = e.currentTarget.dataset.type;
    const start = parseInt(this.data.form.startWeek) || 1;
    const end = parseInt(this.data.form.endWeek) || 18;
    let weeks;
    if (type === "none") {
      weeks = [];
    } else {
      weeks = this.buildWeeks(start, end, type);
    }
    const displayWeeks = [];
    for (let i = start; i <= end; i++) {
      const n = String(i);
      displayWeeks.push({ value: n, label: "第" + n + "周", selected: weeks.indexOf(n) >= 0 });
    }
    this.setData({ displayWeeks });
  },

  // ===== 提交 =====
  doSubmit() {
    const { form } = this.data;
    if (!form.name.trim()) { wx.showToast({ title: "请输入课程名称", icon: "none" }); return; }
    for (const s of form.slots) {
      if (s.startSlot >= s.endSlot) { wx.showToast({ title: "结束节次必须大于起始节次", icon: "none" }); return; }
    }
    if (parseInt(form.startWeek) > parseInt(form.endWeek)) { wx.showToast({ title: "起始周不能晚于结束周", icon: "none" }); return; }
    this.checkConflictThenSave();
  },

  // 保存前查时间冲突：同课表内“同一天 + 节次重叠 + 周次有交集”
  checkConflictThenSave() {
    const { form, courseId } = this.data;
    if (!form.timetableId) {
      this.saveCourse();
      return;
    }
    this.loadExistingCourses()
      .then((courses) => {
        const candidate = Object.assign({}, form, { _id: courseId || undefined });
        const conflicts = findConflicts(courses, candidate);
        if (conflicts.length === 0) {
          this.saveCourse();
          return;
        }
        wx.showModal({
          title: "时间冲突",
          content: formatConflicts(conflicts) + "\n\n仍然要保存吗？",
          confirmText: "仍然保存",
          cancelText: "返回修改",
          success: (res) => {
            if (res.confirm) this.saveCourse();
          },
        });
      })
      .catch(() => {
        wx.showModal({
          title: "提示",
          content: "无法读取已有课程，未做时间冲突检查。仍然保存吗？",
          confirmText: "仍然保存",
          cancelText: "取消",
          success: (res) => {
            if (res.confirm) this.saveCourse();
          },
        });
      });
  },

  // 同一课表下的已有课程，加载一次后缓存
  loadExistingCourses() {
    if (this._existingCourses) return Promise.resolve(this._existingCourses);
    return wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getCourses", data: { timetableId: this.data.form.timetableId } },
      })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.errMsg) || "加载课程失败");
        }
        this._existingCourses = res.result.data || [];
        return this._existingCourses;
      });
  },

  saveCourse() {
    const { form, isEdit, courseId } = this.data;
    wx.showLoading({ title: "保存中" });
    const type = isEdit ? "updateCourse" : "addCourse";
    const data = isEdit ? { ...form, _id: courseId } : form;
    wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: { type, data },
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) { wx.showToast({ title: "保存成功", icon: "success" }); setTimeout(() => wx.navigateBack(), 1500); }
      else wx.showToast({ title: "保存失败", icon: "none" });
    }).catch(e => {
      wx.hideLoading();
      const m = e.errMsg || "";
      if (m.includes("Environment")) wx.showModal({ title: "云环境未配置", content: "请在 app.js 填写 env", showCancel: false });
      else wx.showToast({ title: "保存失败", icon: "none" });
    });
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },
});
