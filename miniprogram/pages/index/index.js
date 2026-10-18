// pages/index/index.js
const synu = require("../../config/synu");
const COURSE_COLORS = synu.COURSE_COLORS;
const app = getApp();

Page({
  data: {
    timetable: null,
    currentWeek: 1,
    weekCourses: [],
    displayDayNames: synu.WEEKDAY_NAMES,
    weekdayNames: synu.WEEKDAY_NAMES,
    COURSE_COLORS: synu.COURSE_COLORS,
    slotCount: 10,
    SLOT_TIMES: synu.SLOT_TIMES,
    showDetail: false,
    detailCourse: null,
    dates: [],
    bgImage: "",
    bgOpacity: 0,
    touchStartX: 0,
    fontClass: "",
    borderClass: "",
    showCreateTip: false,
  },

  onShow() {
    this.loadBg();
    this.loadColors();
    this.ensureTimetable();
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },

  loadColors() {
    const fontColor = (wx.getStorageSync("fontColor") || "333333").replace("#", "");
    const borderColor = (wx.getStorageSync("borderColor") || "e0e0e0").replace("#", "");
    this.setData({
      fontClass: "fc-" + fontColor,
      borderClass: "bc-" + borderColor,
    });
  },

  // 跳转到新建课表
  goCreateTimetable() {
    this.setData({ showCreateTip: false });
    wx.navigateTo({
      url: "/pages/timetable/manage/index",
    });
  },

  // 确保有当前课表
  ensureTimetable() {
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getTimetables" },
      })
      .then((res) => {
        if (!res.result.success) {
          wx.showToast({ title: res.result.errMsg || "加载失败", icon: "none" });
          return;
        }
        const timetables = res.result.data || [];
        let activeId = app.globalData.activeTimetableId;
        let timetable = null;

        if (activeId) {
          timetable = timetables.find((t) => t._id === activeId);
        }
        if (!timetable && timetables.length > 0) {
          timetable = timetables[0];
          activeId = timetable._id;
          app.globalData.activeTimetableId = activeId;
        }
        if (!timetable) {
          // 没有课表：显示新建提示
          this.setData({ showCreateTip: true, timetable: null, weekCourses: [], dates: [] });
          return;
        }

        const currentWeek = synu.getCurrentWeek({
          startDate: timetable.startDate,
          totalWeeks: timetable.totalWeeks,
        });

        const dayCount = timetable.showWeekend === false ? 5 : 7;
        this.setData({
          timetable,
          currentWeek,
          displayDayNames: synu.WEEKDAY_NAMES.slice(0, dayCount),
          showCreateTip: false,
        });
        this.updateDates();
        this.loadCourses();
      })
      .catch((err) => {
        console.error("加载课表失败", err);
        wx.showToast({ title: "网络错误", icon: "none" });
      });
  },

  // 更新日期栏
  updateDates() {
    const timetable = this.data.timetable;
    const week = this.data.currentWeek;
    if (!timetable || !timetable.startDate) return;
    const dayCount = timetable.showWeekend === false ? 5 : 7;
    const start = new Date(timetable.startDate);
    // 找到开学那周的周一
    const dayOfWeek = start.getDay();
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday0 = new Date(start.getTime() - daysToMon * 86400000);
    // 当前周的周一
    const monday = new Date(monday0.getTime() + (week - 1) * 7 * 86400000);
    const dates = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(monday.getTime() + i * 86400000);
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    this.setData({ dates });
  },

  // 触摸滑动切换周次
  onTouchStart(e) {
    this.setData({ touchStartX: e.touches[0].clientX });
  },

  onTouchEnd(e) {
    const diff = e.changedTouches[0].clientX - this.data.touchStartX;
    if (Math.abs(diff) < 50) return;
    if (diff > 0) this.prevWeek();
    else this.nextWeek();
  },

  // 加载课程
  loadCourses() {
    const { timetable, currentWeek } = this.data;
    if (!timetable) return;
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: {
          type: "getCourses",
          data: { timetableId: timetable._id },
        },
      })
      .then((res) => {
        if (res.result.success) {
          const grid = this.buildGrid(res.result.data, currentWeek);
          this.setData({ weekCourses: grid });
        }
      })
      .catch((err) => {
        console.error("加载课程失败", err);
      });
  },

  // 将课程数据转换为 7天×12节 的网格
  buildGrid(courses, currentWeek) {
    const slotCount = this.data.slotCount;
    const dayCount = this.data.timetable && this.data.timetable.showWeekend ? 7 : 5;
    const activeCourses = courses.filter((c) => {
      if (c.weeks && c.weeks.length > 0) return c.weeks.indexOf(String(currentWeek)) >= 0;
      if (c.startWeek > currentWeek || c.endWeek < currentWeek) return false;
      const wt = c.weekType || "all";
      if (wt === "odd" && currentWeek % 2 === 0) return false;
      if (wt === "even" && currentWeek % 2 === 1) return false;
      return true;
    });
    const grid = [];
    for (let day = 0; day < dayCount; day++) {
      const slots = new Array(slotCount).fill(null);
      activeCourses.forEach((course) => {
        const slotList = course.slots || [{ day: course.day, startSlot: course.startSlot, endSlot: course.endSlot }];
        slotList.forEach((s) => {
          if (s.day === day + 1) {
            const start = s.startSlot - 1;
            const end = s.endSlot - 1;
            slots[start] = {
              ...course,
              span: end - start + 1,
              colorIndex: (course.name + course.teacher).length % COURSE_COLORS.length,
            };
            for (let i = start + 1; i <= end; i++) {
              slots[i] = "continue";
            }
          }
        });
      });
      grid.push(slots);
    }
    return grid;
  },

  // 切换周次
  prevWeek() {
    if (this.data.currentWeek <= 1) return;
    this.setData({ currentWeek: this.data.currentWeek - 1 });
    this.updateDates();
    this.loadCourses();
  },

  nextWeek() {
    if (this.data.currentWeek >= (this.data.timetable.totalWeeks || 18)) return;
    this.setData({ currentWeek: this.data.currentWeek + 1 });
    this.updateDates();
    this.loadCourses();
  },

  // 跳转课表管理
  goManage() {
    wx.navigateTo({
      url: "/pages/timetable/manage/index",
    });
  },

  // 跳转设置
  goSettings() {
    wx.navigateTo({
      url: "/pages/settings/index",
    });
  },

  // 点击课程卡片 → 详情
  onCourseTap(e) {
    const course = e.currentTarget.dataset.course;
    this.setData({ showDetail: true, detailCourse: course });
  },

  closeDetail() {
    this.setData({ showDetail: false, detailCourse: null });
  },

  deleteCourse() {
    const course = this.data.detailCourse;
    if (!course) return;
    wx.showModal({
      title: "删除课程",
      content: `确定删除"${course.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.cloud
            .callFunction({
              name: "quickstartFunctions",
              data: { type: "deleteCourse", data: { _id: course._id } },
            })
            .then(() => {
              this.closeDetail();
              this.loadCourses();
            });
        }
      },
    });
  },

  onSlotTap(e) {
    const { day, slot } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/course/edit/index?day=${day}&startSlot=${slot + 1}&timetableId=${this.data.timetable._id}`,
    });
  },

  editCourse() {
    const course = this.data.detailCourse;
    const slots = course.slots || [{ day: course.day, startSlot: course.startSlot, endSlot: course.endSlot }];
    const slotsStr = encodeURIComponent(JSON.stringify(slots));
    const weeksStr = encodeURIComponent(JSON.stringify(course.weeks || []));
    this.closeDetail();
    wx.navigateTo({
      url: `/pages/course/edit/index?id=${course._id}&name=${encodeURIComponent(course.name)}&teacher=${encodeURIComponent(course.teacher || '')}&room=${encodeURIComponent(course.room || '')}&slots=${slotsStr}&startWeek=${course.startWeek}&endWeek=${course.endWeek}&weekType=${course.weekType || 'all'}&weeks=${weeksStr}&timetableId=${course.timetableId || ''}&remark=${encodeURIComponent(course.remark || '')}`,
    });
  },

  onFabTap() {
    wx.navigateTo({
      url: `/pages/course/edit/index?timetableId=${this.data.timetable._id}`,
    });
  },
});
