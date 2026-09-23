/* Truck Talk — shared account gate: sign in (Google / Apple / email),
 * "complete your profile → request access", pending/restricted screens,
 * and routing a signed-in, approved user to the right app.
 *
 * This is a copy of the same file from the truck-talk-webapp repo (the
 * course site), kept in sync by hand — both repos point at the same
 * Firebase project via firebase-config.js, so accounts/roles/data are
 * shared even though the code lives in two repos. If you change auth
 * behavior here, mirror the change there too (and vice versa).
 *
 * appKind here is always "admin". Once a user is signed in, approved, and
 * is NOT a student, this hands off to admin.js via window.TTE_mount() /
 * window.TTE_refresh() rather than rendering any app UI itself — this
 * module only ever owns the full-screen gate states.
 */
import { auth, db, googleProvider, isFirebaseConfigured, usesRedirectSignIn } from "./firebase.js";
import { OWNER_EMAIL } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  ref, set, update, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const GOOGLE_ICON = `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4c-7.6 0-14.1 4.3-17.4 10.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.6C29.6 34.8 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.8 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C39.9 37.4 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>`;
// Apple sign-in is coded and ready (see git history / firebase.js's
// appleProvider) but hidden here — it needs an Apple Developer Program
// membership ($99/yr) to create the Services ID, Team ID, Key ID and
// private key that Firebase requires before it will actually accept an
// Apple sign-in (the console's on/off switch alone does nothing without
// them: attempting it still fails with auth/operation-not-allowed).
// Re-enable by restoring the Apple button below and the appleProvider
// import once that's set up.

// Interface text goes through shared/i18n.js (window.TT_t); falls back to
// the English key if that script isn't loaded.
const T = (k, v) => (window.TT_t ? window.TT_t(k, v) : String(k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)));
let redraw = null;   // re-renders whichever gate screen is showing, when the language changes
// New (non-owner) sign-ups get immediate, temporary access — a 3-day free
// trial — instead of waiting on approval. They're written with
// status:"pending", role:"student" (see requestAccess below); database.rules.json's
// creation rule requires exactly that shape from a self-write. An owner or
// manager can approve (making access permanent, any role) or restrict
// (ending it immediately) at any point, trial running or not — see
// admin/admin.js's approveUser/setUserStatus. trialInfo() below is the one
// place that defines "3 days" and is used both to gate access here and to
// show the days-left banner once mounted.
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
function trialInfo(profile){
  const start = typeof profile.createdAt === "number" ? profile.createdAt : Date.now();
  const end = start + TRIAL_MS;
  const msLeft = end - Date.now();
  return { active: msLeft > 0, daysLeft: Math.max(0, Math.ceil(msLeft / 86400000)), end };
}
// A trial user's status is "pending" for as long as they're mid-trial —
// re-check right when it lapses so an open tab doesn't keep showing the
// app past expiry until the next unrelated re-render.
let trialTimer = null;
function scheduleTrialRecheck(user, profile, msUntilExpiry){
  clearTimeout(trialTimer);
  if (msUntilExpiry == null) return;
  trialTimer = setTimeout(() => handleProfile(user, profile), Math.min(Math.max(msUntilExpiry, 0) + 1000, 2147483647));
}

const ROLE_LABEL = { owner: "Owner", manager: "Manager", teacher: "Teacher", student: "Student" };

let opts = null;
let unsubProfile = null;
let mode = "signin"; // signin | signup | reset
let errorMsg = "";
let busy = false;

function $(id){ return document.getElementById(id); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function root(){
  let el = document.getElementById("authRoot");
  if (!el){
    el = document.createElement("div");
    el.id = "authRoot";
    document.body.prepend(el);
  }
  if (!el.dataset.langWired){
    el.dataset.langWired = "1";
    // Every gate screen gets the EN | UZ | RU switch at the top of its card.
    const addLang = () => {
      const card = el.querySelector(".auth-card");
      if (!card || card.querySelector(".auth-lang") || !window.TT_langSwitchHtml) return;
      const bar = document.createElement("div");
      bar.className = "auth-lang";
      bar.innerHTML = window.TT_langSwitchHtml();
      card.prepend(bar);
      window.TT_bindLangSwitch(bar);
    };
    new MutationObserver(addLang).observe(el, { childList: true });
    if (window.TT_onLang) window.TT_onLang(() => {
      const shell = document.getElementById("appShell");
      if (redraw && !(shell && !shell.hidden)) redraw();   // never paint a gate screen over the running app
    });
  }
  return el;
}

function showAppShell(show){
  const gate = document.getElementById("authRoot");
  const shell = document.getElementById("appShell");
  if (gate) gate.hidden = show;
  if (shell) shell.hidden = !show;
}

function mapAuthError(err){
  const code = err && err.code;
  const map = {
    "auth/email-already-in-use": T("That email already has an account. Try signing in instead."),
    "auth/invalid-email": T("That doesn't look like a valid email address."),
    "auth/weak-password": T("Password must be at least 6 characters."),
    "auth/wrong-password": T("Incorrect password."),
    "auth/user-not-found": T("No account found with that email."),
    "auth/invalid-credential": T("Incorrect email or password."),
    "auth/too-many-requests": T("Too many attempts. Please wait a moment and try again."),
    "auth/popup-closed-by-user": T("Sign-in was cancelled."),
    "auth/cancelled-popup-request": T("Sign-in was cancelled."),
    "auth/account-exists-with-different-credential": T("An account already exists with this email using a different sign-in method."),
    "auth/operation-not-allowed": T("This sign-in method isn't turned on yet — ask the owner to enable it in Firebase."),
  };
  return map[code] || (err && err.message) || T("Something went wrong. Please try again.");
}

/* ---------------- Not configured ---------------- */
function renderNotConfigured(){
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">Setup needed</h1>
      <p class="auth-sub">This copy hasn't been connected to Firebase yet. Add your project config to <code>shared/firebase-config.js</code>, then reload. See README.md for the full setup guide.</p>
    </div></div>`;
}

/* ---------------- Sign in / sign up / reset ---------------- */
function renderAuthScreen(){
  redraw = renderAuthScreen;
  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">${isReset ? T("Reset your password") : isSignup ? T("Create your account") : T("Sign in")}</h1>
      <p class="auth-sub">${isReset ? T("We'll email you a reset link.") : T("New accounts need owner or manager approval before you get access.")}</p>
      ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ""}
      ${!isReset ? `
        <div class="auth-providers">
          <button type="button" class="auth-btn-provider" id="googleBtn" ${busy ? "disabled" : ""}>${GOOGLE_ICON}<span>${T("Continue with Google")}</span></button>
        </div>
        <div class="auth-divider">${T("or")}</div>
      ` : ""}
      <form id="authForm" class="auth-form">
        <label class="auth-label" for="authEmail">${T("Email")}</label>
        <input class="auth-input" id="authEmail" type="email" autocomplete="email" required>
        ${!isReset ? `
          <label class="auth-label" for="authPassword">${T("Password")}</label>
          <input class="auth-input" id="authPassword" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="6">
        ` : ""}
        <button class="btn btn-accent" type="submit" style="margin-top:14px;width:100%;" ${busy ? "disabled" : ""}>
          ${busy ? T("Please wait…") : isReset ? T("Send reset link") : isSignup ? T("Create account") : T("Sign in with email")}
        </button>
      </form>
      <div class="auth-links">
        ${isReset
          ? `<button class="auth-link-btn" data-mode="signin">${T("Back to sign in")}</button>`
          : isSignup
            ? `<button class="auth-link-btn" data-mode="signin">${T("Already have an account? Sign in")}</button>`
            : `<button class="auth-link-btn" data-mode="signup">${T("Create an account with email")}</button><button class="auth-link-btn" data-mode="reset">${T("Forgot password?")}</button>`}
      </div>
    </div></div>`;

  $("authForm").addEventListener("submit", onEmailAuthSubmit);
  const g = $("googleBtn"); if (g) g.addEventListener("click", signInWithGoogle);
  root().querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => { mode = btn.dataset.mode; errorMsg = ""; renderAuthScreen(); });
  });
}

async function signInWithProvider(provider){
  errorMsg = ""; busy = true; renderAuthScreen();
  try{
    if (usesRedirectSignIn){ await signInWithRedirect(auth, provider); return; }
    await signInWithPopup(auth, provider);
  }catch(err){
    busy = false; errorMsg = mapAuthError(err); renderAuthScreen();
  }
}

// Inside the Capacitor Android app, window.__ttNativeAuth is set by
// vendor-auth-bridge.js (bundled by android-app's copy-web script) — that
// file doesn't exist on the live website, so this always falls through to
// the normal signInWithPopup path there. See native-auth-bridge.js and
// shared/firebase.js for why the native path needs a separate credential
// hand-off: Google blocks OAuth popups/redirects inside embedded WebViews,
// so the native app must sign in through Android's own Google Sign-In SDK
// and then hand that credential to the Firebase JS SDK manually.
async function signInWithGoogle(){
  if (!window.__ttNativeAuth){
    return signInWithProvider(googleProvider);
  }
  errorMsg = ""; busy = true; renderAuthScreen();
  try{
    const result = await window.__ttNativeAuth.signInWithGoogle();
    const idToken = result && result.credential && result.credential.idToken;
    if (!idToken) throw new Error(T("Google sign-in did not return a credential."));
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  }catch(err){
    busy = false; errorMsg = mapAuthError(err); renderAuthScreen();
  }
}

async function onEmailAuthSubmit(e){
  e.preventDefault();
  errorMsg = "";
  const email = $("authEmail").value.trim();
  const password = mode !== "reset" ? $("authPassword").value : null;

  busy = true; renderAuthScreen();
  try{
    if (mode === "signup"){
      await createUserWithEmailAndPassword(auth, email, password);
    } else if (mode === "reset"){
      await sendPasswordResetEmail(auth, email);
      busy = false; mode = "signin"; errorMsg = "";
      renderAuthScreen();
      alert(T("Password reset email sent — check your inbox."));
      return;
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  }catch(err){
    busy = false; errorMsg = mapAuthError(err); renderAuthScreen();
  }
}

/* ---------------- Complete profile → request access ---------------- */
function renderCompleteProfile(user){
  redraw = () => renderCompleteProfile(user);
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">${T("Complete your profile")}</h1>
      <p class="auth-sub">${T("Tell us your name to create your account and start your free 3-day trial — no approval needed.")}</p>
      ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ""}
      <form id="profileForm" class="auth-form">
        <label class="auth-label" for="profName">${T("Full name")}</label>
        <input class="auth-input" id="profName" type="text" value="${escapeHtml(user.displayName || "")}" required>
        <button class="btn btn-accent" type="submit" style="margin-top:14px;width:100%;" ${busy ? "disabled" : ""}>${busy ? T("Please wait…") : T("Create account")}</button>
      </form>
      <div class="auth-links"><button class="auth-link-btn" id="cancelProfileBtn">${T("Sign out")}</button></div>
    </div></div>`;

  $("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("profName").value.trim();
    if (!name) return;
    busy = true; errorMsg = ""; renderCompleteProfile(user);
    try{
      await requestAccess(user, name);
    }catch(err){
      busy = false; errorMsg = mapAuthError(err); renderCompleteProfile(user);
    }
  });
  $("cancelProfileBtn").addEventListener("click", () => signOut(auth));
}

async function requestAccess(user, name){
  // Not lower-cased: this must byte-for-byte match auth.token.email in
  // database.rules.json, which is what actually decides owner bootstrap.
  const email = user.email || "";
  const isOwner = email === OWNER_EMAIL;
  const profile = {
    name,
    email,
    photoURL: user.photoURL || null,
    provider: (user.providerData[0] && user.providerData[0].providerId) || "password",
    status: isOwner ? "approved" : "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  };
  if (isOwner) profile.role = "owner";
  else profile.role = "student";   // immediate 3-day trial access, see trialInfo() above
  await set(ref(db, "users/" + user.uid), profile);
}

/* ---------------- Pending / restricted / wrong-app screens ---------------- */
function renderPending(profile){
  redraw = () => renderPending(profile);
  // Every non-owner sign-up gets role:"student" immediately (see
  // requestAccess), so landing here while still "pending" with that role
  // can only mean the 3-day trial ran out — anything else (no role at all)
  // is a genuine, not-yet-reviewed request.
  const expired = profile.role === "student";
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">${expired ? T("Free trial ended") : T("Awaiting approval")}</h1>
      <p class="auth-sub">${expired
        ? T("Thanks, {name} — your free trial has ended. An owner or manager needs to approve your account so you can keep using Truck Talk. This page updates automatically, no need to refresh.", { name: escapeHtml(profile.name || "") })
        : T("Thanks, {name} — your request is in. An owner or manager needs to approve it before you can get in. This page updates automatically, no need to refresh.", { name: escapeHtml(profile.name || "") })}</p>
      <button class="btn btn-ghost btn-sm" id="pendingSignOut">${T("Sign out")}</button>
    </div></div>`;
  $("pendingSignOut").addEventListener("click", () => signOut(auth));
}

function renderRestricted(){
  redraw = renderRestricted;
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">${T("Access restricted")}</h1>
      <p class="auth-sub">${T("Your access to this platform has been turned off. Contact your owner or manager if you think this is a mistake.")}</p>
      <button class="btn btn-ghost btn-sm" id="restrictedSignOut">${T("Sign out")}</button>
    </div></div>`;
  $("restrictedSignOut").addEventListener("click", () => signOut(auth));
}

function renderWrongApp(profile){
  redraw = () => renderWrongApp(profile);
  const forAdmin = opts.appKind === "main"; // signed into the course, but role isn't student
  const label = ROLE_LABEL[profile.role] ? T(ROLE_LABEL[profile.role]) : profile.role;
  const targetUrl = forAdmin ? opts.adminUrl : opts.mainUrl;

  if (targetUrl){
    // Nobody should have to click through to the right app — a student
    // has no reason to be on the admin dashboard (or vice versa), so send
    // them straight there the moment we know their role doesn't match.
    root().innerHTML = `
      <div class="auth-screen"><div class="auth-card">
        <span class="auth-brand">TRUCK TALK</span>
        <h1 class="auth-title">${T("Redirecting…")}</h1>
        <p class="auth-sub">${forAdmin ? T("Taking you to the admin dashboard.") : T("Taking you to the course.")}</p>
        <div class="auth-links"><button class="auth-link-btn" id="wrongAppSignOut">${T("Wrong account? Sign out")}</button></div>
      </div></div>`;
    $("wrongAppSignOut").addEventListener("click", () => signOut(auth));
    window.location.replace(targetUrl);
    return;
  }

  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <span class="auth-role-pill">${escapeHtml(label)}</span>
      <h1 class="auth-title">${forAdmin ? T("This is the student course") : T("This is the admin dashboard")}</h1>
      <p class="auth-sub">${forAdmin ? T("Your account is a {role} account — head to the admin dashboard instead.", { role: label.toLowerCase() }) : T("Your account is a student account — head back to the course.")}</p>
      <div class="auth-notice">${forAdmin ? T("Ask your owner or manager for the admin dashboard link.") : T("Ask your owner or manager for the course link.")}</div>
      <div class="auth-links"><button class="auth-link-btn" id="wrongAppSignOut">${T("Sign out")}</button></div>
    </div></div>`;
  $("wrongAppSignOut").addEventListener("click", () => signOut(auth));
}

/* ---------------- Wiring into the host app ---------------- */
function mountApp(user, profile, trial){
  redraw = null;   // the gate is done; a language change now belongs to the host app
  showAppShell(true);
  // auth.currentUser.email is the source of truth (e.g. after someone
  // completes a verifyBeforeUpdateEmail link, it changes there first);
  // reconcile the database copy whenever the two drift apart, rather
  // than writing it eagerly at change-email time before it's confirmed.
  const email = user.email || profile.email;
  const trialDaysLeft = trial && trial.active ? trial.daysLeft : null;
  const unlockFrom = typeof profile.unlockFrom === "number" ? profile.unlockFrom : null;
  const unlockTo = typeof profile.unlockTo === "number" ? profile.unlockTo : null;
  window.TTE_user = { uid: user.uid, name: profile.name, email, role: profile.role, teacherId: profile.teacherId || null, trialDaysLeft, unlockFrom, unlockTo };
  // Non-student roles get a voluntary link to the admin dashboard (shown
  // in the host app's own UI, e.g. Settings) — they are never forced
  // there. Only appKind "main" ever has a role other than student mount
  // here at all, so this is effectively "am I on the course site and not
  // a student".
  window.TTE_adminUrl = (profile.role !== "student" && opts.adminUrl) ? opts.adminUrl : null;
  window.TTE_signOut = () => signOut(auth);
  window.TTE_syncProgress = (progress) => {
    set(ref(db, "progress/" + user.uid), Object.assign({}, progress, { updatedAt: serverTimestamp() })).catch(() => {});
  };
  // Writing lastActive changes this same profile node, which re-fires the
  // onValue listener that called us — so the heartbeat is written once per
  // sign-in (not on every call), and the host is only refreshed when
  // something it actually shows changed. Otherwise the page redraws in a
  // never-ending loop.
  const heartbeat = {};
  if (heartbeatUid !== user.uid){ heartbeat.lastActive = serverTimestamp(); heartbeatUid = user.uid; }
  if (email && email !== profile.email) heartbeat.email = email;
  if (Object.keys(heartbeat).length) update(ref(db, "users/" + user.uid), heartbeat).catch(() => {});

  const signature = [user.uid, profile.name, email, profile.role, profile.teacherId || "", window.TTE_adminUrl || "", trialDaysLeft, unlockFrom, unlockTo].join("|");
  if (!window.TTE_mounted){
    window.TTE_mounted = true;
    mountedSignature = signature;
    window.TTE_mount && window.TTE_mount();
  } else if (signature !== mountedSignature){
    mountedSignature = signature;
    window.TTE_refresh && window.TTE_refresh();
  }
}
let heartbeatUid = null;
let mountedSignature = null;

function handleProfile(user, profile){
  if (profile.status === "restricted"){
    clearTimeout(trialTimer);
    showAppShell(false);
    renderRestricted();
    return;
  }
  const trial = profile.status === "pending" && profile.role === "student" ? trialInfo(profile) : null;
  const usable = profile.status === "approved" ? !!profile.role : !!(trial && trial.active);
  if (!usable){
    clearTimeout(trialTimer);
    showAppShell(false);
    renderPending(profile);
    return;
  }
  const isStudentRole = profile.role === "student";
  // The course site (appKind "main") is open to every approved role —
  // owner, manager, and teacher accounts can see the platform itself,
  // exactly like a student would, not just admin staff. The admin
  // dashboard (appKind "admin") is still staff-only: a student has no
  // data there and gets sent back to the course instead.
  const matchesThisApp = opts.appKind === "admin" ? !isStudentRole : true;
  if (!matchesThisApp){
    clearTimeout(trialTimer);
    showAppShell(false);
    renderWrongApp(profile);
    return;
  }
  if (trial && trial.active) scheduleTrialRecheck(user, profile, trial.end - Date.now());
  else clearTimeout(trialTimer);
  mountApp(user, profile, trial);
}

/**
 * @param {Object} userOpts
 * @param {"main"|"admin"} userOpts.appKind - which app this page is
 * @param {string|null} [userOpts.adminUrl] - where to send non-students on the main site (null: show guidance text instead of a link)
 * @param {string|null} [userOpts.mainUrl] - where to send students on the admin site (null: show guidance text instead of a link)
 */
export function initAuthGate(userOpts){
  opts = Object.assign({ appKind: "main", adminUrl: null, mainUrl: null }, userOpts);

  if (!isFirebaseConfigured){ renderNotConfigured(); return; }

  mode = "signin"; errorMsg = ""; busy = false;

  // Coming back from a redirect sign-in: the signed-in user arrives via
  // onAuthStateChanged below; this only surfaces a failed attempt.
  if (usesRedirectSignIn){
    getRedirectResult(auth).catch((err) => { busy = false; errorMsg = mapAuthError(err); renderAuthScreen(); });
  }

  onAuthStateChanged(auth, (user) => {
    busy = false;
    if (unsubProfile){ unsubProfile(); unsubProfile = null; }

    if (!user){
      clearTimeout(trialTimer);
      showAppShell(false);
      window.TTE_user = null; heartbeatUid = null;
      mode = "signin"; errorMsg = "";
      renderAuthScreen();
      return;
    }

    unsubProfile = onValue(ref(db, "users/" + user.uid), (snap) => {
      if (!snap.exists()){ renderCompleteProfile(user); return; }
      handleProfile(user, snap.val());
    }, (err) => {
      errorMsg = mapAuthError(err);
      renderAuthScreen();
    });
  });
}

export function signOutUser(){ return signOut(auth); }
