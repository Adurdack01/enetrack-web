import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { AppNotification } from "@/types/notification";

const ENERTRACK_NOTIFICATION_CHANNEL_ID = "enertrack-alerts-bell";
const ENERTRACK_NOTIFICATION_SOUND = "enertrack_bell.wav";
let channelReady = false;

function isNativeNotificationPlatform() {
  return Capacitor.isNativePlatform();
}

function stableNumericNotificationId(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return (Math.abs(hash) % 2147483646) + 1;
}

async function ensureNotificationChannel() {
  if (channelReady || Capacitor.getPlatform() !== "android") {
    return;
  }

  await LocalNotifications.createChannel({
    id: ENERTRACK_NOTIFICATION_CHANNEL_ID,
    name: "EnerTrack Alerts",
    description: "Device, sharing, budget, and safety notifications.",
    sound: ENERTRACK_NOTIFICATION_SOUND,
    importance: 4,
    visibility: 1,
    lights: true,
    vibration: true,
  });

  channelReady = true;
}

export async function ensureNativeNotificationPermission() {
  if (!isNativeNotificationPlatform()) {
    return true;
  }

  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") {
    return true;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function showNativeNotification(notification: AppNotification) {
  if (!isNativeNotificationPlatform()) {
    return false;
  }

  const granted = await ensureNativeNotificationPermission();
  if (!granted) {
    return false;
  }

  await ensureNotificationChannel();

  await LocalNotifications.schedule({
    notifications: [
      {
        id: stableNumericNotificationId(notification.id),
        title: notification.title,
        body: notification.message,
        largeBody: notification.message,
        sound: ENERTRACK_NOTIFICATION_SOUND,
        smallIcon: "ic_stat_enertrack",
        iconColor: "#863BFF",
        channelId: ENERTRACK_NOTIFICATION_CHANNEL_ID,
        group: "enertrack",
        extra: {
          notificationId: notification.id,
          type: notification.type,
          category: notification.category,
          deviceId: notification.deviceId,
        },
      },
    ],
  });

  return true;
}
