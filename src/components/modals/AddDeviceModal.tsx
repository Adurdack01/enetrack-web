import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Loader2,
  Lock,
  RefreshCw,
  Router,
  Smartphone,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createId } from "@/lib/utils";
import {
  buildDeviceAuthEmail,
  hashDevicePassword,
} from "@/services/esp32Pairing";
import {
  getEsp32DeviceInfo,
  normalizeEsp32BaseUrl,
  pairEsp32Device,
  type Esp32DeviceInfo,
} from "@/services/esp32LocalPairing";
import {
  connectProvisioningWifi,
  getProvisioningWifiErrorCode,
  getCurrentProvisioningWifi,
  releaseProvisioningWifiBinding,
  scanProvisioningWifi,
  type WifiProvisioningMode,
  type WifiProvisioningNetwork,
  type WifiProvisioningStatus,
} from "@/services/wifiProvisioning";
import { readPendingDevicePairings } from "@/services/pendingDevicePairing";
import { reloadEntireApp } from "@/services/appReload";
import type { Device } from "@/types/device";
import type { CloudSyncRequestResult } from "@/types/pairing";

type FlowStep = "method" | "wifi" | "ap" | "customize" | "sync";
type PairingState =
  | "idle"
  | "verifying"
  | "verified"
  | "pairing"
  | "paired"
  | "error";
type SystemWifiState =
  | "idle"
  | "loading"
  | "ready"
  | "connecting"
  | "checking"
  | "syncing"
  | "error";

type Props = {
  open: boolean;
  onClose: () => void;
  onPairingFailed: (device: Device) => Promise<void> | void;
  onDevicePairedLocally: (
    device: Device,
    deviceAuthPassword: string
  ) => void;
  onCloudSyncRequested: (
    deviceId?: string
  ) => Promise<CloudSyncRequestResult> | CloudSyncRequestResult;
  existingEsp32Ids: string[];
  ownerUid: string | null;
  ownerEmail: string;
  firebaseApiKey: string;
  firebaseProjectId: string;
};

const manualWifiOption = "__manual_wifi__";
const manualEsp32AddressOption = "__manual_esp32_address__";
const esp32SetupAddress = "http://192.168.4.1";
const esp32SetupWifiPassword = "admin123";
const FIREBASE_SYNC_RETRY_WINDOW_MS = 15000;
const FIREBASE_SYNC_RETRY_STEP_MS = 1500;
const ESP32_RESTART_WAIT_MS = 15000;
const APP_RESTART_PROMPT_WAIT_MS = 15000;

export default function AddDeviceModal({
  open,
  onClose,
  onPairingFailed,
  onDevicePairedLocally,
  onCloudSyncRequested,
  existingEsp32Ids,
  ownerUid,
  ownerEmail,
  firebaseApiKey,
  firebaseProjectId,
}: Props) {
  const [savedRouterWifi, setSavedRouterWifi] = useState(readSavedRouterWifi);
  const [systemWifiNetworks, setSystemWifiNetworks] = useState<
    WifiProvisioningNetwork[]
  >([]);
  const [currentWifi, setCurrentWifi] =
    useState<WifiProvisioningStatus | null>(null);
  const [systemWifiState, setSystemWifiState] =
    useState<SystemWifiState>("idle");
  const [wifiMode, setWifiMode] = useState<WifiProvisioningMode>("manual");
  const [wifiScanMessage, setWifiScanMessage] = useState("");
  const [flowStep, setFlowStep] = useState<FlowStep>("method");
  const [deviceName, setDeviceName] = useState("");
  const [room, setRoom] = useState("");
  const [selectedRouterWifi, setSelectedRouterWifi] = useState(
    () => readSavedRouterWifi() || manualWifiOption
  );
  const [manualRouterWifi, setManualRouterWifi] = useState("");
  const [homeWifiPassword, setHomeWifiPassword] = useState("");
  const [selectedApSsid, setSelectedApSsid] = useState("");
  const [useManualEsp32Address, setUseManualEsp32Address] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pairingToken, setPairingToken] = useState("");
  const [deviceInfo, setDeviceInfo] = useState<Esp32DeviceInfo | null>(null);
  const [pairedDeviceId, setPairedDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [pairingState, setPairingState] = useState<PairingState>("idle");
  const [cloudRegistrationReady, setCloudRegistrationReady] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const cloudSyncInFlight = useRef(false);
  const homeWifiReconnectInFlight = useRef(false);
  const homeWifiReconnectManualOnly = useRef(false);
  const managedHomeWifiReconnect = useRef(false);
  const reconnectFallbackNoticeShown = useRef(false);
  const modalSessionId = useRef(0);

  const networkBySsid = useMemo(
    () => new Map(systemWifiNetworks.map((network) => [network.ssid, network])),
    [systemWifiNetworks]
  );
  const knownEsp32Ids = useMemo(() => {
    const pendingEsp32Ids = readPendingDevicePairings()
      .map((pairing) => pairing.device.esp32Id)
      .filter((esp32Id): esp32Id is string => Boolean(esp32Id));

    return new Set([...existingEsp32Ids, ...pendingEsp32Ids]);
  }, [existingEsp32Ids, open]);
  const routerWifiOptions = useMemo(
    () =>
      [
        ...new Set(
          [
            selectedRouterWifi !== manualWifiOption ? selectedRouterWifi : "",
            savedRouterWifi,
            ...systemWifiNetworks
              .filter((network) => !isEsp32SetupSsid(network.ssid))
              .map((network) => network.ssid),
          ].filter(Boolean)
        ),
      ],
    [savedRouterWifi, selectedRouterWifi, systemWifiNetworks]
  );
  const apHotspotOptions = useMemo(
    () =>
      systemWifiNetworks.filter((network) => isEsp32SetupSsid(network.ssid)),
    [systemWifiNetworks]
  );
  const esp32BaseUrl = normalizeEsp32BaseUrl(
    useManualEsp32Address ? manualAddress : esp32SetupAddress
  );
  const homeWifiSsid =
    selectedRouterWifi === manualWifiOption
      ? manualRouterWifi.trim()
      : selectedRouterWifi.trim();
  const selectedRouterNetwork = networkBySsid.get(homeWifiSsid);
  const selectedRouterLooks5GHz =
    /5\s*ghz/i.test(selectedRouterNetwork?.band ?? "") ||
    /5g/i.test(homeWifiSsid);
  const verified =
    pairingState === "verified" ||
    pairingState === "pairing" ||
    pairingState === "paired";
  const isVerifying = pairingState === "verifying";
  const isPairing = pairingState === "pairing";
  const isScanningWifi = systemWifiState === "loading";
  const isConnectingWifi = systemWifiState === "connecting";
  const selectedApValue = useManualEsp32Address
    ? manualEsp32AddressOption
    : selectedApSsid;

  const loadCurrentWifi = async () => {
    const current = await getCurrentProvisioningWifi();

    setCurrentWifi(current);
    return current;
  };

  const loadSystemWifiNetworks = async () => {
    setSystemWifiState("loading");
    setWifiScanMessage("");

    try {
      const snapshot = await scanProvisioningWifi();
      const networks = snapshot.networks ?? [];
      const routerNetworks = networks.filter(
        (network) => !isEsp32SetupSsid(network.ssid)
      );
      const apNetworks = networks.filter((network) =>
        isEsp32SetupSsid(network.ssid)
      );

      setSystemWifiNetworks(networks);
      setCurrentWifi(snapshot.current);
      setWifiMode(snapshot.mode);
      setWifiScanMessage(snapshot.message);

      if (apNetworks.length > 0 && !selectedApSsid) {
        setSelectedApSsid(apNetworks[0].ssid);
        setUseManualEsp32Address(false);
      }

      const selectedRouterIsVisible =
        selectedRouterWifi !== manualWifiOption &&
        routerNetworks.some((network) => network.ssid === selectedRouterWifi);
      const savedRouterIsVisible =
        Boolean(savedRouterWifi) &&
        routerNetworks.some((network) => network.ssid === savedRouterWifi);
      const currentRouter = routerNetworks.find(
        (network) => network.ssid === snapshot.current?.ssid
      );

      if (!selectedRouterIsVisible && savedRouterIsVisible) {
        setSelectedRouterWifi(savedRouterWifi);
      } else if (!selectedRouterIsVisible && currentRouter) {
        setSelectedRouterWifi(currentRouter.ssid);
      } else if (!selectedRouterIsVisible && routerNetworks.length === 1) {
        setSelectedRouterWifi(routerNetworks[0].ssid);
      }

      setSystemWifiState(snapshot.mode === "manual" ? "error" : "ready");
    } catch (error) {
      setSystemWifiState("error");
      setWifiScanMessage(
        error instanceof Error
          ? error.message
          : "Unable to scan Wi-Fi networks from this device."
      );
    }
  };

  useEffect(() => {
    if (!open) return;

    void loadSystemWifiNetworks();
  }, [open]);

  useEffect(() => {
    if (!open || flowStep !== "ap") return;

    void loadSystemWifiNetworks();
  }, [flowStep, open]);

  const resetForm = () => {
    const latestSavedRouterWifi = readSavedRouterWifi();

    cloudSyncInFlight.current = false;
    homeWifiReconnectInFlight.current = false;
    homeWifiReconnectManualOnly.current = false;
    managedHomeWifiReconnect.current = false;
    reconnectFallbackNoticeShown.current = false;
    modalSessionId.current += 1;

    setFlowStep("method");
    setDeviceName("");
    setRoom("");
    setSavedRouterWifi(latestSavedRouterWifi);
    setSelectedRouterWifi(latestSavedRouterWifi || manualWifiOption);
    setManualRouterWifi("");
    setHomeWifiPassword("");
    setSelectedApSsid("");
    setUseManualEsp32Address(false);
    setManualAddress("");
    setNewPassword("");
    setPairingToken("");
    setDeviceInfo(null);
    setPairedDeviceId("");
    setMessage("");
    setMessageTone("error");
    setPairingState("idle");
    setCloudRegistrationReady(false);
    setVerificationBusy(false);
    setShowRestartDialog(false);
    setWifiScanMessage("");
    setWifiMode("manual");
    setSystemWifiState("idle");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const showMessage = (text: string, tone: "error" | "success" = "error") => {
    setMessage(text);
    setMessageTone(tone);
  };

  const showManualHomeWifiReconnectMessage = () => {
    if (!homeWifiSsid) {
      return;
    }

    reconnectFallbackNoticeShown.current = true;
    showMessage(
      `EnerTrack could not switch this phone to ${homeWifiSsid} automatically on this device. Reconnect to ${homeWifiSsid} in Android Wi-Fi settings, then return here. EnerTrack will finish Firebase sync as soon as the internet connection is back.`
    );
  };

  const resetEsp32Verification = () => {
    setPairingToken("");
    setDeviceInfo(null);
    setNewPassword("");
    setPairingState("idle");
    setMessage("");
  };

  const validateRouterWifi = () => {
    if (!homeWifiSsid) {
      showMessage("Choose or enter the 2.4GHz Wi-Fi your Smart Plug will use.");
      return false;
    }

    if (!homeWifiPassword.trim()) {
      showMessage("Enter your router Wi-Fi password first.");
      return false;
    }

    return true;
  };

  const validateApHotspot = () => {
    if (!useManualEsp32Address && !selectedApSsid) {
      showMessage(
        "Refresh the Wi-Fi list and choose the detected Smart Plug hotspot first."
      );
      return false;
    }

    if (!esp32BaseUrl) {
      showMessage("Enter the Smart Plug local address first.");
      return false;
    }

    return true;
  };

  const handleConfirmRouterWifi = () => {
    if (!validateRouterWifi()) return;

    window.localStorage.setItem("lastHomeWifiSsid", homeWifiSsid);
    setSavedRouterWifi(homeWifiSsid);
    setFlowStep("ap");
    showMessage("");
  };

  const handleOpenWifiSettings = () => {
    window.open("ms-settings:network-wifi", "_blank");
  };

  const handleApSelection = (value: string) => {
    if (value === manualEsp32AddressOption) {
      setUseManualEsp32Address(true);
      setSelectedApSsid("");
    } else {
      setUseManualEsp32Address(false);
      setSelectedApSsid(value);
    }

    resetEsp32Verification();
  };

  const waitForWifiSsid = async (ssid: string) => {
    let latestStatus: WifiProvisioningStatus | null = null;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      await wait(attempt === 0 ? 2500 : 1000);
      latestStatus = await loadCurrentWifi().catch(() => null);

      if (latestStatus?.ssid === ssid) {
        return latestStatus;
      }
    }

    return latestStatus;
  };

  const handleConnectApHotspot = async () => {
    if (!selectedApSsid) {
      showMessage("Choose a detected Smart Plug hotspot first.");
      return;
    }

    setSystemWifiState("connecting");
    showMessage("");

    try {
      const result = await connectProvisioningWifi(
        selectedApSsid,
        esp32SetupWifiPassword
      );
      setWifiMode(result.mode);

      showMessage(
        `${result.message} Waiting for the Smart Plug setup server.`,
        "success"
      );
      const status = await waitForWifiSsid(selectedApSsid);

      if (status?.ssid !== selectedApSsid) {
        showMessage(
          `This device did not switch to ${selectedApSsid}. Open Wi-Fi settings, connect to that hotspot, then return here.`
        );
      } else {
        const info = await getEsp32DeviceInfo(esp32BaseUrl);

        if (knownEsp32Ids.has(info.esp32Id)) {
          setPairingState("error");
          setSystemWifiState("ready");
          showMessage("This Smart Plug is already added to your app.");
          return;
        }

        setDeviceInfo(info);
        setPairingToken("direct-pairing");
        setPairingState("verified");
        setFlowStep("customize");
        showMessage(
          `Smart Plug hotspot connected. EnerTrack will send ${homeWifiSsid || "your router Wi-Fi"} to this device.`,
          "success"
        );
      }

      setSystemWifiState("ready");
    } catch (error) {
      setSystemWifiState("error");
      setPairingState("error");
      showMessage(
        error instanceof Error
          ? error.message
          : "This device could not connect to the Smart Plug hotspot."
      );
    }
  };

  const handleDetectDevice = async () => {
    if (!validateRouterWifi() || !validateApHotspot()) return;

    const verifyingSetupAp =
      !useManualEsp32Address || esp32BaseUrl.includes("192.168.4.1");

    if (verifyingSetupAp) {
      const status = await loadCurrentWifi().catch(() => currentWifi);

      if (status?.connected && status.ssid && !isEsp32SetupSsid(status.ssid)) {
        showMessage(
          `This device is still connected to ${status.ssid}, not the Smart Plug setup Wi-Fi. Choose ${selectedApSsid || "the detected SP-xxxx-ET hotspot"} and tap Connect AP first.`
        );
        return;
      }
    }

    setPairingState("verifying");
    showMessage("");

    try {
      const info = await getEsp32DeviceInfo(esp32BaseUrl);

      if (knownEsp32Ids.has(info.esp32Id)) {
        setPairingState("error");
        showMessage("This Smart Plug is already added to your app.");
        return;
      }

      setDeviceInfo(info);
      setPairingToken("direct-pairing");
      setPairingState("verified");
      setFlowStep("customize");
      showMessage("Device detected. Create a new device password.", "success");
    } catch (error) {
      setPairingState("error");
      showMessage(
        error instanceof Error ? error.message : "Device detection failed."
      );
    }
  };

  const handleAddDevice = async () => {
    if (!validateRouterWifi()) return;

    if (!ownerUid) {
      showMessage("Please sign in before pairing a smart device.");
      return;
    }

    if (!firebaseApiKey || !firebaseProjectId) {
      showMessage("Firebase is not configured for device pairing.");
      return;
    }

    let activeDeviceInfo = deviceInfo;

    if (!activeDeviceInfo) {
      try {
        activeDeviceInfo = await getEsp32DeviceInfo(esp32BaseUrl);

        if (knownEsp32Ids.has(activeDeviceInfo.esp32Id)) {
          showMessage("This Smart Plug is already added to your app.");
          return;
        }

        setDeviceInfo(activeDeviceInfo);
        setPairingToken("direct-pairing");
        setPairingState("verified");
      } catch {
        showMessage(
          "Smart Plug was detected earlier, but EnerTrack cannot reach it now. Stay connected to the Smart Plug Wi-Fi hotspot and tap Finish Pairing again."
        );
        return;
      }
    } else if (!verified) {
      setPairingState("verified");
    }

    if (!deviceName.trim()) {
      showMessage("Enter a device name first.");
      return;
    }

    if (!room.trim()) {
      showMessage("Enter a device location first.");
      return;
    }

    if (!newPassword.trim()) {
      showMessage("Create a new Smart Plug password first.");
      return;
    }

    if (newPassword.trim().length < 6) {
      showMessage("New Smart Plug password must be at least 6 characters.");
      return;
    }

    setPairingState("pairing");
    showMessage("");

    const now = new Date().toISOString();
    const deviceId = createId();
    const deviceAuthEmail = buildDeviceAuthEmail(
      `${activeDeviceInfo.esp32Id}-${deviceId}`
    );
    const deviceAuthPassword = newPassword.trim();
    let newDevice: Device | null = null;

    try {
      const devicePasswordHash = await hashDevicePassword(deviceAuthPassword);

      newDevice = {
        id: deviceId,
        esp32Id: activeDeviceInfo.esp32Id,
        name: deviceName.trim(),
        room: room.trim(),
        location: room.trim(),
        type: "smart_plug",
        paired: true,
        status: false,
        relayState: false,
        online: false,
        power: 0,
        voltage: 0,
        current: 0,
        powerFactor: null,
        energy: 0,
        rawEnergyTotal: 0,
        energyBaselineKwh: null,
        energyCarryoverKwh: 0,
        energyBaselinePending: true,
        todayCost: 0,
        schedule: "Not Set",
        owner: ownerEmail || "Owner",
        sharedWith: 0,
        budgetLimit: 0,
        budgetUsed: 0,
        scheduleMode: "time",
        scheduleEnabled: false,
        scheduleStartTime: "08:00:00",
        scheduleEndTime: "22:00:00",
        scheduleBudgetLimit: 0,
        scheduleBudgetKwhLimit: 0,
        scheduleElectricityRate: 0,
        scheduleManualOverride: false,
        scheduleManualOverrideUntil: null,
        scheduleBudgetReached: false,
        lastScheduleAction: null,
        lastScheduleActionAt: null,
        readingSource: "none",
        wifiSignal: null,
        protectionEnabled: false,
        maxPowerLimit: 1100,
        maxCurrentLimit: 5,
        ownerUid,
        ownerEmail,
        claimedAt: now,
        createdAt: now,
        updatedAt: now,
        lastSyncedAt: null,
        pendingOfflineLogs: 0,
        deviceAuthEmail,
        devicePasswordHash,
      };

      const pairResult = await pairEsp32Device(esp32BaseUrl, {
        pairingToken,
        ownerUid,
        deviceDocId: deviceId,
        esp32Id: activeDeviceInfo.esp32Id,
        deviceName: deviceName.trim(),
        deviceLocation: room.trim(),
        wifiSsid: homeWifiSsid,
        wifiPassword: homeWifiPassword,
        newDevicePassword: deviceAuthPassword,
        firebaseApiKey,
        firebaseProjectId,
        deviceAuthEmail,
        deviceAuthPassword,
      });

      if (!pairResult.success) {
        throw new Error(pairResult.message || "Smart Plug pairing failed.");
      }

      onDevicePairedLocally(newDevice, deviceAuthPassword);
      setPairedDeviceId(newDevice.id);
      setPairingState("paired");
      setFlowStep("sync");
      setCloudRegistrationReady(false);
      showMessage(
        `${pairResult.message || "Device paired successfully"}. EnerTrack is reconnecting this phone to ${homeWifiSsid} so Firebase sync can finish.`,
        "success"
      );
    } catch (error) {
      setPairingState("error");

      if (newDevice) {
        await onPairingFailed(newDevice);
      }

      showMessage(error instanceof Error ? error.message : "Pairing failed.");
    }
  };

  const handleRestartEntireApp = () => {
    reloadEntireApp();
  };

  const reconnectPhoneToHomeWifi = async (manualTrigger = false) => {
    if (
      !homeWifiSsid ||
      !homeWifiPassword.trim() ||
      homeWifiReconnectInFlight.current
    ) {
      return false;
    }

    homeWifiReconnectInFlight.current = true;
    setSystemWifiState("connecting");

    try {
      const result = await connectProvisioningWifi(
        homeWifiSsid,
        homeWifiPassword
      );
      managedHomeWifiReconnect.current = result.mode === "capacitor-native";
      setWifiMode(result.mode);

      if (manualTrigger) {
        showMessage(
          `${result.message} Waiting for ${homeWifiSsid} so Firebase can finish device sync.`,
          "success"
        );
      }

      const status = await waitForWifiSsid(homeWifiSsid);

      if (status?.ssid === homeWifiSsid) {
        setCurrentWifi(status);
        return true;
      }

      managedHomeWifiReconnect.current = false;
      setCurrentWifi(status ?? null);

      if (manualTrigger) {
        showMessage(
          `EnerTrack asked Android to reconnect to ${homeWifiSsid}, but this phone is still on ${status?.ssid || "another Wi-Fi"}. Switch back to ${homeWifiSsid} and try again.`
        );
      }

      return false;
    } catch (error) {
      managedHomeWifiReconnect.current = false;
      const errorCode = getProvisioningWifiErrorCode(error);

      if (errorCode === "FAILED_TO_ENABLE_NETWORK") {
        homeWifiReconnectManualOnly.current = true;
        await releaseProvisioningWifiBinding();

        if (manualTrigger || !reconnectFallbackNoticeShown.current) {
          showManualHomeWifiReconnectMessage();
        }

        return false;
      }

      if (manualTrigger) {
        showMessage(
          error instanceof Error
            ? error.message
            : `EnerTrack could not reconnect this phone to ${homeWifiSsid} automatically.`
        );
      }

      return false;
    } finally {
      homeWifiReconnectInFlight.current = false;
    }
  };

  const shouldReconnectPhoneBeforeCloudSync = (
    status: WifiProvisioningStatus | null
  ) => {
    if (!homeWifiSsid || !homeWifiPassword.trim()) {
      return false;
    }

    if (homeWifiReconnectManualOnly.current) {
      return false;
    }

    if (!status?.connected || !status.ssid) {
      return true;
    }

    return status.ssid !== homeWifiSsid;
  };

  const attemptCloudSync = async (manualTrigger = false) => {
    if (!pairedDeviceId || cloudSyncInFlight.current) {
      return;
    }

    cloudSyncInFlight.current = true;
    showMessage("");

    try {
      let reconnectedDuringAttempt = false;
      setSystemWifiState("checking");
      const status = await loadCurrentWifi();

      if (status?.connected && isEsp32SetupSsid(status.ssid)) {
        if (homeWifiReconnectManualOnly.current) {
          setSystemWifiState("ready");

          if (manualTrigger || !reconnectFallbackNoticeShown.current) {
            showManualHomeWifiReconnectMessage();
          }

          return;
        }

        const reconnected = await reconnectPhoneToHomeWifi(manualTrigger);
        reconnectedDuringAttempt = reconnectedDuringAttempt || reconnected;

        if (!reconnected) {
          setSystemWifiState("ready");

          if (manualTrigger && !homeWifiPassword.trim()) {
            showMessage(
              `This phone is still connected to ${status.ssid}. Enter the password for ${homeWifiSsid || "your router Wi-Fi"} first so EnerTrack can reconnect and finish Firebase sync.`
            );
          } else if (manualTrigger && !homeWifiSsid) {
            showMessage(
              `This phone is still connected to ${status.ssid}. Choose your router Wi-Fi first so EnerTrack can finish Firebase sync.`
            );
          }

          return;
        }
      } else if (shouldReconnectPhoneBeforeCloudSync(status)) {
        const reconnected = await reconnectPhoneToHomeWifi(manualTrigger);
        reconnectedDuringAttempt = reconnectedDuringAttempt || reconnected;

        if (!reconnected) {
          setSystemWifiState("ready");
          return;
        }
      }

      const syncWifiStatus = await loadCurrentWifi().catch(() => status);

      if (
        homeWifiReconnectManualOnly.current &&
        homeWifiSsid &&
        syncWifiStatus?.ssid !== homeWifiSsid
      ) {
        setSystemWifiState("ready");

        if (manualTrigger || !reconnectFallbackNoticeShown.current) {
          showManualHomeWifiReconnectMessage();
        }

        return;
      }

      if (syncWifiStatus?.ssid === homeWifiSsid) {
        homeWifiReconnectManualOnly.current = false;
        reconnectFallbackNoticeShown.current = false;
      }

      if (!managedHomeWifiReconnect.current) {
        await releaseProvisioningWifiBinding();
      }

      setSystemWifiState("syncing");
      let result = await onCloudSyncRequested(pairedDeviceId);
      const deadline = Date.now() + FIREBASE_SYNC_RETRY_WINDOW_MS;

      while (result.status !== "registered" && Date.now() < deadline) {
        await wait(FIREBASE_SYNC_RETRY_STEP_MS);
        result = await onCloudSyncRequested(pairedDeviceId);
      }

      if (
        result.status !== "registered" &&
        !reconnectedDuringAttempt &&
        homeWifiSsid &&
        homeWifiPassword.trim()
      ) {
        const reconnected = await reconnectPhoneToHomeWifi(manualTrigger);
        reconnectedDuringAttempt = reconnectedDuringAttempt || reconnected;

        if (reconnected) {
          setSystemWifiState("syncing");
          result = await onCloudSyncRequested(pairedDeviceId);

          while (result.status !== "registered" && Date.now() < deadline) {
            await wait(FIREBASE_SYNC_RETRY_STEP_MS);
            result = await onCloudSyncRequested(pairedDeviceId);
          }
        }
      }

      if (result.status === "registered") {
        setCloudRegistrationReady(true);
        setSystemWifiState("ready");
        showMessage(
          result.message ||
            "Device is now registered in Firebase. Tap Verify Firebase Registration to finish pairing.",
          "success"
        );
        return;
      }

      setSystemWifiState("ready");
      if (manualTrigger || result.message) {
        showMessage(result.message);
      }
    } catch (error) {
      setSystemWifiState("error");
      if (manualTrigger) {
        showMessage(
          error instanceof Error
            ? error.message
            : "EnerTrack could not finish Firebase sync yet."
        );
      }
    } finally {
      cloudSyncInFlight.current = false;
    }
  };

  const handleFinishCloudSync = async () => {
    if (!pairedDeviceId) {
      showMessage("Pair the Smart Plug first before verifying Firebase registration.");
      return;
    }

    const sessionId = modalSessionId.current;
    setVerificationBusy(true);
    setSystemWifiState("checking");
    showMessage(
      "EnerTrack is waiting 15 seconds for the Smart Plug reboot window.",
      "success"
    );

    try {
      await wait(ESP32_RESTART_WAIT_MS);

      if (modalSessionId.current !== sessionId) {
        return;
      }

      showMessage(
        "Smart Plug reboot window is complete. EnerTrack is waiting 15 more seconds before the app restart prompt.",
        "success"
      );

      await wait(APP_RESTART_PROMPT_WAIT_MS);

      if (modalSessionId.current !== sessionId) {
        return;
      }

      setSystemWifiState("ready");
      setShowRestartDialog(true);
      showMessage(
        cloudRegistrationReady
          ? "Device registration looks ready. Close and reopen the app now so EnerTrack reloads cleanly."
          : "The 30-second verification window is complete. Close and reopen the app now so EnerTrack reloads after the Smart Plug reboot.",
        "success"
      );
    } finally {
      if (modalSessionId.current === sessionId) {
        setVerificationBusy(false);
      }
    }
  };

  useEffect(() => {
    if (
      !open ||
      flowStep !== "sync" ||
      !pairedDeviceId ||
      cloudRegistrationReady
    ) {
      return;
    }

    void attemptCloudSync(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void attemptCloudSync(false);
    }, FIREBASE_SYNC_RETRY_STEP_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [cloudRegistrationReady, flowStep, open, pairedDeviceId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-slate-100 dark:bg-slate-950">
      <div className="flex h-full w-full max-w-md flex-col bg-slate-50 dark:bg-slate-950">
        <div className="flex items-start justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Good day</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {ownerEmail ? ownerEmail.split("@")[0] : "Owner"}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="rounded-full bg-white dark:bg-slate-900"
          >
            Back
          </Button>
        </div>

        <div className="px-4 pt-5">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Add Device
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pair your Smart Plug through hotspot setup
          </p>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-4 pb-[calc(8rem+env(safe-area-inset-bottom))]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Router className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {flowStep === "method"
                  ? "Choose Pairing Method"
                  : flowStep === "sync"
                    ? "Cloud Sync"
                    : "AP Hotspot"}
              </h2>
            </div>

            {flowStep !== "method" && (
              <ApHotspotStepper
                step={flowStep}
                hasRouterWifi={Boolean(homeWifiSsid && homeWifiPassword.trim())}
                verified={verified}
                pairing={isPairing}
                paired={pairingState === "paired"}
              />
            )}

            <div className="mt-4 space-y-4">
              {flowStep === "method" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFlowStep("wifi");
                      showMessage("");
                    }}
                    className="flex w-full items-center gap-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-left transition hover:border-emerald-200 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                  >
                    <div className="rounded-2xl bg-white p-3 text-emerald-600 dark:bg-slate-900 dark:text-emerald-300">
                      <Wifi className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900 dark:text-white">
                        AP Hotspot Connection
                      </p>
                      <p className="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">
                        Select router Wi-Fi, connect to the Smart Plug hotspot,
                        then return to finish pairing.
                      </p>
                    </div>
                  </button>

                  <WifiStatusCard
                    currentWifi={currentWifi}
                    state={systemWifiState}
                    mode={wifiMode}
                    message={wifiScanMessage}
                    onRefresh={loadSystemWifiNetworks}
                  />
                </>
              )}

              {flowStep === "wifi" && (
                <>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Select the Wi-Fi your device will connect to
                    </h3>
                    <p className="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">
                      Choose your 2.4GHz router Wi-Fi and enter its password.
                    </p>
                  </div>

                  <WifiStatusCard
                    currentWifi={currentWifi}
                    state={systemWifiState}
                    mode={wifiMode}
                    message={wifiScanMessage}
                    onRefresh={loadSystemWifiNetworks}
                  />

                  <SetupField label="Wi-Fi SSID">
                    <div className="relative">
                      <select
                        value={selectedRouterWifi}
                        onChange={(event) =>
                          setSelectedRouterWifi(event.target.value)
                        }
                        className="w-full appearance-none rounded-full border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      >
                        {routerWifiOptions.map((network) => (
                          <option key={network} value={network}>
                            {formatNetworkLabel(
                              networkBySsid.get(network) ?? {
                                ssid: network,
                                signal: null,
                                secure: true,
                                band: null,
                              }
                            )}
                          </option>
                        ))}
                        <option value={manualWifiOption}>Enter Wi-Fi manually</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
                    </div>
                  </SetupField>

                  {selectedRouterWifi === manualWifiOption && (
                    <SetupField label="Manual Wi-Fi SSID">
                      <input
                        value={manualRouterWifi}
                        onChange={(event) => setManualRouterWifi(event.target.value)}
                        placeholder="Enter your 2.4GHz Wi-Fi name"
                        className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </SetupField>
                  )}

                  {selectedRouterLooks5GHz && (
                    <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-snug text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                      This looks like a 5GHz network. Smart Plug pairing usually
                      needs your 2.4GHz Wi-Fi name.
                    </p>
                  )}

                  <SetupField label="Wi-Fi Password">
                    <input
                      value={homeWifiPassword}
                      onChange={(event) => setHomeWifiPassword(event.target.value)}
                      type="password"
                      placeholder="Enter router Wi-Fi password"
                      className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </SetupField>

                  <Button
                    type="button"
                    onClick={handleConfirmRouterWifi}
                    className="w-full rounded-full bg-blue-500 text-white hover:bg-blue-600"
                  >
                    Confirm
                  </Button>
                </>
              )}

              {flowStep === "ap" && (
                <>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      Connect to AP hotspot
                    </h3>
                    <p className="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">
                      Choose the detected Smart Plug Wi-Fi, connect to it, then
                      continue to create the device password.
                    </p>
                  </div>

                  <WifiStatusCard
                    currentWifi={currentWifi}
                    state={systemWifiState}
                    mode={wifiMode}
                    message={wifiScanMessage}
                    onRefresh={loadSystemWifiNetworks}
                  />

                  <SetupField label="Detected AP Hotspot">
                    <div className="relative">
                      <select
                        value={selectedApValue}
                        onChange={(event) => handleApSelection(event.target.value)}
                        className="w-full appearance-none rounded-full border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      >
                        {apHotspotOptions.length === 0 && (
                          <option value="" disabled>
                            No Smart Plug hotspot detected
                          </option>
                        )}
                        {apHotspotOptions.map((network) => (
                          <option key={network.ssid} value={network.ssid}>
                            {formatNetworkLabel(network)}
                          </option>
                        ))}
                        <option value={manualEsp32AddressOption}>
                          Enter Smart Plug IP address manually
                        </option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
                    </div>
                  </SetupField>

                  {useManualEsp32Address && (
                    <SetupField label="Smart Plug Local Address">
                      <input
                        value={manualAddress}
                        onChange={(event) => {
                          setManualAddress(event.target.value);
                          resetEsp32Verification();
                        }}
                        placeholder="Example: 192.168.4.1"
                        className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                      />
                    </SetupField>
                  )}

                  <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-700 dark:bg-blue-950/30 dark:text-blue-200">
                    EnerTrack will ask this device to connect to the selected
                    Smart Plug hotspot using the setup Wi-Fi password. If the operating
                    system blocks it, open Wi-Fi settings and connect manually.
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadSystemWifiNetworks}
                      disabled={isScanningWifi || isConnectingWifi}
                      className="rounded-full"
                    >
                      {isScanningWifi ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Refresh List
                    </Button>
                    <Button
                      type="button"
                      onClick={handleConnectApHotspot}
                      disabled={
                        !selectedApSsid ||
                        useManualEsp32Address ||
                        isScanningWifi ||
                        isConnectingWifi
                      }
                      className="rounded-full bg-blue-500 text-white hover:bg-blue-600"
                    >
                      {isConnectingWifi ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                      Connect AP
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenWifiSettings}
                    className="w-full rounded-full"
                  >
                    <WifiOff className="h-4 w-4" />
                    Open Wi-Fi Settings
                  </Button>

                  <Button
                    type="button"
                    onClick={handleDetectDevice}
                    disabled={isVerifying || isPairing}
                    className="w-full rounded-full bg-[#1b1b1b] text-white hover:bg-slate-800"
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                    {isVerifying ? "Detecting Device" : "Continue Device Setup"}
                  </Button>
                </>
              )}

              {flowStep === "customize" && (
                <>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                    Device connected. Customize the device name, location, and
                    new Smart Plug password to finish pairing.
                  </div>

                  <SetupField label="Device Name">
                    <input
                      value={deviceName}
                      onChange={(event) => setDeviceName(event.target.value)}
                      placeholder="Example: Electric Fan"
                      className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </SetupField>

                  <SetupField label="Device Location">
                    <input
                      value={room}
                      onChange={(event) => setRoom(event.target.value)}
                      placeholder="Example: Living Room"
                      className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    />
                  </SetupField>

                  <SetupField label="Create New Device Password">
                    <input
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      disabled={isPairing}
                      type="password"
                      placeholder="Used for future device removal/security"
                      className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
                    />
                  </SetupField>

                  <Button
                    type="button"
                    onClick={handleAddDevice}
                    disabled={isPairing || isVerifying}
                    className="w-full rounded-full bg-[#1b1b1b] text-white hover:bg-slate-800"
                  >
                    {isPairing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    {isPairing ? "Activating Device" : "Finish Pairing"}
                  </Button>
                </>
              )}

              {flowStep === "sync" && (
                <>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                    Smart Plug received the Wi-Fi details and is joining the router.
                    Put this phone back on an internet Wi-Fi so EnerTrack can
                    create the Firebase device documents. Once that finishes,
                    tap the button below to start the 30-second verification
                    window. After the first 15 seconds, the Smart Plug will reboot
                    once. After the next 15 seconds, EnerTrack will prompt you
                    to close and reopen the app.
                  </div>

                  <WifiStatusCard
                    currentWifi={currentWifi}
                    state={systemWifiState}
                    mode={wifiMode}
                    message={wifiScanMessage}
                    onRefresh={loadSystemWifiNetworks}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenWifiSettings}
                    className="w-full rounded-full"
                  >
                    <WifiOff className="h-4 w-4" />
                    Open Wi-Fi Settings
                  </Button>

                  <Button
                    type="button"
                    onClick={handleFinishCloudSync}
                    disabled={verificationBusy}
                    className="w-full rounded-full bg-[#1b1b1b] text-white hover:bg-slate-800"
                  >
                    {verificationBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Cloud className="h-4 w-4" />
                    )}
                    {verificationBusy
                      ? "Verifying Registration"
                      : "Verify Registration"}
                  </Button>
                </>
              )}

              {message && (
                <div
                  className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    messageTone === "success"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400"
          aria-label="Close add device"
        >
          <X className="h-4 w-4" />
        </button>

        {showRestartDialog && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-xl dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Close And Reopen EnerTrack
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                The 30-second verification window is finished. Close and reopen
                EnerTrack now so the whole WebView and app system reloads
                cleanly after the Smart Plug reboot.
              </p>
              <div className="mt-5 flex gap-3">
                <Button
                  type="button"
                  onClick={handleRestartEntireApp}
                  className="w-full rounded-full bg-[#1b1b1b] text-white hover:bg-slate-800"
                >
                  Close And Reopen App
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApHotspotStepper({
  step,
  hasRouterWifi,
  verified,
  pairing,
  paired,
}: {
  step: FlowStep;
  hasRouterWifi: boolean;
  verified: boolean;
  pairing: boolean;
  paired: boolean;
}) {
  const apStarted =
    step === "ap" || step === "customize" || step === "sync" || verified;
  const steps = [
    { label: "Power on", done: true },
    { label: "Main Wi-Fi", done: hasRouterWifi },
    {
      label: "Plug AP",
      done: verified || pairing || paired,
      active: apStarted && !verified,
    },
    { label: "Send Wi-Fi", done: paired, active: pairing },
    { label: "Firebase", done: false, active: step === "sync" },
  ];

  return (
    <div className="rounded-2xl bg-slate-950 px-3 py-4 text-white">
      <p className="mb-3 text-center text-sm font-semibold">AP Hotspot</p>
      <div className="grid grid-cols-5 gap-2">
        {steps.map((item) => (
          <div key={item.label} className="text-center">
            <div
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${
                item.done || item.active ? "bg-blue-500" : "bg-slate-700"
              }`}
            >
              {item.active && !item.done ? (
                item.label === "Firebase" ? (
                  <Cloud className="h-4 w-4" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )
              ) : item.done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : item.label === "Firebase" ? (
                <Cloud className="h-4 w-4 text-slate-300" />
              ) : (
                <Wifi className="h-4 w-4 text-slate-300" />
              )}
            </div>
            <p className="mt-2 text-[10px] leading-tight text-slate-300">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WifiStatusCard({
  currentWifi,
  state,
  mode,
  message,
  onRefresh,
}: {
  currentWifi: WifiProvisioningStatus | null;
  state: SystemWifiState;
  mode: WifiProvisioningMode;
  message: string;
  onRefresh: () => void;
}) {
  const statusText = currentWifi?.connected
    ? `${currentWifi.ssid}${currentWifi.band ? ` • ${currentWifi.band}` : ""}`
    : "Not connected";
  const displayText =
    state === "loading"
      ? "Scanning Wi‑Fi..."
      : state === "connecting"
        ? "Connecting to selected Wi‑Fi..."
        : state === "checking"
          ? "Checking current Wi‑Fi..."
          : state === "syncing"
            ? "Syncing device to Firebase..."
            : statusText;
  const modeLabel =
    mode === "capacitor-native"
      ? "Mobile Wi-Fi"
      : mode === "local-dev"
        ? "Local Wi-Fi"
        : "Manual";

  return (
    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Current Wi-Fi • {modeLabel}
          </p>
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
            {displayText}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={
            state === "loading" ||
            state === "connecting" ||
            state === "checking" ||
            state === "syncing"
          }
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-sm disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Refresh Wi-Fi list"
        >
          {state === "loading" ||
          state === "connecting" ||
          state === "checking" ||
          state === "syncing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>
      {message && (
        <p className="mt-2 text-xs leading-snug text-red-500 dark:text-red-300">
          {message}
        </p>
      )}
    </div>
  );
}

function SetupField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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

function readSavedRouterWifi() {
  if (typeof window === "undefined") return "";

  return window.localStorage.getItem("lastHomeWifiSsid") ?? "";
}

function isEsp32SetupSsid(ssid: string) {
  const cleanSsid = ssid.trim();

  return (
    /^SP-\d{3,6}-ET$/i.test(cleanSsid) ||
    /^SP[0-9A-F]{6,12}$/i.test(cleanSsid)
  );
}

function formatNetworkLabel(network: WifiProvisioningNetwork) {
  return [
    network.ssid,
    network.band,
    network.signal === null ? "" : `${network.signal}%`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
