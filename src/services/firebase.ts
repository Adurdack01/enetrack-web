import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  disableNetwork,
  enableNetwork,
  initializeFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebasePublicConfig = firebaseConfig;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

export const firebaseApp = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseDb = firebaseApp
  ? initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    })
  : null;
export const googleProvider = new GoogleAuthProvider();

const FIRESTORE_NETWORK_RESET_COOLDOWN_MS = 2500;
let lastFirestoreNetworkResetAt = 0;
let firestoreNetworkResetPromise: Promise<boolean> | null = null;

export async function resetFirestoreNetworkConnection(force = false) {
  if (!firebaseDb) {
    return false;
  }

  const now = Date.now();
  if (
    !force &&
    now - lastFirestoreNetworkResetAt < FIRESTORE_NETWORK_RESET_COOLDOWN_MS
  ) {
    return false;
  }

  if (firestoreNetworkResetPromise) {
    return firestoreNetworkResetPromise;
  }

  firestoreNetworkResetPromise = (async () => {
    try {
      await disableNetwork(firebaseDb).catch(() => undefined);
      await enableNetwork(firebaseDb);
      lastFirestoreNetworkResetAt = Date.now();
      return true;
    } catch (error) {
      console.warn(
        "[firebase] Unable to reset Firestore network connection.",
        error
      );
      return false;
    }
  })();

  try {
    return await firestoreNetworkResetPromise;
  } finally {
    firestoreNetworkResetPromise = null;
  }
}
