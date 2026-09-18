/* Firebase app init — single source of truth, imported by auth-gate.js,
 * app.js's cloud sync bridge, and admin/admin.js. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider, OAuthProvider,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const isFirebaseConfigured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");

// Inside a Capacitor native app, window.Capacitor is injected by the native
// bridge itself (no import needed to detect it). Plain getAuth()'s automatic
// persistence detection doesn't behave on either native platform, so both
// need initializeAuth() with an explicit persistence — see shared/README
// notes in auth-gate.js's native sign-in path for why this pairs with the
// native Google Sign-In bridge.
//
// The two platforms need different persistence, though: Android's WebView
// doesn't reliably survive app restarts with the plain browser (localStorage)
// persistence, so it needs indexedDBLocalPersistence. iOS's WKWebView serves
// the app over a custom `capacitor://` scheme (not http/https), and
// initializeAuth's IndexedDB-based persistence throws inside the SDK under
// that non-http origin, producing a blank screen — browserLocalPersistence
// avoids that code path and works fine there.
const platform = typeof window !== "undefined" && window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform();
const nativePersistence = platform === "android" ? indexedDBLocalPersistence : platform === "ios" ? browserLocalPersistence : null;

const app = isFirebaseConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const auth = app
  ? (nativePersistence ? initializeAuth(app, { persistence: nativePersistence }) : getAuth(app))
  : null;
export const db = app ? getDatabase(app) : null;

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
