// config/subscribe.js
// 微信订阅消息（服务通知）配置
// 模板在 微信公众平台 → 订阅消息 → 我的模板 中创建，字段名需与云函数里的 SUBSCRIBE_FIELDS 保持一致
module.exports = {
  TEMPLATE_ID: "pYTJQ7vfPxbqXX-P7UmX69E5QDa_2gaET9BrC54o1l8",
  // 排期天数：只为未来 N 天内要上的课排提醒
  SCHEDULE_DAYS: 30,
  // 一次最多排期多少条（避免一次写入太多记录）
  MAX_TASKS: 30,
};
