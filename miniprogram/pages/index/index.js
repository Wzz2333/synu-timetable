// pages/index/index.js
const synu = require("../../config/synu");
const dateHelper = require("../../utils/dateHelper");
const freeTime = require("../../utils/freeTime");
const classReminder = require("../../utils/classReminder");
const { getActiveCourses } = require("../../utils/courseHelper");
const COURSE_COLORS = synu.COURSE_COLORS;
const app = getApp();

Page({
  data: {
    timetable: null,
    currentWeek: 1,
    realWeek: 1,
    isRealWeek: false,
    inSemester: false,
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
    // 今天指示
    todayIndex: 1,
    todayName: "",
    todayMonthDay: "",
    todayColumn: -1,
    weekendHidden: false,
    freeSummaryText: "",
    upcomingText: "",
    upcomingCourse: null,
  },

  onShow() {
    this.loadBg();
    this.loadColors();
    this.ensureTimetable();
    this.startReminderTick();
  },

  onHide() {
    this.stopReminderTick();
  },

  onUnload() {
    this.stopReminderTick();
  },

  // 每 30 秒刷新一次“下一节课”提醒条
  startReminderTick() {
    this.stopReminderTick();
    this._reminderTimer = setInterval(() => {
      this.refreshUpcoming();
    }, 30000);
  },

  stopReminderTick() {
    if (this._reminderTimer) {
      clearInterval(this._reminderTimer);
      this._reminderTimer = null;
    }
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
    const today = dateHelper.getToday();
    this.setData({
      todayIndex: today.weekdayIndex,
      todayName: today.name,
      todayMonthDay: today.monthDay,
    });

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
          // 没有课表：显示新建提示，今天条仍然显示
          this.setData({
            showCreateTip: true,
            timetable: null,
            weekCourses: [],
            dates: [],
            currentWeek: 1,
            realWeek: 1,
            isRealWeek: false,
            inSemester: false,
            todayColumn: -1,
            weekendHidden: false,
            freeSummaryText: "",
          });
          return;
        }

        const totalWeeks = parseInt(timetable.totalWeeks, 10) || 18;
        const realWeek = dateHelper.getClampedWeek(timetable.startDate, totalWeeks);
        const rawWeek = dateHelper.getRealWeek(timetable.startDate);
        const inSemester = rawWeek >= 1 && rawWeek <= totalWeeks;
        const dayCount = timetable.showWeekend === false ? 5 : 7;

        this.setData({
          timetable,
          currentWeek: realWeek,
          realWeek,
          inSemester,
          displayDayNames: synu.WEEKDAY_NAMES.slice(0, dayCount),
          showCreateTip: false,
        });
        this.updateTodayStatus();
        this.updateDates();
        this.loadCourses();
      })
      .catch((err) => {
        console.error("加载课表失败", err);
        wx.showToast({ title: "网络错误", icon: "none" });
      });
  },

  // 今天列高亮 / “回到本周” 的显隐
  updateTodayStatus() {
    const { timetable, currentWeek, realWeek, inSemester, todayIndex } = this.data;
    if (!timetable) {
      this.setData({ isRealWeek: false, todayColumn: -1, weekendHidden: false });
      return;
    }
    const dayCount = timetable.showWeekend === false ? 5 : 7;
    const isRealWeek = inSemester && currentWeek === realWeek;
    this.setData({
      isRealWeek,
      todayColumn: isRealWeek && todayIndex <= dayCount ? todayIndex - 1 : -1,
      weekendHidden: todayIndex > dayCount,
    });
  },

  // 更新日期栏
  updateDates() {
    const timetable = this.data.timetable;
    const week = this.data.currentWeek;
    if (!timetable || !timetable.startDate) return;
    const dayCount = timetable.showWeekend === false ? 5 : 7;
    const dates = dateHelper
      .getWeekDates(timetable.startDate, week, dayCount)
      .map((d) => d.monthDay);
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
          const allCourses = res.result.data || [];
          this._allCourses = allCourses;
          const grid = this.buildGrid(allCourses, currentWeek);
          this.setData({ weekCourses: grid });
          this.loadTodayFree();
          this.refreshUpcoming();
        }
      })
      .catch((err) => {
        console.error("加载课程失败", err);
      });
  },

  // 今天还剩多少空闲（永远按真实周次算，不受当前浏览周影响）
  loadTodayFree() {
    const { timetable, realWeek, todayIndex, inSemester } = this.data;
    if (!timetable || !this._allCourses || !inSemester) {
      this.setData({ freeSummaryText: "" });
      return;
    }
    const result = freeTime.analyzeToday(this._allCourses, realWeek, todayIndex);
    if (result.studyFreeMin > 0) {
      this.setData({
        freeSummaryText: "空闲 " + freeTime.formatDuration(result.studyFreeMin),
      });
    } else {
      this.setData({ freeSummaryText: "今天排满" });
    }
  },

  // 下一节课提醒条（课前 N 分钟，N 来自设置页，默认 10）
  refreshUpcoming() {
    const { timetable, realWeek, todayIndex, inSemester } = this.data;
    if (!timetable || !this._allCourses || !inSemester) {
      if (this.data.upcomingText) {
        this.setData({ upcomingText: "", upcomingCourse: null });
      }
      return;
    }
    const lead = parseInt(wx.getStorageSync("remindMinutes"), 10) || classReminder.DEFAULT_LEAD_MINUTES;
    const upcoming = classReminder.getUpcomingClass(
      this._allCourses,
      realWeek,
      todayIndex,
      new Date(),
      lead
    );
    const text = upcoming ? upcoming.text : "";
    if (text !== this.data.upcomingText) {
      this.setData({
        upcomingText: text,
        upcomingCourse: upcoming ? upcoming.course : null,
      });
    }
  },

  // 点提醒条 → 打开课程详情
  onUpcomingTap() {
    const course = this.data.upcomingCourse;
    if (!course) return;
    this.setData({ showDetail: true, detailCourse: course });
  },

  // 将课程数据转换为 7天×10节 的网格
  buildGrid(courses, currentWeek) {
    const slotCount = this.data.slotCount;
    const dayCount = this.data.timetable && this.data.timetable.showWeekend === false ? 5 : 7;
    const activeCourses = getActiveCourses(courses, currentWeek);
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
    this.updateTodayStatus();
    this.updateDates();
    this.loadCourses();
  },

  nextWeek() {
    if (this.data.currentWeek >= (this.data.timetable.totalWeeks || 18)) return;
    this.setData({ currentWeek: this.data.currentWeek + 1 });
    this.updateTodayStatus();
    this.updateDates();
    this.loadCourses();
  },

  // 回到真实教学周
  backToRealWeek() {
    this.setData({ currentWeek: this.data.realWeek });
    this.updateTodayStatus();
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

  // 跳转空闲时段
  goFreeTime() {
    wx.navigateTo({
      url: "/pages/free-time/index",
    });
  },

  // 跳转更新日志
  goChangelog() {
    wx.navigateTo({
      url: "/pages/changelog/index",
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
