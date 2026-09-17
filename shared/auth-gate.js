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
import { auth, db, googleProvider, appleProvider, isFirebaseConfigured } from "./firebase.js";
import { OWNER_EMAIL } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithPopup, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  ref, set, update, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const GOOGLE_ICON = `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4c-7.6 0-14.1 4.3-17.4 10.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.6C29.6 34.8 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.8 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C39.9 37.4 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>`;
const APPLE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.365 1.43c0 1.14-.415 2.09-1.244 2.86-.997.914-2.03 1.44-3.15 1.35-.075-1.09.435-2.14 1.235-2.87.87-.79 2.14-1.34 3.05-1.34.03 0 .07 0 .11 0zM20.36 17.02c-.494 1.13-.73 1.635-1.36 2.63-.884 1.395-2.13 3.13-3.68 3.145-1.38.014-1.735-.9-3.605-.885-1.87.014-2.26.9-3.64.885-1.55-.015-2.73-1.585-3.615-2.98C1.9 16.75 1.62 12.3 3.02 9.93c.99-1.665 2.55-2.64 4.005-2.64 1.48 0 2.415.9 3.64.9 1.19 0 1.92-.9 3.64-.9 1.3 0 2.68.71 3.665 1.935-3.22 1.765-2.7 6.36.39 7.795z"/></svg>`;

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
    "auth/email-already-in-use": "That email already has an account. Try signing in instead.",
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/wrong-password": "Incorrect password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/account-exists-with-different-credential": "An account already exists with this email using a different sign-in method.",
    "auth/operation-not-allowed": "This sign-in method isn't turned on yet — ask the owner to enable it in Firebase.",
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
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
  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">${isReset ? "Reset your password" : isSignup ? "Create your account" : "Sign in"}</h1>
      <p class="auth-sub">${isReset ? "We'll email you a reset link." : "New accounts need owner or manager approval before you get access."}</p>
      ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ""}
      ${!isReset ? `
        <div class="auth-providers">
          <button type="button" class="auth-btn-provider" id="googleBtn" ${busy ? "disabled" : ""}>${GOOGLE_ICON}<span>Continue with Google</span></button>
          <button type="button" class="auth-btn-provider" id="appleBtn" ${busy ? "disabled" : ""}>${APPLE_ICON}<span>Continue with Apple</span></button>
        </div>
        <div class="auth-divider">or</div>
      ` : ""}
      <form id="authForm" class="auth-form">
        <label class="auth-label" for="authEmail">Email</label>
        <input class="auth-input" id="authEmail" type="email" autocomplete="email" required>
        ${!isReset ? `
          <label class="auth-label" for="authPassword">Password</label>
          <input class="auth-input" id="authPassword" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="6">
        ` : ""}
        <button class="btn btn-accent" type="submit" style="margin-top:14px;width:100%;" ${busy ? "disabled" : ""}>
          ${busy ? "Please wait…" : isReset ? "Send reset link" : isSignup ? "Create account" : "Sign in with email"}
        </button>
      </form>
      <div class="auth-links">
        ${isReset
          ? `<button class="auth-link-btn" data-mode="signin">Back to sign in</button>`
          : isSignup
            ? `<button class="auth-link-btn" data-mode="signin">Already have an account? Sign in</button>`
            : `<button class="auth-link-btn" data-mode="signup">Create an account with email</button><button class="auth-link-btn" data-mode="reset">Forgot password?</button>`}
      </div>
    </div></div>`;

  $("authForm").addEventListener("submit", onEmailAuthSubmit);
  const g = $("googleBtn"); if (g) g.addEventListener("click", () => signInWithProvider(googleProvider));
  const a = $("appleBtn"); if (a) a.addEventListener("click", () => signInWithProvider(appleProvider));
  root().querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => { mode = btn.dataset.mode; errorMsg = ""; renderAuthScreen(); });
  });
}

async function signInWithProvider(provider){
  errorMsg = ""; busy = true; renderAuthScreen();
  try{
    await signInWithPopup(auth, provider);
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
      alert("Password reset email sent — check your inbox.");
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
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">Complete your profile</h1>
      <p class="auth-sub">Tell us your name, then request access. An owner or manager will review your request — you'll get in as soon as they approve it.</p>
      ${errorMsg ? `<div class="auth-error">${escapeHtml(errorMsg)}</div>` : ""}
      <form id="profileForm" class="auth-form">
        <label class="auth-label" for="profName">Full name</label>
        <input class="auth-input" id="profName" type="text" value="${escapeHtml(user.displayName || "")}" required>
        <button class="btn btn-accent" type="submit" style="margin-top:14px;width:100%;" ${busy ? "disabled" : ""}>${busy ? "Please wait…" : "Request access"}</button>
      </form>
      <div class="auth-links"><button class="auth-link-btn" id="cancelProfileBtn">Sign out</button></div>
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
  await set(ref(db, "users/" + user.uid), profile);
}

/* ---------------- Pending / restricted / wrong-app screens ---------------- */
function renderPending(profile){
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">Awaiting approval</h1>
      <p class="auth-sub">Thanks, ${escapeHtml(profile.name || "")} — your request is in. An owner or manager needs to approve it before you can get in. This page updates automatically, no need to refresh.</p>
      <button class="btn btn-ghost btn-sm" id="pendingSignOut">Sign out</button>
    </div></div>`;
  $("pendingSignOut").addEventListener("click", () => signOut(auth));
}

function renderRestricted(){
  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <h1 class="auth-title">Access restricted</h1>
      <p class="auth-sub">Your access to this platform has been turned off. Contact your owner or manager if you think this is a mistake.</p>
      <button class="btn btn-ghost btn-sm" id="restrictedSignOut">Sign out</button>
    </div></div>`;
  $("restrictedSignOut").addEventListener("click", () => signOut(auth));
}

function renderWrongApp(profile){
  const forAdmin = opts.appKind === "main"; // signed into the course, but role isn't student
  const label = ROLE_LABEL[profile.role] || profile.role;
  const targetUrl = forAdmin ? opts.adminUrl : opts.mainUrl;

  if (targetUrl){
    // Nobody should have to click through to the right app — a student
    // has no reason to be on the admin dashboard (or vice versa), so send
    // them straight there the moment we know their role doesn't match.
    root().innerHTML = `
      <div class="auth-screen"><div class="auth-card">
        <span class="auth-brand">TRUCK TALK</span>
        <h1 class="auth-title">Redirecting…</h1>
        <p class="auth-sub">Taking you to ${forAdmin ? "the admin dashboard" : "the course"}.</p>
        <div class="auth-links"><button class="auth-link-btn" id="wrongAppSignOut">Wrong account? Sign out</button></div>
      </div></div>`;
    $("wrongAppSignOut").addEventListener("click", () => signOut(auth));
    window.location.replace(targetUrl);
    return;
  }

  root().innerHTML = `
    <div class="auth-screen"><div class="auth-card">
      <span class="auth-brand">TRUCK TALK</span>
      <span class="auth-role-pill">${escapeHtml(label)}</span>
      <h1 class="auth-title">${forAdmin ? "This is the student course" : "This is the admin dashboard"}</h1>
      <p class="auth-sub">${forAdmin ? `Your account is a ${label.toLowerCase()} account — head to the admin dashboard instead.` : "Your account is a student account — head back to the course."}</p>
      <div class="auth-notice">${forAdmin ? "Ask your owner or manager for the admin dashboard link." : "Ask your owner or manager for the course link."}</div>
      <div class="auth-links"><button class="auth-link-btn" id="wrongAppSignOut">Sign out</button></div>
    </div></div>`;
  $("wrongAppSignOut").addEventListener("click", () => signOut(auth));
}

/* ---------------- Wiring into the host app ---------------- */
function mountApp(user, profile){
  showAppShell(true);
  window.TTE_user = { uid: user.uid, name: profile.name, email: profile.email, role: profile.role, teacherId: profile.teacherId || null };
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
  update(ref(db, "users/" + user.uid), { lastActive: serverTimestamp() }).catch(() => {});

  if (!window.TTE_mounted){
    window.TTE_mounted = true;
    window.TTE_mount && window.TTE_mount();
  } else {
    window.TTE_refresh && window.TTE_refresh();
  }
}

function handleProfile(user, profile){
  if (profile.status === "restricted"){
    showAppShell(false);
    renderRestricted();
    return;
  }
  if (profile.status !== "approved" || !profile.role){
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
    showAppShell(false);
    renderWrongApp(profile);
    return;
  }
  mountApp(user, profile);
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

  onAuthStateChanged(auth, (user) => {
    busy = false;
    if (unsubProfile){ unsubProfile(); unsubProfile = null; }

    if (!user){
      showAppShell(false);
      window.TTE_user = null;
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
