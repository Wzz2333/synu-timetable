// pages/settings/index.js
const app = getApp();

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
  },

  onShow() {
    // 从其他页返回时刷新自定义背景状态
    const bgImage = wx.getStorageSync("bgImage") || "";
    if (!!bgImage !== this.data.hasCustomBg) {
      this.setData({ hasCustomBg: !!bgImage, bgImage });
    }
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
