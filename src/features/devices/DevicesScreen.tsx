import {
  Share2,
  UserPlus,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import AddDeviceModal from "@/components/modals/AddDeviceModal";
import DeviceCard from "@/components/shared/DeviceCard";
import { createId } from "@/lib/utils";
import type { Device } from "@/types/device";
import type {
  FamilyInvitation,
  FamilyMember,
  Permission,
} from "@/types/family";
import type { CloudSyncRequestResult } from "@/types/pairing";

function isAcceptedSharedMember(member: FamilyMember) {
  if (member.isOwner) return false;

  return member.inviteId
    ? member.inviteStatus === "accepted"
    : member.inviteStatus == null || member.inviteStatus === "accepted";
}

type Props = {
  devices: Device[];
  familyMembers: FamilyMember[];
  sentInvitations: FamilyInvitation[];
  onSaveFamilyMember: (member: FamilyMember) => void;
  onToggleDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
  canAddDevice: boolean;
  onRequireElectricityRate: () => void;
  ownerUid: string | null;
  ownerEmail: string;
  firebaseApiKey: string;
  firebaseProjectId: string;
  onPairingFailed: (device: Device) => Promise<void> | void;
  onDevicePairedLocally: (
    device: Device,
    deviceAuthPassword: string
  ) => void;
  onCloudSyncRequested: (
    deviceId?: string
  ) => Promise<CloudSyncRequestResult> | CloudSyncRequestResult;
};

type FamilyModalState =
  | { mode: "invite"; email: string }
  | { mode: "edit"; member: FamilyMember }
  | null;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function DevicesScreen({
  devices,
  familyMembers,
  sentInvitations,
  onSaveFamilyMember,
  onSelectDevice,
  canAddDevice,
  onRequireElectricityRate,
  ownerUid,
  ownerEmail,
  firebaseApiKey,
  firebaseProjectId,
  onPairingFailed,
  onDevicePairedLocally,
  onCloudSyncRequested,
}: Props) {
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [ratePrompt, setRatePrompt] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [familyModal, setFamilyModal] = useState<FamilyModalState>(null);
  const [toast, setToast] = useState("");
  const [ownerWarning, setOwnerWarning] = useState("");
  const [inviteError, setInviteError] = useState("");
  const hasDevices = devices.length > 0;
  const ownDevices = useMemo(
    () => devices.filter((device) => !device.isShared),
    [devices]
  );

  useEffect(() => {
    if (canAddDevice) {
      setRatePrompt("");
    }
  }, [canAddDevice]);

  const handleOpenAddDevice = () => {
    if (!canAddDevice) {
      setRatePrompt(
        "Please add your local electricity rate first. Go to Settings > Electricity Rate, enter a manual PHP per kWh rate, then save it before adding a device."
      );
      onRequireElectricityRate();
      return;
    }

    setShowAddDevice(true);
  };

  const familyMembersWithAccess = useMemo(
    () =>
      familyMembers.map((member) =>
        member.isOwner
          ? { ...member, deviceIds: ownDevices.map((device) => device.id) }
          : {
              ...member,
              inviteStatus:
                member.inviteId != null
                  ? sentInvitations.find(
                      (invitation) => invitation.id === member.inviteId
                    )?.status ?? member.inviteStatus
                  : member.inviteStatus,
            }
      ),
    [familyMembers, ownDevices, sentInvitations]
  );

  const getSharedCount = (deviceId: string) =>
    familyMembersWithAccess.filter(
      (member) =>
        isAcceptedSharedMember(member) && member.deviceIds.includes(deviceId)
    ).length;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const handleSaveFamilyMember = (member: FamilyMember) => {
    onSaveFamilyMember(member);
    setFamilyModal(null);
    setInviteEmail("");
    showToast(
      familyModal?.mode === "edit"
        ? "Family access updated successfully"
        : "Family invitation sent"
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-white">
              Appliances & Shared
              <br />
              Devices
            </h1>
            <p className="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">
              Manage loads, schedules, budget limits, and family access
            </p>
          </div>

          <Button
            type="button"
            onClick={handleOpenAddDevice}
            className="mt-8 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Add
          </Button>
        </div>

        {ratePrompt && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-snug text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {ratePrompt}
          </div>
        )}

        {!hasDevices && (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              No devices yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Tap Add to pair your first smart plug.
            </p>
          </div>
        )}

        {hasDevices && (
          <>
            <div className="space-y-4">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onSelectDevice={onSelectDevice}
                  sharedCount={getSharedCount(device.id)}
                />
              ))}
            </div>

            <FamilySharingCard
              devices={ownDevices}
              members={familyMembersWithAccess}
              inviteEmail={inviteEmail}
              ownerWarning={ownerWarning}
              inviteError={inviteError}
              onInviteEmailChange={(value) => {
                setInviteEmail(value);
                setInviteError("");
              }}
              onOpenInvite={() => {
                const email = inviteEmail.trim().toLowerCase();

                if (!email) {
                  setInviteError("Please enter an email address first.");
                  return;
                }

                if (!isValidEmail(email)) {
                  setInviteError("Please enter a valid email address.");
                  return;
                }

                if (email === ownerEmail.trim().toLowerCase()) {
                  setInviteError("You cannot invite your own account.");
                  return;
                }

                if (
                  familyMembers.some(
                    (member) => member.email.toLowerCase() === email
                  )
                ) {
                  setInviteError("This email address is already added.");
                  return;
                }

                setInviteError("");
                setOwnerWarning("");
                setFamilyModal({ mode: "invite", email: inviteEmail.trim() });
              }}
              onSelectMember={(member) => {
                if (member.isOwner) {
                  setOwnerWarning("Owner access cannot be edited here.");
                  return;
                }

                setOwnerWarning("");
                setFamilyModal({ mode: "edit", member });
              }}
            />
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-emerald-600 px-4 py-3 text-center text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      <AddDeviceModal
        open={showAddDevice}
        onClose={() => setShowAddDevice(false)}
        existingEsp32Ids={devices.flatMap((device) =>
          device.esp32Id ? [device.esp32Id] : []
        )}
        ownerUid={ownerUid}
        ownerEmail={ownerEmail}
        firebaseApiKey={firebaseApiKey}
        firebaseProjectId={firebaseProjectId}
        onPairingFailed={onPairingFailed}
        onDevicePairedLocally={onDevicePairedLocally}
        onCloudSyncRequested={onCloudSyncRequested}
      />

      {familyModal && (
        <FamilyAccessModal
          key={
            familyModal.mode === "edit"
              ? familyModal.member.id
              : `invite-${familyModal.email}`
          }
          state={familyModal}
          devices={ownDevices}
          onClose={() => setFamilyModal(null)}
          onSave={handleSaveFamilyMember}
        />
      )}
    </>
  );
}

function FamilySharingCard({
  devices,
  members,
  inviteEmail,
  ownerWarning,
  inviteError,
  onInviteEmailChange,
  onOpenInvite,
  onSelectMember,
}: {
  devices: Device[];
  members: FamilyMember[];
  inviteEmail: string;
  ownerWarning: string;
  inviteError: string;
  onInviteEmailChange: (value: string) => void;
  onOpenInvite: () => void;
  onSelectMember: (member: FamilyMember) => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Share2 className="h-5 w-5 text-sky-500" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Family Sharing
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelectMember(member)}
            className={`w-full rounded-2xl p-3 text-left transition ${
              member.isOwner
                ? "border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {member.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {member.relationship}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {member.email}
                </p>
                {!member.isOwner && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {member.inviteStatus === "accepted"
                      ? "Accepted"
                      : member.inviteStatus === "declined"
                        ? "Declined"
                        : member.inviteStatus === "revoked"
                          ? "Revoked"
                          : "Invitation pending"}
                  </p>
                )}
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">
                  {member.deviceIds.length > 0
                    ? devices
                        .filter((device) => member.deviceIds.includes(device.id))
                        .map((device) => device.name)
                        .join(", ")
                    : "No devices selected"}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {member.permission}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={inviteEmail}
          onChange={(event) => {
            onInviteEmailChange(event.target.value);
          }}
          disabled={devices.length === 0}
          placeholder="Enter family member email"
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
        />

        <Button
          type="button"
          onClick={onOpenInvite}
          disabled={devices.length === 0}
          variant="outline"
          className="rounded-full"
        >
          <UserPlus className="h-4 w-4" />
          Invite
        </Button>
      </div>

      {devices.length === 0 && (
        <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          Shared devices from other owners cannot be reshared. Add your own
          device first to invite family members.
        </div>
      )}

      {inviteError && (
        <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-300">
          {inviteError}
        </div>
      )}

      {ownerWarning && (
        <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-center text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
          {ownerWarning}
        </div>
      )}
    </div>
  );
}

function FamilyAccessModal({
  state,
  devices,
  onClose,
  onSave,
}: {
  state: Exclude<FamilyModalState, null>;
  devices: Device[];
  onClose: () => void;
  onSave: (member: FamilyMember) => void;
}) {
  const existingMember = state?.mode === "edit" ? state.member : null;
  const [email, setEmail] = useState(
    state?.mode === "invite" ? state.email : existingMember?.email ?? ""
  );
  const [name, setName] = useState(existingMember?.name ?? "");
  const [relationship, setRelationship] = useState(
    existingMember?.relationship ?? ""
  );
  const [permission, setPermission] = useState<Permission>(
    existingMember?.permission ?? "View Only"
  );
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    existingMember?.deviceIds.length
      ? existingMember.deviceIds
      : devices[0]
        ? [devices[0].id]
        : []
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const member = state.mode === "edit" ? state.member : null;

    setEmail(state.mode === "invite" ? state.email : member?.email ?? "");
    setName(member?.name ?? "");
    setRelationship(member?.relationship ?? "");
    setPermission(member?.permission ?? "View Only");
    setSelectedDeviceIds(
      member?.deviceIds.length
        ? member.deviceIds
        : devices[0]
          ? [devices[0].id]
          : []
    );
    setError("");
  }, [state]);

  const title =
    state.mode === "edit" ? "Edit Family Access" : "Invite Family Member";

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleSave = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!name.trim()) {
      setError("Please enter the user's name.");
      return;
    }

    if (!relationship.trim()) {
      setError("Please enter the relationship.");
      return;
    }

    if (selectedDeviceIds.length === 0) {
      setError("Select at least one device to share.");
      return;
    }

    onSave({
      id: existingMember?.id ?? createId(),
      email: normalizedEmail,
      name: name.trim(),
      relationship: relationship.trim(),
      permission,
      deviceIds: selectedDeviceIds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Email">
            <input
              value={email}
              readOnly
              placeholder="name@example.com"
              className="w-full cursor-not-allowed rounded-full border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            />
          </Field>

          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter user's full name"
              className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </Field>

          <Field label="Relationship">
            <input
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              placeholder="Example: Mother, Brother, Tenant"
              className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Device Access
            </p>
            <div className="space-y-2">
              {devices.map((device) => {
                const selected = selectedDeviceIds.includes(device.id);

                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => toggleDevice(device.id)}
                    className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-sm font-semibold ${
                      selected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400"
                    }`}
                  >
                    <span>{device.name}</span>
                    <span>{selected ? "Selected" : "Tap to select"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Permission">
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as Permission)}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            >
              <option>View Only</option>
              <option>View + Control</option>
            </select>
            <p className="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
              View + Control can switch the relay. Owner-only actions like
              removing devices, SD cleanup, and settings stay locked.
            </p>
          </Field>

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-full"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              {state.mode === "edit" ? "Save Changes" : "Send Invite"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}
