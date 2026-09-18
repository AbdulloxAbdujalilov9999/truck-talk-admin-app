/* Bundled into www/vendor-auth-bridge.js by `npm run copy-web` (esbuild).
 * Not loaded on the live website — only exists inside the Capacitor app's
 * www/, where index.html gets an extra <script> tag pointing at the bundled
 * output. auth-gate.js checks for window.__ttNativeAuth before falling back
 * to the normal web signInWithPopup flow, so the same auth-gate.js file
 * works correctly on both the website and the native app.
 *
 * Why this exists: Google blocks OAuth sign-in inside embedded WebViews
 * (disallowed_useragent), so signInWithPopup/signInWithRedirect can't work
 * inside the packaged Android app the way it does in a real browser. This
 * plugin instead calls Android's native Google Sign-In SDK directly.
 */
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

window.__ttNativeAuth = {
  signInWithGoogle: () => FirebaseAuthentication.signInWithGoogle(),
};
