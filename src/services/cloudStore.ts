import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb } from "@/services/firebase";
import type { Device } from "@/types/device";
import type {
  DeviceClaimRecord,
  DeviceCommand,
  DeviceReading,
} from "@/types/esp32Bridge";
import type { ExportRecord } from "@/types/exportRecord";
import type {
  DeviceShare,
  FamilyInvitation,
  FamilyMember,
} from "@/types/family";
import type { AppNotification } from "@/types/notification";
import type { OfflineSyncBatch } from "@/types/offlineSync";
import type { ElectricityRateSettings, UserProfile } from "@/types/settings";
import type { UsageHistoryEntry } from "@/types/usageHistory";
import type { UsageLog } from "@/types/usageLog";

export type UserPreferences = {
  darkMode: boolean;
  pushNotificationsEnabled: boolean;
  homeSelectedDeviceId: string;
};

type CloudHandlers = {
  onProfile: (profile: UserProfile) => void;
  onPreferences: (preferences: UserPreferences) => void;
  onElectricityRate: (settings: ElectricityRateSettings) => void;
  onDevices: (devices: Device[]) => void;
  onFamilyMembers: (members: FamilyMember[]) => void;
  onUsageLogs?: (logs: UsageLog[]) => void;
  onNotifications: (notifications: AppNotification[]) => void;
  onExportRecords: (records: ExportRecord[]) => void;
  onOfflineSyncBatches: (batches: OfflineSyncBatch[]) => void;
};

const COLLECTIONS = {
  devices: "devices",
  familyMembers: "familyMembers",
  usageHistory: "usageHistory",
  usageLogs: "usageLogs",
  notifications: "notifications",
  exportRecords: "exportRecords",
  offlineSyncBatches: "offlineSyncBatches",
  deviceClaims: "deviceClaims",
} as const;

const ROOT_COLLECTIONS = {
  familyInvitations: "familyInvitations",
  deviceShares: "deviceShares",
} as const;

function normalizePersistedEnergyValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(4))
    : null;
}

function serializeDeviceForCloud(device: Device): Device {
  const { telemetryStale, telemetryReceivedAt, ...persistedDevice } = device;
  const rawEnergyTotal =
    normalizePersistedEnergyValue(device.rawEnergyTotal) ??
    normalizePersistedEnergyValue(device.energy) ??
    0;

  return {
    ...persistedDevice,
    energy: rawEnergyTotal,
    rawEnergyTotal,
    energyBaselineKwh:
      normalizePersistedEnergyValue(device.energyBaselineKwh) ?? null,
    energyCarryoverKwh:
      normalizePersistedEnergyValue(device.energyCarryoverKwh) ?? 0,
    energyBaselinePending: Boolean(device.energyBaselinePending),
  };
}

function requireDb() {
  if (!firebaseDb) {
    throw new Error("Firebase is not configured.");
  }

  return firebaseDb;
}

function userDoc(uid: string, section: string, id: string) {
  return doc(requireDb(), "users", uid, section, id);
}

function userRootDoc(uid: string) {
  return doc(requireDb(), "users", uid);
}

function rootDoc(section: string, id: string) {
  return doc(requireDb(), section, id);
}

function rootCollection(section: string) {
  return collection(requireDb(), section);
}

function userCollection(uid: string, section: string) {
  return collection(requireDb(), "users", uid, section);
}

function deviceSubDoc(
  uid: string,
  deviceId: string,
  section: "readings" | "commands",
  id: string
) {
  return doc(requireDb(), "users", uid, "devices", deviceId, section, id);
}

function deviceSubCollection(
  uid: string,
  deviceId: string,
  section: "readings" | "commands"
) {
  return collection(requireDb(), "users", uid, "devices", deviceId, section);
}

function readCollection<T extends { id: string }>(
  uid: string,
  section: string,
  onChange: (items: T[]) => void,
  sort?: (a: T, b: T) => number
): Unsubscribe {
  return onSnapshot(userCollection(uid, section), (snapshot) => {
    const items = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as T[];

    onChange(sort ? [...items].sort(sort) : items);
  });
}

function sortByDateDesc<T extends { date?: string; createdAt?: string }>(
  a: T,
  b: T
) {
  const aDate = new Date(a.date ?? a.createdAt ?? 0).getTime();
  const bDate = new Date(b.date ?? b.createdAt ?? 0).getTime();

  return bDate - aDate;
}

function sortOfflineBatches(a: OfflineSyncBatch, b: OfflineSyncBatch) {
  const aDate = new Date(a.syncedAt ?? a.endedAt ?? a.startedAt).getTime();
  const bDate = new Date(b.syncedAt ?? b.endedAt ?? b.startedAt).getTime();

  return bDate - aDate;
}

async function deleteCollection(uid: string, section: string) {
  const snapshot = await getDocs(userCollection(uid, section));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

async function deleteDeviceSubcollection(
  uid: string,
  deviceId: string,
  section: "readings" | "commands"
) {
  const snapshot = await getDocs(deviceSubCollection(uid, deviceId, section));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

async function deleteDevicesWithSubcollections(uid: string) {
  const snapshot = await getDocs(userCollection(uid, COLLECTIONS.devices));

  await Promise.all(
    snapshot.docs.map(async (item) => {
      await deleteCloudDeviceBridgeData(uid, item.id);
      await deleteDoc(item.ref);
    })
  );
}

async function deleteUserDeviceClaims(uid: string) {
  const snapshot = await getDocs(userCollection(uid, COLLECTIONS.deviceClaims));

  await Promise.all(
    snapshot.docs.map((item) =>
      Promise.all([
        deleteDoc(item.ref),
        deleteDoc(rootDoc("esp32DeviceClaims", item.id)),
      ])
    )
  );
}

async function deleteRootCollectionMatches(
  section: string,
  fieldName: string,
  value: string
) {
  const snapshot = await getDocs(
    query(rootCollection(section), where(fieldName, "==", value))
  );

  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

export function subscribeUserCloudData(
  uid: string,
  handlers: CloudHandlers
): Unsubscribe {
  const unsubscribers: Unsubscribe[] = [
    onSnapshot(userDoc(uid, "profile", "current"), (snapshot) => {
      if (snapshot.exists()) {
        handlers.onProfile(snapshot.data() as UserProfile);
      }
    }),
    onSnapshot(userDoc(uid, "settings", "preferences"), (snapshot) => {
      if (snapshot.exists()) {
        handlers.onPreferences(snapshot.data() as UserPreferences);
      }
    }),
    onSnapshot(userDoc(uid, "settings", "electricityRate"), (snapshot) => {
      if (snapshot.exists()) {
        handlers.onElectricityRate(snapshot.data() as ElectricityRateSettings);
      }
    }),
    readCollection<Device>(
      uid,
      COLLECTIONS.devices,
      handlers.onDevices,
      (a, b) => a.name.localeCompare(b.name)
    ),
    readCollection<FamilyMember>(
      uid,
      COLLECTIONS.familyMembers,
      handlers.onFamilyMembers,
      (a, b) => a.name.localeCompare(b.name)
    ),
    readCollection<AppNotification>(
      uid,
      COLLECTIONS.notifications,
      handlers.onNotifications,
      sortByDateDesc
    ),
    readCollection<ExportRecord>(
      uid,
      COLLECTIONS.exportRecords,
      handlers.onExportRecords,
      sortByDateDesc
    ),
    readCollection<OfflineSyncBatch>(
      uid,
      COLLECTIONS.offlineSyncBatches,
      handlers.onOfflineSyncBatches,
      sortOfflineBatches
    ),
  ];

  if (handlers.onUsageLogs) {
    unsubscribers.push(
      readCollection<UsageLog>(
        uid,
        COLLECTIONS.usageLogs,
        handlers.onUsageLogs,
        sortByDateDesc
      )
    );
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function subscribeCloudUsageLogs(
  uid: string,
  onChange: (logs: UsageLog[]) => void
): Unsubscribe {
  return readCollection<UsageLog>(
    uid,
    COLLECTIONS.usageLogs,
    onChange,
    sortByDateDesc
  );
}

export function subscribeCloudUsageHistory(
  uid: string,
  onChange: (entries: UsageHistoryEntry[]) => void
): Unsubscribe {
  return readCollection<UsageHistoryEntry>(
    uid,
    COLLECTIONS.usageHistory,
    onChange,
    sortByDateDesc
  );
}

export async function saveUserProfile(uid: string, profile: UserProfile) {
  const updatedAt = new Date().toISOString();

  await Promise.all([
    setDoc(
      userRootDoc(uid),
      {
        uid,
        ...profile,
        updatedAt,
      },
      { merge: true }
    ),
    setDoc(userDoc(uid, "profile", "current"), profile, { merge: true }),
  ]);
}

export async function saveUserPreferences(
  uid: string,
  preferences: UserPreferences
) {
  await setDoc(userDoc(uid, "settings", "preferences"), preferences, {
    merge: true,
  });
}

export async function saveElectricityRateSettings(
  uid: string,
  settings: ElectricityRateSettings
) {
  await setDoc(userDoc(uid, "settings", "electricityRate"), settings, {
    merge: true,
  });
}

async function createUserDocIfMissing(
  uid: string,
  section: string,
  id: string,
  data: Record<string, unknown>
) {
  const targetDoc = userDoc(uid, section, id);
  const snapshot = await getDoc(targetDoc);

  if (!snapshot.exists()) {
    await setDoc(targetDoc, data, { merge: true });
  }
}

export async function ensureUserCloudDefaults(
  uid: string,
  profile: UserProfile,
  preferences: UserPreferences,
  electricityRate: ElectricityRateSettings
) {
  await Promise.all([
    saveUserProfile(uid, profile),
    createUserDocIfMissing(uid, "settings", "preferences", preferences),
    createUserDocIfMissing(
      uid,
      "settings",
      "electricityRate",
      electricityRate
    ),
  ]);
}

export async function saveCloudDevice(uid: string, device: Device) {
  await setDoc(
    userDoc(uid, COLLECTIONS.devices, device.id),
    serializeDeviceForCloud(device),
    {
      merge: true,
    }
  );
}

export async function findCloudDevicesByEsp32Id(uid: string, esp32Id: string) {
  const snapshot = await getDocs(
    query(
      userCollection(uid, COLLECTIONS.devices),
      where("esp32Id", "==", esp32Id)
    )
  );

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as Device[];
}

export async function saveCloudDeviceClaim(
  uid: string,
  claim: DeviceClaimRecord
) {
  await Promise.all([
    setDoc(userDoc(uid, COLLECTIONS.deviceClaims, claim.id), claim, {
      merge: true,
    }),
    setDoc(rootDoc("esp32DeviceClaims", claim.id), claim, { merge: true }),
  ]);
}

export async function deleteCloudDeviceClaim(uid: string, claimId: string) {
  await Promise.all([
    deleteDoc(userDoc(uid, COLLECTIONS.deviceClaims, claimId)),
    deleteDoc(rootDoc("esp32DeviceClaims", claimId)),
  ]);
}

export function subscribeCloudDeviceReadings(
  uid: string,
  deviceId: string,
  onChange: (readings: DeviceReading[]) => void,
  maxReadings = 50
): Unsubscribe {
  const readingsQuery = query(
    deviceSubCollection(uid, deviceId, "readings"),
    orderBy("timestamp", "desc"),
    limit(maxReadings)
  );

  return onSnapshot(readingsQuery, (snapshot) => {
    const readings = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as DeviceReading[];

    onChange(readings);
  });
}

export function subscribeCloudDeviceCommands(
  uid: string,
  deviceId: string,
  onChange: (commands: DeviceCommand[]) => void,
  maxCommands = 20
): Unsubscribe {
  const commandsQuery = query(
    deviceSubCollection(uid, deviceId, "commands"),
    orderBy("requestedAt", "desc"),
    limit(maxCommands)
  );

  return onSnapshot(commandsQuery, (snapshot) => {
    const commands = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as DeviceCommand[];

    onChange(commands);
  });
}

export async function saveCloudDeviceReading(
  uid: string,
  reading: DeviceReading
) {
  await setDoc(
    deviceSubDoc(uid, reading.deviceId, "readings", reading.id),
    reading,
    { merge: true }
  );
}

export async function saveCloudDeviceCommand(
  uid: string,
  command: DeviceCommand
) {
  await setDoc(
    deviceSubDoc(uid, command.deviceId, "commands", command.id),
    command,
    { merge: true }
  );
}

export async function deleteCloudDeviceBridgeData(
  uid: string,
  deviceId: string
) {
  await Promise.all([
    deleteDeviceSubcollection(uid, deviceId, "readings"),
    deleteDeviceSubcollection(uid, deviceId, "commands"),
  ]);
}

export async function deleteCloudDevice(uid: string, deviceId: string) {
  await deleteCloudDeviceBridgeData(uid, deviceId);
  await deleteDoc(userDoc(uid, COLLECTIONS.devices, deviceId));
}

export async function deleteCloudOfflineSyncBatchesForDevice(
  uid: string,
  deviceId: string
) {
  const snapshot = await getDocs(userCollection(uid, COLLECTIONS.offlineSyncBatches));
  const matches = snapshot.docs.filter(
    (item) => item.data().deviceId === deviceId
  );

  await Promise.all(matches.map((item) => deleteDoc(item.ref)));
}

export async function deleteCloudDeviceAliases(
  uid: string,
  deviceIds: string[]
) {
  const uniqueDeviceIds = [...new Set(deviceIds.filter(Boolean))];
  if (!uniqueDeviceIds.length) {
    return;
  }

  const deviceIdSet = new Set(uniqueDeviceIds);
  const familyMemberSnapshot = await getDocs(
    userCollection(uid, COLLECTIONS.familyMembers)
  );
  const familyMembersToUpdate = familyMemberSnapshot.docs.filter((item) => {
    const member = item.data() as FamilyMember;
    return (
      !member.isOwner &&
      member.deviceIds.some((memberDeviceId) => deviceIdSet.has(memberDeviceId))
    );
  });

  await Promise.all([
    ...uniqueDeviceIds.map((deviceId) => deleteCloudDevice(uid, deviceId)),
    ...uniqueDeviceIds.map((deviceId) =>
      deleteCloudOfflineSyncBatchesForDevice(uid, deviceId)
    ),
    ...familyMembersToUpdate.map(async (item) => {
      const member = item.data() as FamilyMember;
      const nextMember = {
        ...member,
        deviceIds: member.deviceIds.filter(
          (memberDeviceId) => !deviceIdSet.has(memberDeviceId)
        ),
      };

      if (nextMember.deviceIds.length > 0) {
        await setDoc(item.ref, nextMember, { merge: true });
        return;
      }

      await deleteDoc(item.ref);
    }),
  ]);
}

export async function saveCloudFamilyMember(
  uid: string,
  member: FamilyMember
) {
  await setDoc(userDoc(uid, COLLECTIONS.familyMembers, member.id), member, {
    merge: true,
  });
}

export async function deleteCloudFamilyMember(uid: string, memberId: string) {
  await deleteDoc(userDoc(uid, COLLECTIONS.familyMembers, memberId));
}

function sortFamilyInvitations(a: FamilyInvitation, b: FamilyInvitation) {
  const aDate = new Date(a.updatedAt ?? a.createdAt).getTime();
  const bDate = new Date(b.updatedAt ?? b.createdAt).getTime();

  return bDate - aDate;
}

function computeSharedCost(energy: number, electricityRate: number) {
  return Number((Number(energy.toFixed(3)) * electricityRate).toFixed(2));
}

function deviceShareId(ownerUid: string, deviceId: string, inviteeUid: string) {
  return `${ownerUid}_${deviceId}_${inviteeUid}`;
}

export function subscribeIncomingFamilyInvitations(
  email: string,
  onChange: (invitations: FamilyInvitation[]) => void
): Unsubscribe {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    onChange([]);
    return () => {};
  }

  const inviteQuery = query(
    rootCollection(ROOT_COLLECTIONS.familyInvitations),
    where("toEmail", "==", normalizedEmail)
  );

  return onSnapshot(inviteQuery, (snapshot) => {
    const invitations = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as FamilyInvitation[];

    onChange([...invitations].sort(sortFamilyInvitations));
  });
}

export function subscribeSentFamilyInvitations(
  ownerUid: string,
  onChange: (invitations: FamilyInvitation[]) => void
): Unsubscribe {
  const inviteQuery = query(
    rootCollection(ROOT_COLLECTIONS.familyInvitations),
    where("ownerUid", "==", ownerUid)
  );

  return onSnapshot(inviteQuery, (snapshot) => {
    const invitations = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as FamilyInvitation[];

    onChange([...invitations].sort(sortFamilyInvitations));
  });
}

export async function saveCloudFamilyInvitation(
  invitation: FamilyInvitation
) {
  await setDoc(
    rootDoc(ROOT_COLLECTIONS.familyInvitations, invitation.id),
    invitation,
    { merge: true }
  );
}

export async function updateCloudFamilyInvitationStatus(
  invitation: FamilyInvitation,
  status: FamilyInvitation["status"],
  responder?: { uid: string; email: string }
) {
  const now = new Date().toISOString();

  await setDoc(
    rootDoc(ROOT_COLLECTIONS.familyInvitations, invitation.id),
    {
      status,
      updatedAt: now,
      respondedAt: status === "pending" ? null : now,
      respondedByUid: responder?.uid ?? invitation.respondedByUid ?? null,
      respondedByEmail:
        responder?.email?.trim().toLowerCase() ??
        invitation.respondedByEmail ??
        null,
    },
    { merge: true }
  );
}

export async function saveCloudDeviceSharesForInvitation(
  invitation: FamilyInvitation,
  inviteeUid: string,
  inviteeEmail: string
) {
  const now = new Date().toISOString();
  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  await Promise.all(
    invitation.deviceIds.map((deviceId) => {
      const share: DeviceShare = {
        id: deviceShareId(invitation.ownerUid, deviceId, inviteeUid),
        ownerUid: invitation.ownerUid,
        ownerEmail: invitation.ownerEmail,
        inviteeUid,
        inviteeEmail: normalizedEmail,
        invitationId: invitation.id,
        deviceId,
        permission: invitation.permission,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      return setDoc(rootDoc(ROOT_COLLECTIONS.deviceShares, share.id), share, {
        merge: true,
      });
    })
  );
}

export async function revokeCloudDeviceSharesForInvitation(
  invitation: FamilyInvitation
) {
  const snapshot = await getDocs(
    query(
      rootCollection(ROOT_COLLECTIONS.deviceShares),
      where("invitationId", "==", invitation.id)
    )
  );
  const now = new Date().toISOString();

  await Promise.all(
    snapshot.docs.map((item) =>
      setDoc(
        item.ref,
        {
          status: "revoked",
          updatedAt: now,
        },
        { merge: true }
      )
    )
  );
}

export function subscribeCloudSharedDevices(
  invitations: FamilyInvitation[],
  inviteeUid: string,
  onChange: (devices: Device[]) => void
): Unsubscribe {
  const acceptedInvitations = invitations.filter(
    (invitation) =>
      invitation.status === "accepted" &&
      invitation.respondedByUid === inviteeUid
  );
  const subscriptions: Unsubscribe[] = [];
  const deviceMap = new Map<string, Device>();

  if (!acceptedInvitations.length) {
    onChange([]);
    return () => {};
  }

  const emit = () => {
    onChange(
      [...deviceMap.values()].sort((a, b) => a.name.localeCompare(b.name))
    );
  };

  acceptedInvitations.forEach((invitation) => {
    invitation.deviceIds.forEach((deviceId) => {
      const mapKey = `${invitation.ownerUid}:${deviceId}`;
      const unsubscribe = onSnapshot(
        userDoc(invitation.ownerUid, COLLECTIONS.devices, deviceId),
        (snapshot) => {
          if (!snapshot.exists()) {
            deviceMap.delete(mapKey);
            emit();
            return;
          }

          deviceMap.set(mapKey, {
            ...(snapshot.data() as Device),
            id: snapshot.id,
            ownerUid: invitation.ownerUid,
            ownerEmail: invitation.ownerEmail,
            isShared: true,
            sharedOwnerUid: invitation.ownerUid,
            sharedByName: invitation.ownerName,
            sharedByEmail: invitation.ownerEmail,
            accessPermission: invitation.permission,
            familyInvitationId: invitation.id,
            sharedElectricityRate: Number.isFinite(invitation.electricityRate)
              ? invitation.electricityRate
              : 0,
            sharedElectricityRateUpdatedAt: invitation.electricityRateUpdatedAt,
          });
          emit();
        }
      );

      subscriptions.push(unsubscribe);
    });
  });

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export function subscribeCloudSharedUsageData(
  invitations: FamilyInvitation[],
  inviteeUid: string,
  onHistoryChange: (entries: UsageHistoryEntry[]) => void
): Unsubscribe {
  const acceptedInvitations = invitations.filter(
    (invitation) =>
      invitation.status === "accepted" &&
      invitation.respondedByUid === inviteeUid
  );
  const subscriptions: Unsubscribe[] = [];
  const historyByScope = new Map<string, UsageHistoryEntry[]>();

  const emitHistory = () => {
    onHistoryChange(
      [...historyByScope.values()]
        .flat()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );
  };

  if (!acceptedInvitations.length) {
    onHistoryChange([]);
    return () => {};
  }

  acceptedInvitations.forEach((invitation) => {
    invitation.deviceIds.forEach((deviceId) => {
      const scopeKey = `${invitation.ownerUid}:${deviceId}`;
      const rate = Number.isFinite(invitation.electricityRate)
        ? invitation.electricityRate
        : 0;
      const historyQuery = query(
        userCollection(invitation.ownerUid, COLLECTIONS.usageHistory),
        where("deviceId", "==", deviceId)
      );

      subscriptions.push(
        onSnapshot(historyQuery, (snapshot) => {
          historyByScope.set(
            scopeKey,
            snapshot.docs.map((item) => {
              const entry = {
                ...(item.data() as UsageHistoryEntry),
                id: `${invitation.ownerUid}:${item.id}`,
              };

              return {
                ...entry,
                id: `${invitation.ownerUid}:${item.id}`,
                electricityRate: rate,
                cost: computeSharedCost(entry.energy, rate),
              };
            })
          );
          emitHistory();
        })
      );
    });
  });

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export async function saveCloudUsageLog(uid: string, log: UsageLog) {
  await setDoc(userDoc(uid, COLLECTIONS.usageLogs, log.id), log, {
    merge: true,
  });
}

export async function saveCloudUsageHistoryEntry(
  uid: string,
  entry: UsageHistoryEntry
) {
  await setDoc(userDoc(uid, COLLECTIONS.usageHistory, entry.id), entry, {
    merge: true,
  });
}

export async function deleteCloudUsageLog(uid: string, logId: string) {
  await deleteDoc(userDoc(uid, COLLECTIONS.usageLogs, logId));
}

export async function clearCloudUsageLogs(uid: string) {
  await deleteCollection(uid, COLLECTIONS.usageLogs);
}

export async function saveCloudNotification(
  uid: string,
  notification: AppNotification
) {
  await setDoc(
    userDoc(uid, COLLECTIONS.notifications, notification.id),
    notification,
    { merge: true }
  );
}

export async function saveCloudNotifications(
  uid: string,
  notifications: AppNotification[]
) {
  await Promise.all(
    notifications.map((notification) =>
      saveCloudNotification(uid, notification)
    )
  );
}

export async function deleteCloudNotification(uid: string, notificationId: string) {
  await deleteDoc(userDoc(uid, COLLECTIONS.notifications, notificationId));
}

export async function clearCloudNotifications(uid: string) {
  await deleteCollection(uid, COLLECTIONS.notifications);
}

export async function saveCloudExportRecord(uid: string, record: ExportRecord) {
  await setDoc(userDoc(uid, COLLECTIONS.exportRecords, record.id), record, {
    merge: true,
  });
}

export async function deleteCloudExportRecord(uid: string, recordId: string) {
  await deleteDoc(userDoc(uid, COLLECTIONS.exportRecords, recordId));
}

export async function clearCloudExportRecords(uid: string) {
  await deleteCollection(uid, COLLECTIONS.exportRecords);
}

export async function saveOfflineSyncBatch(
  uid: string,
  batch: OfflineSyncBatch
) {
  await setDoc(userDoc(uid, COLLECTIONS.offlineSyncBatches, batch.id), batch, {
    merge: true,
  });
}

export async function deleteUserCloudData(uid: string) {
  await deleteDevicesWithSubcollections(uid);
  await deleteUserDeviceClaims(uid);
  await Promise.all([
    deleteRootCollectionMatches(
      ROOT_COLLECTIONS.familyInvitations,
      "ownerUid",
      uid
    ),
    deleteRootCollectionMatches(
      ROOT_COLLECTIONS.familyInvitations,
      "respondedByUid",
      uid
    ),
    deleteRootCollectionMatches(ROOT_COLLECTIONS.deviceShares, "ownerUid", uid),
    deleteRootCollectionMatches(
      ROOT_COLLECTIONS.deviceShares,
      "inviteeUid",
      uid
    ),
  ]);

  await Promise.all([
    deleteCollection(uid, COLLECTIONS.familyMembers),
    deleteCollection(uid, COLLECTIONS.usageHistory),
    deleteCollection(uid, COLLECTIONS.usageLogs),
    deleteCollection(uid, COLLECTIONS.notifications),
    deleteCollection(uid, COLLECTIONS.exportRecords),
    deleteCollection(uid, COLLECTIONS.offlineSyncBatches),
  ]);

  await Promise.all([
    deleteDoc(userDoc(uid, "profile", "current")),
    deleteDoc(userDoc(uid, "settings", "preferences")),
    deleteDoc(userDoc(uid, "settings", "electricityRate")),
    deleteDoc(userRootDoc(uid)),
  ]);
}
