import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AppNotification } from "@/types/notification";
import type { FamilyInvitation } from "@/types/family";

type Props = {
  open: boolean;
  notifications: AppNotification[];
  invitations?: FamilyInvitation[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onRemoveNotification: (notificationId: string) => void;
  onClearNotifications: () => void;
  onAcceptInvitation?: (invitation: FamilyInvitation) => void;
  onDeclineInvitation?: (invitation: FamilyInvitation) => void;
};

function getNotificationTimeMs(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : null;
}

function formatNotificationTime(
  notification: AppNotification,
  nowMs: number
) {
  const createdAtMs = getNotificationTimeMs(notification.createdAt);

  if (createdAtMs == null) {
    return notification.time || "Recently";
  }

  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < minuteMs) return "Just now";
  if (elapsedMs < hourMs) {
    const minutes = Math.floor(elapsedMs / minuteMs);
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsedMs < 2 * dayMs) return "Yesterday";
  if (elapsedMs < 7 * dayMs) {
    const days = Math.floor(elapsedMs / dayMs);
    return `${days} days ago`;
  }

  return new Date(createdAtMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NotificationsModal({
  open,
  notifications,
  invitations = [],
  onClose,
  onMarkAllRead,
  onRemoveNotification,
  onClearNotifications,
  onAcceptInvitation,
  onDeclineInvitation,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === "pending"
  );

  useEffect(() => {
    if (!open) return;

    setNowMs(Date.now());

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40">
      <div className="mt-auto w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-[32px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Notifications
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alerts and updates from your devices.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-medium text-emerald-600"
          >
            Mark all as read
          </button>

          <button
            type="button"
            onClick={onClearNotifications}
            className="text-xs font-medium text-red-500"
          >
            Clear all
          </button>
        </div>

        <div className="space-y-3">
          {pendingInvitations.map((invitation) => (
            <div
              key={invitation.id}
              className="rounded-2xl bg-sky-50 p-4 dark:bg-sky-950/40"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Device invitation
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {invitation.ownerName} invited you to access{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {invitation.deviceNames.join(", ") || "a smart plug"}
                </span>{" "}
                with {invitation.permission} access.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDeclineInvitation?.(invitation)}
                  className="rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 dark:border-sky-900 dark:bg-slate-950 dark:text-slate-300"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => onAcceptInvitation?.(invitation)}
                  className="rounded-full bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
                >
                  Accept
                </button>
              </div>
            </div>
          ))}

          {notifications.length === 0 && pendingInvitations.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              No notifications right now.
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl p-4 ${
                  item.isRead
                    ? "bg-slate-50 dark:bg-slate-950"
                    : "bg-emerald-50 dark:bg-emerald-900/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.message}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {formatNotificationTime(item, nowMs)}
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    {!item.isRead && (
                      <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveNotification(item.id)}
                      className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/80 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label={`Remove notification ${item.title}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
