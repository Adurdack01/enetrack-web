type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort: () => Promise<SerialPortLike>;
  };
};

type SerialSession = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
};

export type Esp32PairingCredentials = {
  username: string;
  password: string;
};

export type Esp32PairingIdentity = {
  esp32Id: string;
  deviceName: string;
  mac?: string;
  firmwareVersion?: string;
  paired?: boolean;
};

export type Esp32PairingConfig = {
  wifiSsid: string;
  wifiPassword: string;
  firebaseApiKey: string;
  firebaseProjectId: string;
  deviceAuthEmail: string;
  deviceAuthPassword: string;
  ownerUid: string;
  deviceId: string;
  deviceName: string;
};

type FirebaseAuthAccount = {
  uid: string;
  created: boolean;
};

const encoder = new TextEncoder();

export function isWebSerialSupported() {
  return Boolean((navigator as SerialNavigator).serial);
}

export function buildDeviceAuthEmail(esp32Id: string) {
  const localPart = esp32Id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${localPart || "esp32-device"}@enertrack.local`;
}

export function buildDeviceAuthPassword(password: string) {
  const cleanPassword = password.trim();

  if (cleanPassword.length >= 6) {
    return cleanPassword;
  }

  return `${cleanPassword || "device"}123`;
}

export async function ensureDeviceAuthAccount(
  apiKey: string,
  email: string,
  password: string
): Promise<FirebaseAuthAccount> {
  const signUpResult = await callIdentityToolkit(apiKey, "accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });

  if (signUpResult.ok) {
    return {
      uid: getString(signUpResult.body.localId),
      created: true,
    };
  }

  if (getFirebaseErrorCode(signUpResult.body) !== "EMAIL_EXISTS") {
    throw new Error(getFirebaseErrorMessage(signUpResult.body));
  }

  const signInResult = await callIdentityToolkit(
    apiKey,
    "accounts:signInWithPassword",
    {
      email,
      password,
      returnSecureToken: true,
    }
  );

  if (!signInResult.ok) {
    throw new Error(
      "This Smart Plug auth account already exists with a different password. Reset it in Firebase Authentication, then pair again."
    );
  }

  return {
    uid: getString(signInResult.body.localId),
    created: false,
  };
}

export async function verifyDeviceAuthPassword(
  apiKey: string,
  email: string,
  password: string
) {
  const signInResult = await callIdentityToolkit(
    apiKey,
    "accounts:signInWithPassword",
    {
      email,
      password,
      returnSecureToken: true,
    }
  );

  if (signInResult.ok) {
    return;
  }

  const code = getFirebaseErrorCode(signInResult.body);

  if (
    code === "INVALID_LOGIN_CREDENTIALS" ||
    code === "INVALID_PASSWORD" ||
    code === "EMAIL_NOT_FOUND"
  ) {
    throw new Error("Incorrect device password.");
  }

  throw new Error(
    getFirebaseErrorMessage(signInResult.body) ||
      "EnerTrack could not verify the device password."
  );
}

export async function hashDevicePassword(password: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(password.trim())
  );

  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function detectEsp32Device(
  credentials: Esp32PairingCredentials
): Promise<Esp32PairingIdentity> {
  return runSerialSession(async (session) => {
    await writeJsonLine(session, {
      type: "identity",
      username: credentials.username,
      password: credentials.password,
    });

    const response = await readJsonResponse(session, "identity", 8000);
    return normalizeIdentity(response);
  });
}

export async function configureEsp32Device(
  credentials: Esp32PairingCredentials,
  config: Esp32PairingConfig
): Promise<Esp32PairingIdentity> {
  return runSerialSession(async (session) => {
    await writeJsonLine(session, {
      type: "identity",
      username: credentials.username,
      password: credentials.password,
    });

    const identity = normalizeIdentity(
      await readJsonResponse(session, "identity", 8000)
    );

    await writeJsonLine(session, {
      type: "configure",
      username: credentials.username,
      password: credentials.password,
      wifiSsid: config.wifiSsid,
      wifiPassword: config.wifiPassword,
      firebaseApiKey: config.firebaseApiKey,
      firebaseProjectId: config.firebaseProjectId,
      deviceAuthEmail: config.deviceAuthEmail,
      deviceAuthPassword: config.deviceAuthPassword,
      ownerUid: config.ownerUid,
      deviceId: config.deviceId,
      deviceName: config.deviceName,
    });

    const configured = await readJsonResponse(session, "configured", 15000);

    return {
      ...identity,
      esp32Id: getString(configured.esp32Id) || identity.esp32Id,
      deviceName: getString(configured.deviceName) || config.deviceName,
      paired: true,
    };
  });
}

async function runSerialSession<T>(
  action: (session: SerialSession) => Promise<T>
) {
  const serial = (navigator as SerialNavigator).serial;

  if (!serial) {
    throw new Error(
      "USB pairing is only available in a browser with Web Serial support, such as Chrome or Edge."
    );
  }

  const port = await serial.requestPort();
  await port.open({ baudRate: 115200 });

  const reader = port.readable?.getReader();
  const writer = port.writable?.getWriter();

  if (!reader || !writer) {
    await port.close();
    throw new Error("Unable to open the Smart Plug serial connection.");
  }

  const session: SerialSession = {
    reader,
    writer,
    decoder: new TextDecoder(),
    buffer: "",
  };

  try {
    return await action(session);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The reader may already be closed after a successful command.
    }

    try {
      await writer.close();
    } catch {
      // Some browser serial implementations close the writer with the port.
    }

    reader.releaseLock();
    writer.releaseLock();

    try {
      await port.close();
    } catch {
      // The port can already be closing after cancellation.
    }
  }
}

async function writeJsonLine(
  session: SerialSession,
  payload: Record<string, unknown>
) {
  await session.writer.write(encoder.encode(`${JSON.stringify(payload)}\n`));
}

async function readJsonResponse(
  session: SerialSession,
  expectedType: string,
  timeoutMs: number
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const existing = takeResponseFromBuffer(session, expectedType);

    if (existing) {
      return existing;
    }

    const remaining = Math.max(50, deadline - Date.now());
    const result = await Promise.race([
      session.reader.read(),
      sleep(remaining).then(() => ({ timeout: true })),
    ]);

    if ("timeout" in result) {
      break;
    }

    if (result.done) {
      break;
    }

    if (result.value) {
      session.buffer += session.decoder.decode(result.value, {
        stream: true,
      });
    }
  }

  throw new Error(
    "No response from the Smart Plug. Check the USB cable and try again."
  );
}

function takeResponseFromBuffer(
  session: SerialSession,
  expectedType: string
) {
  let newlineIndex = session.buffer.indexOf("\n");

  while (newlineIndex >= 0) {
    const line = session.buffer.slice(0, newlineIndex).trim();
    session.buffer = session.buffer.slice(newlineIndex + 1);

    const response = parseSerialJson(line);

    if (response?.type === expectedType) {
      if (response.ok === false) {
        throw new Error(
          getString(response.message) ||
            "The Smart Plug rejected the pairing request."
        );
      }

      return response;
    }

    newlineIndex = session.buffer.indexOf("\n");
  }

  return null;
}

function parseSerialJson(line: string) {
  const start = line.indexOf("{");
  const end = line.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(line.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeIdentity(
  response: Record<string, unknown>
): Esp32PairingIdentity {
  const esp32Id = getString(response.esp32Id);

  if (!esp32Id) {
    throw new Error("The Smart Plug response did not include a device ID.");
  }

  return {
    esp32Id,
    deviceName: getString(response.deviceName) || "EnerTrack Smart Plug",
    mac: getString(response.mac) || undefined,
    firmwareVersion: getString(response.firmwareVersion) || undefined,
    paired: Boolean(response.paired),
  };
}

async function callIdentityToolkit(
  apiKey: string,
  method: string,
  body: Record<string, unknown>
) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${method}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  return {
    ok: response.ok,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function getFirebaseErrorCode(body: Record<string, unknown>) {
  const error = body.error;

  if (!isRecord(error)) {
    return "";
  }

  return getString(error.message);
}

function getFirebaseErrorMessage(body: Record<string, unknown>) {
  const code = getFirebaseErrorCode(body);

  if (code === "EMAIL_EXISTS") {
    return "This Smart Plug auth account already exists.";
  }

  if (code === "WEAK_PASSWORD") {
    return "Use at least 6 characters for the Smart Plug device password.";
  }

  if (code === "OPERATION_NOT_ALLOWED") {
    return "Enable Email/Password sign-in in Firebase Authentication first.";
  }

  return code || "Firebase could not create the Smart Plug auth account.";
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
