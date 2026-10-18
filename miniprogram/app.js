App({
  globalData: {
    activeTimetableId: null,
  },
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: "cloud1-d6gz4okgv3c630e15",
        traceUser: true,
      });
    }

  },

  /**
   * 解析背景配置：优先使用用户自定义背景，否则根据当前主题返回默认背景
   * @returns {{bgImage: string, bgOpacity: number, isDefault: boolean, theme: string}}
   */
  resolveBackground() {
    const customBg = wx.getStorageSync("bgImage");
    if (customBg) {
      const opacity = wx.getStorageSync("bgOpacity");
      return {
        bgImage: customBg,
        bgOpacity: opacity !== "" && opacity !== undefined && opacity !== null
          ? parseFloat(opacity) : 0.5,
        isDefault: false,
        theme: wx.getStorageSync("theme") || "light",
      };
    }
    const theme = wx.getStorageSync("theme") || "light";
    return {
      bgImage: theme === "dark" ? "/images/black.jpg" : "/images/white.jpg",
      bgOpacity: 1,
      isDefault: true,
      theme,
    };
  },
});
