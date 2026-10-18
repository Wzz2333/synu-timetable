// pages/changelog/index.js
// 更新日志页：数据来自 config/changelog.js，以后每次更新在那边加一条
const app = getApp();
const changelog = require("../../config/changelog");

const TYPE_LABELS = {
  new: "新增",
  improve: "优化",
  remove: "移除",
};

Page({
  data: {
    versions: [],
    bgImage: "",
    bgOpacity: 0,
  },

  onLoad() {
    this.loadBg();
    const versions = (changelog || []).map((entry) => ({
      version: entry.version || "更新",
      date: entry.date || "",
      current: !!entry.current,
      items: (entry.items || []).map((item) => {
        const isText = typeof item === "string";
        const type = isText ? "improve" : item.type || "improve";
        return {
          text: isText ? item : item.text,
          type,
          typeLabel: TYPE_LABELS[type] || "优化",
        };
      }),
    }));
    this.setData({ versions });
  },

  onShow() {
    this.loadBg();
  },

  loadBg() {
    const { bgImage, bgOpacity } = app.resolveBackground();
    this.setData({ bgImage, bgOpacity });
  },
});
