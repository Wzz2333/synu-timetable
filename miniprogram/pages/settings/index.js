// pages/settings/index.js
const app = getApp();
const classReminder = require("../../utils/classReminder");
const subscribeConfig = require("../../config/subscribe");

Page({
  data: {
    theme: "light",
    themeOptions: [
      { value: "light", name: "浅色", desc: "明亮清爽 (white.jpg)" },
      { value: "dark", name: "深色", desc: "护眼低亮度 (black.jpg)" },
    ],
    hasCustomBg: false,
    bgImage: "",
    bgOpacity: 0.5,
    sliderValue: 50,
    fontColor: "#333333",
    borderColor: "#e0e0e0",
    fontPresets: [
      ["#333333", "默认"],
      ["#1a1a2e", "深蓝黑"],
      ["#16213e", "深蓝"],
      ["#2d3436", "石墨"],
      ["#ffffff", "白色"],
    ],
    borderPresets: [
      ["#e0e0e0", "浅灰"],
      ["#cccccc", "灰色"],
      ["#b0b0b0", "深灰"],
    ],
    // 上课提醒
    remindMinutes: classReminder.DEFAULT_LEAD_MINUTES,
    remindValues: classReminder.REMIND_OPTIONS,
    remindOptions: classReminder.REMIND_OPTIONS.map((m) => m + " 分钟"),
    remindIndex: classReminder.REMIND_OPTIONS.indexOf(classReminder.DEFAULT_LEAD_MINUTES),
    syncing: false,
    // 微信服务通知（订阅消息）
    reminderQuota: 0,
    reminderPending: 0,
    reminderStatusText: "",
    reminderStatusLoading: false,
  },

  onLoad() {
    const theme = wx.getStorageSync("theme") || "light";
    const bgImage = wx.getStorageSync("bgImage") || "";
    const opacity = wx.getStorageSync("bgOpacity");
    const fontColor = wx.getStorageSync("fontColor") || "#333333";
    const borderColor = wx.getStorageSync("borderColor") || "#e0e0e0";
    this.setData({
      theme,
      hasCustomBg: !!bgImage,
      bgImage,
      bgOpacity: opacity !== "" ? parseFloat(opacity) : 0.5,
      sliderValue: Math.round((opacity !== "" ? parseFloat(opacity) : 0.5) * 100),
      fontColor,
      borderColor,
    });
    this.loadRemindSettings();
  },

  loadRemindSettings() {
    const saved = parseInt(wx.getStorageSync("remindMinutes"), 10);
    const idx = this.data.remindValues.indexOf(saved);
    this.setData({
      remindMinutes: idx >= 0 ? saved : classReminder.DEFAULT_LEAD_MINUTES,
      remindIndex: idx >= 0 ? idx : this.data.remindValues.indexOf(classReminder.DEFAULT_LEAD_MINUTES),
    });
  },

  onRemindChange(e) {
    const idx = parseInt(e.detail.value, 10) || 0;
    const minutes = this.data.remindValues[idx];
    wx.setStorageSync("remindMinutes", minutes);
    this.setData({ remindIndex: idx, remindMinutes: minutes });
  },

  // 读取当前激活课表 + 课程（写入日历用）
  loadActiveSchedule() {
    return wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getTimetables" } })
      .then((res) => {
        if (!res.result || !res.result.success) {
          throw new Error((res.result && res.result.errMsg) || "读取课表失败");
        }
        const list = res.result.data || [];
        const active = list.find((t) => t._id === app.globalData.activeTimetableId) || list[0];
        if (!active) throw new Error("还没有课表，先去新建一张吧");
        return wx.cloud
          .callFunction({
            name: "quickstartFunctions",
            data: { type: "getCourses", data: { timetableId: active._id } },
          })
          .then((res2) => {
            if (!res2.result || !res2.result.success) {
              throw new Error((res2.result && res2.result.errMsg) || "读取课程失败");
            }
            return { timetable: active, courses: res2.result.data || [] };
          });
      });
  },

  // 一键写入手机日历（系统级提醒）
  syncToCalendar() {
    if (this.data.syncing) return;
    if (typeof wx.addPhoneCalendar !== "function" && typeof wx.addPhoneRepeatCalendar !== "function") {
      wx.showModal({
        title: "无法写入日历",
        content: "当前微信版本不支持写入手机日历，请升级微信后重试。",
        showCancel: false,
      });
      return;
    }
    this.setData({ syncing: true });
    wx.showLoading({ title: "读取课表", mask: true });
    this.loadActiveSchedule()
      .then(({ timetable, courses }) => {
        wx.hideLoading();
        const events = classReminder.buildCalendarEvents(courses, timetable, {
          leadMinutes: this.data.remindMinutes,
        });
        if (events.length === 0) {
          this.setData({ syncing: false });
          wx.showToast({ title: "没有可写入的课程", icon: "none" });
          return;
        }
        const repeatCount = events.filter((ev) => ev.repeat).length;
        wx.showModal({
          title: "同步到手机日历",
          content:
            "将写入 " + events.length + " 条日历事件（其中 " + repeatCount + " 条按周重复），每节课提前 " +
            this.data.remindMinutes + " 分钟提醒。继续吗？",
          confirmText: "写入",
          cancelText: "取消",
          success: (res) => {
            if (res.confirm) this.writeCalendarEvents(events);
            else this.setData({ syncing: false });
          },
        });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ syncing: false });
        wx.showModal({
          title: "提示",
          content: (err && err.message) || "读取课表失败",
          showCancel: false,
        });
      });
  },

  writeCalendarEvents(events) {
    const page = this;
    const total = events.length;
    let done = 0;
    let ok = 0;
    let failed = 0;
    let firstError = "";

    wx.showLoading({ title: "写入 0/" + total, mask: true });

    function next() {
      if (done >= total) {
        wx.hideLoading();
        page.setData({ syncing: false });
        let content = "成功写入 " + ok + " 条日历事件。";
        if (failed > 0) {
          content += "\n失败 " + failed + " 条，多为未授权访问日历，请在手机系统设置中允许微信访问日历后重试。";
          if (firstError) content += "\n（" + firstError + "）";
        }
        wx.showModal({ title: "同步完成", content, showCancel: false });
        return;
      }

      const ev = events[done];
      done += 1;
      wx.showLoading({ title: "写入 " + done + "/" + total, mask: true });

      const onSuccess = function () {
        ok += 1;
        next();
      };
      const onFail = function (err) {
        failed += 1;
        if (!firstError) firstError = (err && err.errMsg) || "";
        next();
      };

      if (ev.repeat && typeof wx.addPhoneRepeatCalendar === "function") {
        wx.addPhoneRepeatCalendar({
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          description: ev.description,
          location: ev.location,
          alarm: true,
          alarmOffset: ev.alarmOffset,
          repeatInterval: "week",
          repeatEndTime: ev.repeatEndTime,
          success: onSuccess,
          fail: onFail,
        });
      } else {
        wx.addPhoneCalendar({
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          description: ev.description,
          location: ev.location,
          alarm: true,
          alarmOffset: ev.alarmOffset,
          success: onSuccess,
          fail: onFail,
        });
      }
    }

    next();
  },

  // 读取服务通知剩余次数（失败不打扰用户）
  loadReminderStatus() {
    this.setData({ reminderStatusLoading: true });
    wx.cloud
      .callFunction({ name: "quickstartFunctions", data: { type: "getReminderStatus" } })
      .then((res) => {
        const data = (res.result && res.result.data) || {};
        const quota = data.quota || 0;
        this.setData({
          reminderStatusLoading: false,
          reminderQuota: quota,
          reminderPending: data.pending || 0,
          reminderStatusText: quota > 0 ? "剩余 " + quota + " 次可发送" : "还没有可发送次数",
        });
      })
      .catch((err) => {
        console.error("[settings] 读取服务通知状态失败", err);
        this.setData({
          reminderStatusLoading: false,
          reminderStatusText: "状态读取失败（云函数可能还没重新部署）",
        });
      });
  },

  // 订阅一次（微信要求必须在点击回调里直接调用）
  subscribeReminder() {
    const templateId = subscribeConfig.TEMPLATE_ID;
    if (!templateId || typeof wx.requestSubscribeMessage !== "function") {
      wx.showModal({
        title: "暂不可用",
        content: "当前微信版本不支持订阅消息，或还没有配置模板 ID。",
        showCancel: false,
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res[templateId] === "accept") {
          this.saveReminderSubscription();
        } else if (res[templateId] === "reject") {
          wx.showToast({ title: "已拒绝，可重新订阅", icon: "none" });
        } else {
          wx.showToast({ title: "未获得授权", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("[settings] requestSubscribeMessage 失败", err);
        const msg = (err && err.errMsg) || "请稍后重试";
        let hint = msg;
        if (msg.indexOf("invalid tmplId") >= 0) {
          hint = "模板 ID 无效或不属于当前小程序，请核对公众平台里的模板 ID";
        } else if (msg.indexOf("TAP") >= 0) {
          hint = "订阅需要用户直接点击按钮触发，请重新点一次";
        }
        wx.showModal({
          title: "订阅失败",
          content: hint + "\n（" + msg + "）",
          showCancel: false,
        });
      },
    });
  },

  // 授权成功后：生成未来 30 天的排期，交给云函数保存
  saveReminderSubscription() {
    wx.showLoading({ title: "排期中", mask: true });
    this.loadActiveSchedule()
      .then(({ timetable, courses }) => {
        const tasks = classReminder.buildSubscribeTasks(courses, timetable, {
          leadMinutes: this.data.remindMinutes,
          days: subscribeConfig.SCHEDULE_DAYS,
          maxTasks: subscribeConfig.MAX_TASKS,
        });
        return wx.cloud.callFunction({
          name: "quickstartFunctions",
          data: {
            type: "subscribeReminder",
            data: {
              timetableId: timetable._id,
              remindMinutes: this.data.remindMinutes,
              tasks,
            },
          },
        });
      })
      .then((res) => {
        wx.hideLoading();
        const result = res && res.result;
        if (result && result.success) {
          const pending = (result.data && result.data.pending) || 0;
          wx.showToast({
            title: pending > 0 ? "已订阅，排期 " + pending + " 条" : "已订阅，暂无待提醒的课",
            icon: "none",
          });
          this.loadReminderStatus();
        } else if (!result) {
          // 旧版云函数还没有 subscribeReminder 分支，调用返回 undefined
          wx.showModal({
            title: "云函数未更新",
            content:
              "云端还是旧版云函数，认不出 subscribeReminder。\n请右键 cloudfunctions/quickstartFunctions → 上传并部署（云端安装依赖），然后重新点订阅。",
            showCancel: false,
          });
        } else {
          let content = result.errMsg || "请稍后重试";
          if (String(content).indexOf("class_reminders") >= 0) {
            content += "\n\n在云开发控制台 → 数据库 → 新建集合 class_reminders（权限：仅创建者可读写）。";
          }
          console.error("[settings] 订阅失败", res);
          wx.showModal({ title: "订阅失败", content, showCancel: false });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        console.error("[settings] 订阅流程异常", err);
        wx.showModal({
          title: "订阅失败",
          content: ((err && err.message) || "读取课表失败") + "\n（可查看调试器 Console 或云函数日志）",
          showCancel: false,
        });
      });
  },

  onShow() {
    // 从其他页返回时刷新自定义背景状态
    const bgImage = wx.getStorageSync("bgImage") || "";
    if (!!bgImage !== this.data.hasCustomBg) {
      this.setData({ hasCustomBg: !!bgImage, bgImage });
    }
    this.loadReminderStatus();
  },

  /**
   * 切换主题
   * - 仅更新主题字段
   * - 若用户已上传自定义背景，则保持原背景不变
   * - 若没有自定义背景，背景将由各页面 loadBg 自动按主题切换
   */
  selectTheme(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.theme) return;
    wx.setStorageSync("theme", value);
    this.setData({ theme: value });
    wx.showToast({
      title: value === "dark" ? "已切换深色主题" : "已切换浅色主题",
      icon: "success",
    });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: "上传中" });
        wx.cloud
          .uploadFile({
            cloudPath: `bg-${Date.now()}.jpg`,
            filePath: tempPath,
          })
          .then((uploadRes) => {
            wx.hideLoading();
            const fileID = uploadRes.fileID;
            wx.setStorageSync("bgImage", fileID);
            this.setData({ bgImage: fileID, hasCustomBg: true });
            wx.showToast({ title: "背景已更新", icon: "success" });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传失败", icon: "none" });
          });
      },
    });
  },

  onOpacityChange(e) {
    const sliderValue = e.detail.value;
    const bgOpacity = sliderValue / 100;
    this.setData({ bgOpacity, sliderValue });
    wx.setStorageSync("bgOpacity", bgOpacity);
  },

  clearBackground() {
    wx.removeStorageSync("bgImage");
    wx.removeStorageSync("bgOpacity");
    this.setData({ bgImage: "", hasCustomBg: false, bgOpacity: 0.5, sliderValue: 50 });
    wx.showToast({ title: "已恢复主题默认背景", icon: "success" });
  },

  selectFontColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ fontColor: color });
    wx.setStorageSync("fontColor", color);
  },

  selectBorderColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ borderColor: color });
    wx.setStorageSync("borderColor", color);
  },

  goProfile() {
    wx.navigateTo({
      url: "/pages/profile/index",
    });
  },
});
