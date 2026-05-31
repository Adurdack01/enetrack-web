export type AppNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "alert" | "warning" | "budget" | "info";
  isRead: boolean;
  createdAt?: string;
  category?: "shared_device_removed" | "monthly_rate_update" | "export_saved";
  targetUid?: string;
  sourceUid?: string;
  familyInvitationId?: string;
  deviceId?: string;
};
