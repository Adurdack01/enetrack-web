export type Permission = "View Only" | "View + Control" | "Full Access";

export type FamilyInviteStatus = "pending" | "accepted" | "declined" | "revoked";

export type FamilyMember = {
  id: string;
  name: string;
  email: string;
  relationship: string;
  permission: Permission;
  deviceIds: string[];
  isOwner?: boolean;
  inviteId?: string;
  inviteStatus?: FamilyInviteStatus;
  invitedAt?: string;
  acceptedAt?: string | null;
};

export type FamilyInvitation = {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  toEmail: string;
  toName: string;
  relationship: string;
  permission: Permission;
  deviceIds: string[];
  deviceNames: string[];
  electricityRate: number;
  electricityRateUpdatedAt?: string;
  status: FamilyInviteStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string | null;
  respondedByUid?: string | null;
  respondedByEmail?: string | null;
};

export type DeviceShare = {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  inviteeUid: string;
  inviteeEmail: string;
  invitationId: string;
  deviceId: string;
  permission: Permission;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
};
