export {
  setupNotificationHandler,
  setupAndroidChannels,
  requestNotificationPermissions,
  requestNotificationPermissionOutcome,
  type NotificationPermissionOutcome,
  scheduleDailyReminder,
  cancelDailyReminder,
  registerPushToken,
  deactivatePushToken,
  getCachedPushToken,
} from './notificationService';
