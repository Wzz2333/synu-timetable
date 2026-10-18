// components/background/index.js
const app = getApp();

Component({
  data: {
    bgImage: "",
    bgOpacity: 0,
  },

  lifetimes: {
    attached() {
      this.loadSettings();
    },
  },

  pageLifetimes: {
    show() {
      this.loadSettings();
    },
  },

  methods: {
    loadSettings() {
      const { bgImage, bgOpacity } = app.resolveBackground();
      this.setData({ bgImage, bgOpacity });
    },
  },
});
