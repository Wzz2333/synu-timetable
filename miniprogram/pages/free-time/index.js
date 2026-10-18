// pages/free-time/index.js
// 空闲时段页：今天 / 本周 两个视图，数据全部来自课表 + 纯前端计算
const app = getApp();
const dateHelper = require("../../utils/dateHelper");
const freeTime = require("../../utils/freeTime");

Page({
  data: {
    loading: true,
    error: "",
    tab: "today",
    timetableName: "",
    week: 1,
    inSemester: true,
    semesterNote: "",
    todayLabel: "",
    todayName: "",
    todayMonthDay: "",
    dayCount: 7,
    summary: { freeText: "", nextText: "", countText: "" },
    todayWindows: [],
    todayFragments: [],
    todayMeals: [],
    showFragments: false,
    weekDays: [],
    weekFreeText: "",
    weekLongCount: 0,
    bgImage: "",
    bgOpacity: 0,
  },

  onLoad() {
    this.loadBg();
    this.loadData();
  },

  onShow() {
    this.loadBg();
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab, showFragments: false });
  },

  toggleFragments() {
    this.setData({ showFragments: !this.data.showFragments });
  },

  goManage() {
    wx.navigateTo({ url: "/pages/timetable/manage/index" });
  },

  loadData() {
    this.setData({ loading: true, error: "" });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getTimetables" } })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.errMsg) || "加载课表失败");
        }
        const list = res.result.data || [];
        const activeId = app.globalData.activeTimetableId;
        let timetable = list.find((t) => t._id === activeId);
        if (!timetable) timetable = list[0];
        if (!timetable) {
          this.timetable = null;
          this.courses = [];
          this.setData({ loading: false, error: "还没有课表", timetableName: "" });
          return;
        }
        this.timetable = timetable;
        app.globalData.activeTimetableId = timetable._id;
        return wx.cloud
          .callFunction({
            name: "quickstartFunctions",
            data: { type: "getCourses", data: { timetableId: timetable._id } },
          })
          .then((res2) => {
            if (!res2.result || !res2.result.success) {
              throw new Error((res2.result && res2.result.errMsg) || "加载课程失败");
            }
            this.courses = res2.result.data || [];
            this.render();
          });
      })
      .catch((err) => {
        console.error("[free-time] 加载失败", err);
        this.setData({
          loading: false,
          error: (err && err.message) || "加载失败，请稍后重试",
        });
      });
  },

  render() {
    const timetable = this.timetable;
    if (!timetable) return;
    const today = dateHelper.getToday();
    const week = dateHelper.getClampedWeek(timetable.startDate, timetable.totalWeeks);
    const totalWeeks = parseInt(timetable.totalWeeks, 10) || 18;
    const rawWeek = dateHelper.getRealWeek(timetable.startDate);
    const inSemester = rawWeek >= 1 && rawWeek <= totalWeeks;
    const semesterNote = inSemester
      ? ""
      : rawWeek < 1
      ? "学期还没开始，先按第 1 周预览"
      : "学期已结束，按第 " + totalWeeks + " 周预览";
    const dayCount = timetable.showWeekend === false ? 5 : 7;

    const todayResult = freeTime.analyzeToday(this.courses, week, today.weekdayIndex);
    const windows = todayResult.windows;
    const todayWindows = windows.filter((w) => ["long", "medium", "short"].indexOf(w.category) >= 0);
    const todayFragments = windows.filter((w) => w.category === "fragment");
    const todayMeals = windows.filter((w) => w.category === "meal");

    const summary = {
      freeText:
        todayResult.studyFreeMin > 0
          ? "今天共 " + freeTime.formatDuration(todayResult.studyFreeMin) + " 可用空闲"
          : "今天没有可用空闲",
      nextText: todayResult.nextText,
      countText: todayWindows.length > 0 ? todayWindows.length + " 段可用" : "",
    };

    const weekResult = freeTime.analyzeWeek(this.courses, week, dayCount);
    const weekDates = dateHelper.getWeekDates(timetable.startDate, week, dayCount);
    const weekDays = weekResult.days.map((dayResult, i) => {
      const dateInfo = weekDates[i] || {};
      return {
        day: dayResult.day,
        name: dateInfo.name || "",
        monthDay: dateInfo.monthDay || "",
        isToday: dayResult.day === today.weekdayIndex,
        freeText: dayResult.studyFreeMin > 0 ? freeTime.formatDuration(dayResult.studyFreeMin) : "无",
        windows: dayResult.windows
          .filter((w) => w.category === "long" || w.category === "medium")
          .map((w) => ({
            timeText: w.timeText,
            category: w.category,
            categoryLabel: w.categoryLabel,
          })),
      };
    });

    this.setData({
      loading: false,
      error: "",
      timetableName: timetable.name || "我的课表",
      week,
      inSemester,
      semesterNote,
      todayLabel: today.label,
      todayName: today.name,
      todayMonthDay: today.monthDay,
      dayCount,
      summary,
      todayWindows,
      todayFragments,
      todayMeals,
      weekDays,
      weekFreeText: weekResult.studyFreeText,
      weekLongCount: weekResult.longCount,
      showFragments: false,
    });
  },
});
