// pages/profile/index.js
Page({
  data: {
    isLogin: false,
    avatarUrl: "",
    nickName: "",
    tempAvatar: "",
    tempNickName: "",
  },

  onLoad(options) {
    this.from = options.from || "";
    this.redirect = options.redirect ? decodeURIComponent(options.redirect) : "";
  },

  onShow() {
    this.loadProfile();
  },

  loadProfile() {
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "getProfile" },
      })
      .then((res) => {
        if (res.result.success && res.result.data) {
          const p = res.result.data;
          if (p.avatarUrl || p.nickName) {
            this.setData({
              isLogin: true,
              avatarUrl: p.avatarUrl || "",
              nickName: p.nickName || "",
            });
            wx.setStorageSync("profile", { avatarUrl: p.avatarUrl, nickName: p.nickName, isLogin: true });
            return;
          }
        }
        const local = wx.getStorageSync("profile");
        if (local && local.isLogin) {
          this.setData({
            isLogin: true,
            avatarUrl: local.avatarUrl || "",
            nickName: local.nickName || "",
          });
        }
      })
      .catch(() => {
        const local = wx.getStorageSync("profile");
        if (local && local.isLogin) {
          this.setData({
            isLogin: true,
            avatarUrl: local.avatarUrl || "",
            nickName: local.nickName || "",
          });
        }
      });
  },

  // 选择头像（微信头像选择器，默认显示微信头像）
  onChooseAvatar(e) {
    this.setData({ tempAvatar: e.detail.avatarUrl });
  },

  onNickInput(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  onNickBlur(e) {
    // 微信昵称输入框失焦时会自动填充微信昵称
    if (e.detail.value) {
      this.setData({ tempNickName: e.detail.value });
    }
  },

  // 保存并登录
  doLogin() {
    const { tempAvatar, tempNickName } = this.data;
    if (!tempAvatar || !tempNickName) return;

    wx.showLoading({ title: "登录中" });
    // 头像上传云存储
    if (tempAvatar.startsWith("http")) {
      wx.cloud
        .uploadFile({
          cloudPath: `avatar-${Date.now()}.jpg`,
          filePath: tempAvatar,
        })
        .then((uploadRes) => {
          wx.hideLoading();
          this.finishLogin(uploadRes.fileID, tempNickName);
        })
        .catch(() => {
          wx.hideLoading();
          // 上传失败仍用临时URL
          this.finishLogin(tempAvatar, tempNickName);
        });
    } else {
      // cloud:// 格式直接使用
      wx.hideLoading();
      this.finishLogin(tempAvatar, tempNickName);
    }
  },

  finishLogin(avatarUrl, nickName) {
    const profile = { avatarUrl, nickName };
    wx.setStorageSync("profile", { ...profile, isLogin: true });
    this.setData({ isLogin: true, avatarUrl, nickName, tempAvatar: "", tempNickName: "" });
    wx.cloud
      .callFunction({
        name: "quickstartFunctions",
        data: { type: "saveProfile", data: profile },
      })
      .then((res) => {
        if (res.result.success) {
          wx.showToast({ title: "登录成功", icon: "success" });
          // 首次启动登录后跳转到指定页面（一般是新建课表）
          if (this.redirect) {
            setTimeout(() => {
              wx.redirectTo({ url: this.redirect });
            }, 1200);
          }
        }
      });
  },

  // 重新设置
  reLogin() {
    this.setData({
      isLogin: false,
      avatarUrl: "",
      nickName: "",
      tempAvatar: "",
      tempNickName: "",
    });
    wx.removeStorageSync("profile");
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "确定要退出吗？",
      success: (r) => {
        if (!r.confirm) return;
        wx.removeStorageSync("profile");
        this.setData({
          isLogin: false,
          avatarUrl: "",
          nickName: "",
          tempAvatar: "",
          tempNickName: "",
        });
        wx.showToast({ title: "已退出", icon: "success" });
      },
    });
  },
});
