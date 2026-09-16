/* Firebase project configuration.
 *
 * 1. Create a free project at https://console.firebase.google.com
 * 2. Project settings → General → Your apps → add a Web app → copy its
 *    config object and paste the values below.
 * 3. Use the SAME config as the truck-talk-webapp course repo — that's
 *    what connects the two. See README.md → "Setup" for the full
 *    walkthrough.
 *
 * These values are not secret — they identify your project, not authorize
 * access to it. Real access control lives in firestore.rules, not here.
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/* The single owner account. Auto-approved as "owner" on first sign-in,
 * bypassing the request queue. Also checked independently in
 * firestore.rules — that server-side copy is the real security boundary,
 * this one is just so the client UI knows to skip the request screen. */
export const OWNER_EMAIL = "abdujalilov7707@gmail.com";
