/* Truck Talk — Admin platform (owner / manager / teacher).
 * Sections: Users (owner/manager), Students, Progress, Calendar, Account.
 *
 * Standalone repo: shares a Firebase project (Auth + Realtime Database)
 * with the truck-talk-webapp course repo via shared/firebase-config.js,
 * but has no access to that repo's curriculum.js/grammar.js — so the
 * Progress section shows lesson/homework/grammar completion by day/
 * session/unit number and score only (no lesson titles or "X/60"-style
 * totals). See dayTitle(), grammarTitle(), homeworkSessionsTotal() below,
 * which degrade gracefully when CURRICULUM/GRAMMAR aren't defined.
 *
 * Backend is Realtime Database, not Firestore (see shared/firebase.js for
 * why). RTDB security rules can't constrain an arbitrary query the way
 * Firestore's can, so "a teacher can only list their own students" is done
 * via a small denormalized index — /teacherStudents/{teacherId}/{uid} —
 * kept in sync whenever a student's teacherId changes (see approveUser,
 * setUserRole, reassignTeacher below). A teacher reads their own slice of
 * that index (allowed by rules), then reads each of those specific student
 * records individually (also allowed by rules, since each student's own
 * teacherId field names them) — never a broad query over all of /users.
 */
import { db, auth } from "./shared/firebase.js";
import { initAuthGate } from "./shared/auth-gate.js";
import {
  ref, onValue, set, update, remove, push, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import {
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const ROLE_LABEL = { owner: "Owner", manager: "Manager", teacher: "Teacher", student: "Student" };

// A brand-new sign-up is written as status:"pending", role:"student" and
// gets 3 days of full course access before needing an owner/manager's
// approval — see trialInfo() in shared/auth-gate.js, which is the other
// half of this (and the actual access gate; this file only displays it).
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
function trialDaysLeft(u){
  if (u.status !== "pending" || u.role !== "student") return null;
  const start = typeof u.createdAt === "number" ? u.createdAt : Date.now();
  return Math.max(0, Math.ceil((start + TRIAL_MS - Date.now()) / 86400000));
}
function statusLabel(u){
  const days = trialDaysLeft(u);
  if (days == null) return u.status;
  return days > 0 ? `Trial · ${days}d left` : "Trial expired";
}
function statusClass(u){
  const days = trialDaysLeft(u);
  if (days == null) return "status-" + u.status;
  return days > 0 ? "status-trial" : "status-pending";
}
function joinedLabel(u){
  if (typeof u.createdAt !== "number") return "";
  return new Date(u.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

let state = { filters: { users: "all", students: "all" }, section: "users", selectedStudent: null, selectedTeacherId: null };
let usersCache = [];
let usersById = new Map();
let progressCache = new Map();
let progressUnsubs = new Map();
let resetsCache = new Map();   // studentUid -> { id: request }
let resetsUnsubs = new Map();
let eventsCache = [];
let unsubUsers = null;
let unsubTeacherStudentsIndex = null;
let studentUnsubs = new Map(); // uid -> unsub (teacher mode only)
let unsubEvents = null;

// While a section is being built off-screen (see renderSection), lookups
// resolve inside that detached tree first.
let renderRoot = null;
function $(id){ return (renderRoot && renderRoot.querySelector("#" + id)) || document.getElementById(id); }
function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function me(){ return window.TTE_user; }
function isOwner(){ return me().role === "owner"; }
function isManager(){ return me().role === "manager"; }
function isOwnerOrManager(){ return isOwner() || isManager(); }
function isTeacher(){ return me().role === "teacher"; }
function userName(uid){
  if (uid === me().uid) return me().name;
  const u = usersById.get(uid);
  return u ? u.name : "Unknown";
}

let toastTimer = null;
function toast(msg){
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function closeModal(){ $("modalRoot").innerHTML = ""; }

/* ---------------- Curriculum-derived totals (read-only reference) ---------------- */
function dayTitle(dayNum){
  if (typeof CURRICULUM === "undefined") return "";
  const d = CURRICULUM.find(x => x.d === dayNum);
  return d ? d.t : "";
}
function grammarTitle(id){
  if (typeof GRAMMAR === "undefined") return id;
  const g = GRAMMAR.find(x => x.id === id);
  return g ? g.title : id;
}
function homeworkSessionsTotal(){
  if (typeof CURRICULUM === "undefined") return 0;
  const seen = new Set();
  CURRICULUM.forEach(d => { if (d.v) d.v.forEach(([en]) => seen.add(en.toLowerCase())); });
  return Math.ceil(seen.size / 20);
}

/* ---------------- Realtime Database subscriptions ---------------- */
function subscribeUsers(){
  if (unsubUsers) unsubUsers();
  if (unsubTeacherStudentsIndex) unsubTeacherStudentsIndex();
  studentUnsubs.forEach(unsub => unsub());
  studentUnsubs.clear();

  if (isOwnerOrManager()){
    unsubUsers = onValue(ref(db, "users"), (snap) => {
      const val = snap.val() || {};
      usersCache = Object.entries(val)
        .map(([id, u]) => ({ id, ...u }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      usersById = new Map(usersCache.map(u => [u.id, u]));
      updateUsersBadge();
      renderSection();
    }, (err) => toast(err.message));
    return;
  }

  // Teacher: look up my student IDs from the index, then read each one
  // individually — see the file header comment for why.
  unsubTeacherStudentsIndex = onValue(ref(db, "teacherStudents/" + me().uid), (snap) => {
    syncStudentSubs(Object.keys(snap.val() || {}));
  }, (err) => toast(err.message));
}

function syncStudentSubs(ids){
  const keep = new Set(ids);
  for (const [uid, unsub] of studentUnsubs){
    if (!keep.has(uid)){ unsub(); studentUnsubs.delete(uid); usersById.delete(uid); }
  }
  ids.forEach(uid => {
    if (studentUnsubs.has(uid)) return;
    const unsub = onValue(ref(db, "users/" + uid), (snap) => {
      if (snap.exists()) usersById.set(uid, { id: uid, ...snap.val() });
      else usersById.delete(uid);
      usersCache = Array.from(usersById.values());
      renderSection();
    }, () => {});
    studentUnsubs.set(uid, unsub);
  });
}

function updateUsersBadge(){
  const el = $("navUsersBadge");
  if (!el) return;
  const n = usersCache.filter(u => u.status === "pending").length;
  el.textContent = String(n);
  el.hidden = n === 0;
}

let subscribedEventsTeacherId; // sentinel (undefined): nothing subscribed yet
function subscribeEvents(teacherId){
  if (subscribedEventsTeacherId === teacherId) return; // already on this teacher — avoid resubscribing on every render
  subscribedEventsTeacherId = teacherId;
  if (unsubEvents) unsubEvents();
  if (!teacherId){ eventsCache = []; unsubEvents = null; return; }
  unsubEvents = onValue(ref(db, "events/" + teacherId), (snap) => {
    const val = snap.val() || {};
    eventsCache = Object.entries(val)
      .map(([id, ev]) => ({ id, ...ev }))
      .sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    if (state.section === "calendar") renderSection();
  }, (err) => toast(err.message));
}

function syncProgressSubs(uids){
  const keep = new Set(uids);
  for (const [uid, unsub] of progressUnsubs){
    if (!keep.has(uid)){ unsub(); progressUnsubs.delete(uid); }
  }
  uids.forEach(uid => {
    if (progressUnsubs.has(uid)) return;
    const unsub = onValue(ref(db, "progress/" + uid), (snap) => {
      progressCache.set(uid, snap.exists() ? snap.val() : null);
      if (state.section === "students" || (state.section === "progress" && state.selectedStudent === uid)) renderSection();
    }, () => {});
    progressUnsubs.set(uid, unsub);
  });
}

/* ---------------- Writes ---------------- */
// <option>s for the "reset a lesson" picker. The admin site has no
// curriculum data of its own, so it falls back to plain day numbers.
function dayOptions(p, selected){
  const days = typeof CURRICULUM !== "undefined" ? CURRICULUM.map(d => ({ d: d.d, t: d.t })) : Array.from({ length: 60 }, (_, i) => ({ d: i + 1, t: "" }));
  return days.map(x => `<option value="${x.d}"${String(x.d) === String(selected) ? " selected" : ""}>Day ${x.d}${x.t ? " — " + escapeHtml(x.t) : ""}${p && p.completed && p.completed[x.d] ? "  ✓" : ""}</option>`).join("");
}

function syncResetSubs(uid){
  if (resetsUnsubs.has(uid)) return;
  const unsub = onValue(ref(db, "resets/" + uid), (snap) => {
    resetsCache.set(uid, snap.exists() ? snap.val() : {});
    if (state.section === "progress" && state.selectedStudent === uid && !$("modalRoot").innerHTML) renderSection();
  }, () => {});
  resetsUnsubs.set(uid, unsub);
}

// Staff can't rewrite a student's local progress directly (it's stored on
// their own device), so this queues the reset for their app to apply (see
// applyRemoteResets in app.js) — but there's no approval step on their
// end, it's not something they can decline. It applies immediately if
// they're online right now, otherwise the next time they open the app.
async function queueReset(studentUid, kind, key){
  await push(ref(db, "resets/" + studentUid), {
    kind, key: String(key), by: me().uid, byName: me().name || "", at: serverTimestamp(),
  });
}
// Unlike resets above, this writes straight to the student's own profile —
// a field their already-open app is already listening to — so there's no
// queue and nothing for them to apply: it's just live, the moment this
// write lands (immediately if they're online, same as any other profile
// change like a teacher reassignment).
function canGrantUnlock(student){
  return isOwnerOrManager() || (isTeacher() && student.teacherId === me().uid);
}
async function setUnlockRange(studentUid, from, to){
  await update(ref(db), {
    [`users/${studentUid}/unlockFrom`]: from,
    [`users/${studentUid}/unlockTo`]: to,
  });
}
async function clearUnlockRange(studentUid){
  await update(ref(db), {
    [`users/${studentUid}/unlockFrom`]: null,
    [`users/${studentUid}/unlockTo`]: null,
  });
}
function resetLabel(r){
  if (r.kind === "lesson") return "Day " + r.key + (dayTitle(Number(r.key)) ? " — " + dayTitle(Number(r.key)) : "");
  if (r.kind === "homework") return "Homework session #" + (Number(r.key) + 1);
  if (r.kind === "grammar") return grammarTitle(r.key);
  return r.kind + " " + r.key;
}
function openResetModal(studentUid, kind, key){
  const student = usersById.get(studentUid);
  const label = resetLabel({ kind, key });
  $("modalRoot").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>Reset ${escapeHtml(kind === "lesson" ? "lesson" : kind === "homework" ? "homework session" : "grammar unit")}?</h2>
        <p class="panel-sub"><strong>${escapeHtml(label)}</strong> for <strong>${escapeHtml(student ? student.name : "this student")}</strong>.</p>
        <p class="panel-sub" style="margin-top:8px;">Their completion, quiz answers and practice for this item are cleared and the XP they earned from it is taken back, so they can do it again. Everything else stays. It applies the next time they open the app (right away if it's already open).</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="resetCancel">Cancel</button>
          <button class="btn btn-accent" id="resetConfirm">Reset it</button>
        </div>
      </div>
    </div>`;
  $("resetCancel").addEventListener("click", closeModal);
  $("resetConfirm").addEventListener("click", async () => {
    $("resetConfirm").disabled = true;
    try{ await queueReset(studentUid, kind, key); closeModal(); toast("Reset done — applied now if they're online, or the next time they open the app."); renderSection(); }
    catch(err){ $("resetConfirm").disabled = false; alert("Couldn't reset it: " + err.message); }
  });
}

async function approveUser(uid, role, teacherId){
  const u = usersById.get(uid);
  const wasRestricted = u && u.status === "restricted";
  // A restricted student's old teacherStudents index entry is otherwise
  // never cleaned up (restricting only flips status) — this path also
  // grants access back to a restricted account with a fresh role, so
  // clear it whenever the teacher is changing or gone.
  const oldTeacherId = u && u.teacherId;
  const updates = {
    [`users/${uid}/role`]: role,
    [`users/${uid}/status`]: "approved",
    [`users/${uid}/updatedAt`]: serverTimestamp(),
    [`users/${uid}/teacherId`]: role === "student" ? (teacherId || null) : null,
  };
  if (oldTeacherId && oldTeacherId !== teacherId) updates[`teacherStudents/${oldTeacherId}/${uid}`] = null;
  if (role === "student" && teacherId) updates[`teacherStudents/${teacherId}/${uid}`] = true;
  await update(ref(db), updates);
  toast(wasRestricted ? "Access granted." : "Approved.");
}
async function setUserStatus(uid, status){
  await update(ref(db), { [`users/${uid}/status`]: status, [`users/${uid}/updatedAt`]: serverTimestamp() });
  toast(status === "restricted" ? "Access restricted." : "Access restored.");
}
// Removes a restricted person's records in one atomic multi-path write. (Their
// sign-in account itself can't be removed from here — that needs the Firebase
// Admin SDK — but with no profile they're back to "request access".)
async function deleteUser(uid){
  const u = usersById.get(uid);
  if (!u || u.status !== "restricted" || !canManage(u) || u.role === "owner") return;
  const updates = { [`users/${uid}`]: null, [`progress/${uid}`]: null, [`resets/${uid}`]: null };
  if (u.role === "student" && u.teacherId) updates[`teacherStudents/${u.teacherId}/${uid}`] = null;
  if (u.role === "teacher"){
    updates[`teacherStudents/${uid}`] = null;
    updates[`events/${uid}`] = null;
    usersCache.filter(x => x.role === "student" && x.teacherId === uid)
      .forEach(x => { updates[`users/${x.id}/teacherId`] = null; });
  }
  try{
    await update(ref(db), updates);
    toast("User deleted.");
  }catch(err){
    alert("Couldn't delete this user: " + err.message);
  }
}
async function setUserRole(uid, role){
  const u = usersById.get(uid);
  const oldTeacherId = u && u.teacherId;
  const updates = { [`users/${uid}/role`]: role, [`users/${uid}/updatedAt`]: serverTimestamp() };
  if (role === "student"){
    updates[`users/${uid}/teacherId`] = oldTeacherId || null;
  } else {
    updates[`users/${uid}/teacherId`] = null;
    if (oldTeacherId) updates[`teacherStudents/${oldTeacherId}/${uid}`] = null;
  }
  await update(ref(db), updates);
}
async function reassignTeacher(uid, teacherId){
  const u = usersById.get(uid);
  const oldTeacherId = u && u.teacherId;
  const updates = { [`users/${uid}/teacherId`]: teacherId || null, [`users/${uid}/updatedAt`]: serverTimestamp() };
  if (oldTeacherId && oldTeacherId !== teacherId) updates[`teacherStudents/${oldTeacherId}/${uid}`] = null;
  if (teacherId) updates[`teacherStudents/${teacherId}/${uid}`] = true;
  await update(ref(db), updates);
  toast("Teacher updated.");
}
async function sendReset(email){
  try{
    await sendPasswordResetEmail(auth, email);
    toast("Reset email sent to " + email + ".");
  }catch(err){
    alert(err.message);
  }
}
async function changeEmail(newEmail, currentPassword){
  // This project requires verifying the new address before it takes
  // effect (Firebase rejects a direct updateEmail with
  // auth/operation-not-allowed) — so this sends a confirm link to
  // newEmail rather than changing anything immediately. The database's
  // users/{uid}/email field is reconciled automatically on a later
  // sign-in once auth.currentUser.email actually changes — see
  // mountApp() in shared/auth-gate.js.
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await verifyBeforeUpdateEmail(user, newEmail);
  toast("Confirmation link sent to " + newEmail + " — click it to finish changing your email.");
}

/* ---------------- Shell ---------------- */
function initialSection(){ return isOwnerOrManager() ? "users" : "students"; }

const NAV_ICONS = {
  users: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.2a3.2 3.2 0 0 0-2.4-3.1"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/>',
  students: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5"/><path d="M22 9v6"/>',
  progress: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="0.6"/><rect x="12.5" y="8" width="3" height="9" rx="0.6"/><rect x="17.5" y="5" width="2.5" height="12" rx="0.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
};
function navIcon(id){
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[id] || ""}</svg>`;
}

function renderShell(){
  const shell = $("appShell");
  const navItems = [];
  if (isOwnerOrManager()) navItems.push(["users", "Users"]);
  navItems.push(["students", "Students"]);
  navItems.push(["progress", "Progress"]);
  navItems.push(["calendar", "Calendar"]);
  navItems.push(["account", "Account"]);

  // Same header + nav pattern as the course site: navy top bar with the nav
  // inline on desktop, and an app-style bottom tab bar on phones.
  shell.innerHTML = `
    <div class="admin-shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <img class="brand-logo" src="icons/icon-192.png" alt="" width="34" height="34">
            <div class="brand-text">
              <span class="brand-mark">TRUCK TALK</span>
              <span class="brand-sub">ADMIN DASHBOARD</span>
            </div>
          </div>
          <nav id="mainNav" aria-label="Main">
            ${navItems.map(([id, label]) => `
              <button class="navbtn" data-section="${id}">
                <span class="nav-icon">${navIcon(id)}</span>
                <span class="nav-label">${label}</span>
                ${id === "users" ? `<span class="ttx-badge" id="navUsersBadge" hidden>0</span>` : ""}
              </button>`).join("")}
          </nav>
          <div class="topbar-user">
            <span class="admin-user-name">${escapeHtml(me().name || me().email)}</span>
            <span class="admin-role-pill">${escapeHtml(ROLE_LABEL[me().role] || me().role)}</span>
            <button class="btn btn-ghost btn-sm" id="adminSignOut">Sign out</button>
          </div>
        </div>
      </header>
      <main id="adminApp" class="admin-content"></main>
    </div>`;

  shell.querySelectorAll("[data-section]").forEach(btn => {
    btn.addEventListener("click", () => setSection(btn.dataset.section, { selectedStudent: null }));
  });
  const content = $("adminApp");
  // Picking an option commits the choice; drop focus so the list refreshes
  // with the saved data, and catch up on any render skipped while focused.
  content.addEventListener("change", (e) => { if (e.target.tagName === "SELECT"){ selectBusyUntil = 0; e.target.blur(); } });
  content.addEventListener("pointerdown", (e) => { if (e.target.tagName === "SELECT") selectBusyUntil = Date.now() + 20000; });
  content.addEventListener("focusin", (e) => { if (e.target.tagName === "SELECT") selectBusyUntil = Date.now() + 20000; });
  content.addEventListener("focusout", () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (renderOwed && !(a && content.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) renderSection();
    }, 0);
  });
  $("adminSignOut").addEventListener("click", () => window.TTE_signOut && window.TTE_signOut());
  updateUsersBadge();
}

function setSection(section, extra){
  state.section = section;
  Object.assign(state, extra || {});
  document.querySelectorAll("#mainNav .navbtn").forEach(btn => btn.classList.toggle("active", btn.dataset.section === state.section));
  renderSection({ enter: true });
}

// Live data (new sign-ups, progress, heartbeats) re-renders the section
// constantly, so only a real section change plays the entrance animation,
// and a re-render never interrupts someone typing in a field.
let renderOwed = false;
function renderSection(opts){
  const main = $("adminApp");
  if (!main) return;
  const enter = !!(opts && opts.enter);
  // Don't rebuild the DOM under an open dropdown or a field being typed in:
  // replacing a <select> closes its list instantly. Remember that a render
  // is owed and do it as soon as focus leaves the field. (Android draws the
  // list as a native popup that can take focus away from the <select>, so a
  // recent tap on one also counts as "busy" for a short while.)
  const a = document.activeElement;
  const editing = a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "radio";
  if (!enter && (editing || Date.now() < selectBusyUntil)){
    renderOwed = true;
    clearTimeout(owedTimer);
    owedTimer = setTimeout(() => { if (renderOwed) renderSection(); }, Math.max(400, selectBusyUntil - Date.now() + 50));
    return;
  }
  renderOwed = false;

  // Build the section off-screen and only touch the page when the result
  // actually differs — live updates (heartbeats, other people's activity)
  // often change nothing visible, and those must not rebuild anything.
  const tmp = document.createElement("div");
  renderRoot = tmp;
  try{
    if (state.section === "users") renderUsersSection(tmp);
    else if (state.section === "students") renderStudentsSection(tmp);
    else if (state.section === "progress") renderProgressSection(tmp);
    else if (state.section === "calendar") renderCalendarSection(tmp);
    else if (state.section === "account") renderAccountSection(tmp);
    labelTableCells(tmp);
  } finally { renderRoot = null; }
  const html = tmp.innerHTML;
  if (!enter && html === lastSectionHtml) return;
  lastSectionHtml = html;
  main.classList.remove("enter");
  if (enter){ void main.offsetWidth; main.classList.add("enter"); }
  main.replaceChildren(...tmp.childNodes);
}
let lastSectionHtml = "";
let selectBusyUntil = 0;
let owedTimer = null;

// Phones show tables as stacked cards; each cell's label comes from its
// column header (pure CSS can't read the <th> text, so copy it onto the cell).
function labelTableCells(root){
  root.querySelectorAll(".admin-table").forEach(table => {
    const heads = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
    table.querySelectorAll("tbody tr").forEach(tr => {
      [...tr.children].forEach((td, i) => td.setAttribute("data-label", heads[i] || ""));
    });
  });
}

/* Segmented filter (same pill design as the EN | UZ | RU language switch). */
function filterSwitch(name, options, current){
  return `<div class="filter-bar"><div class="lang-switch filter-switch" role="group" aria-label="Filter">${options.map(o =>
    `<button type="button" data-filter="${name}" data-value="${escapeHtml(o.value)}" class="${o.value === current ? "active" : ""}">${escapeHtml(o.label)}${o.count != null ? ` <span class="filter-count">${o.count}</span>` : ""}</button>`).join("")}</div></div>`;
}
function wireFilters(main){
  main.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    state.filters[btn.dataset.filter] = btn.dataset.value;
    renderSection();
  }));
}

/* ---------------- Users section ---------------- */
function renderUsersSection(main){
  if (!isOwnerOrManager()){ main.innerHTML = `<p class="panel-sub">You don't have access to this section.</p>`; return; }
  const pending = usersCache.filter(u => u.status === "pending");
  const others = restrictedLast(usersCache.filter(u => u.status !== "pending"));
  const count = (r) => others.filter(u => u.role === r).length;
  const roleFilters = [
    { value: "all", label: "All", count: others.length },
    { value: "teacher", label: "Teachers", count: count("teacher") },
    { value: "student", label: "Students", count: count("student") },
  ];
  if (isOwner() || count("manager")) roleFilters.push({ value: "manager", label: "Managers", count: count("manager") });
  const roleFilter = roleFilters.some(f => f.value === state.filters.users) ? state.filters.users : "all";
  const shown = roleFilter === "all" ? others : others.filter(u => u.role === roleFilter);

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Pending requests</h2>
        <p class="panel-sub">People using their 3-day free trial, or waiting to be approved after it ends. Approve to give them permanent access any time — no need to wait for the trial to run out.</p></div>
      ${pending.length ? pending.map(u => userRow(u, true)).join("") : `<p class="panel-sub">No pending requests.</p>`}
    </section>
    <section class="panel">
      <div class="panel-head-row"><h2>All users (${shown.length})</h2>
        ${filterSwitch("users", roleFilters, roleFilter)}</div>
      ${shown.length ? shown.map(u => userRow(u, false)).join("") : `<p class="panel-sub">${others.length ? "No one matches this filter." : "No one yet."}</p>`}
    </section>`;

  main.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => openApproveModal(btn.dataset.approve)));
  main.querySelectorAll("[data-restrict]").forEach(btn => btn.addEventListener("click", () => {
    if (confirm("Restrict this person's access? They'll be signed out immediately.")) setUserStatus(btn.dataset.restrict, "restricted");
  }));
  main.querySelectorAll("[data-delete-user]").forEach(btn => btn.addEventListener("click", () => {
    const u = usersById.get(btn.dataset.deleteUser);
    if (!u) return;
    const extra = u.role === "teacher" ? " Their calendar is deleted and their students are left without a teacher." : u.role === "student" ? " Their progress is deleted too." : "";
    if (confirm(`Permanently delete ${u.name || u.email}?${extra}\n\nThis can't be undone. They could sign in again later, but would have to request access from scratch.`)) deleteUser(u.id);
  }));
  main.querySelectorAll("[data-role]").forEach(sel => sel.addEventListener("change", (e) => setUserRole(sel.dataset.role, e.target.value)));
  main.querySelectorAll("[data-teacher]").forEach(sel => sel.addEventListener("change", (e) => reassignTeacher(sel.dataset.teacher, e.target.value)));
  main.querySelectorAll("[data-reset-pw]").forEach(btn => btn.addEventListener("click", () => sendReset(btn.dataset.resetPw)));
  wireFilters(main);
}

// Restricted accounts sink to the bottom of every list (order is otherwise unchanged).
function restrictedLast(list){
  const rank = (u) => u.status === "restricted" ? 1 : 0;
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

function canManage(u){
  return isOwner() || (isManager() && u.role !== "owner" && u.role !== "manager");
}

function userRow(u, isPending){
  const initial = escapeHtml(((u.name || "?")[0] || "?").toUpperCase());
  const roleOptions = ["teacher", "student"].concat(isOwner() ? ["manager"] : []);

  // A restricted account is a dead account until someone re-approves it —
  // its old role/teacher no longer mean anything (they're chosen fresh on
  // Grant access, same as a brand-new request), so the row shows nothing
  // but who it is, faded to signal "inactive".
  if (u.status === "restricted"){
    return `
      <div class="user-row restricted">
        <div class="user-row-top">
          <div class="user-row-main">
            ${u.photoURL ? `<img class="user-avatar" src="${escapeHtml(u.photoURL)}" alt="">` : `<span class="user-avatar user-avatar-fallback">${initial}</span>`}
            <div class="user-identity">
              <span class="user-name">${escapeHtml(u.name || "(no name)")}</span>
              <span class="user-email mono" title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</span>
            </div>
          </div>
        </div>
        ${canManage(u) ? `
        <div class="user-row-controls">
          <button class="btn btn-accent btn-sm" data-approve="${u.id}">Grant access</button>
          <button class="btn btn-danger btn-sm" data-delete-user="${u.id}">Delete user</button>
        </div>` : ""}
      </div>`;
  }

  return `
    <div class="user-row">
      <div class="user-row-top">
        <div class="user-row-main">
          ${u.photoURL ? `<img class="user-avatar" src="${escapeHtml(u.photoURL)}" alt="">` : `<span class="user-avatar user-avatar-fallback">${initial}</span>`}
          <div class="user-identity">
            <span class="user-name">${escapeHtml(u.name || "(no name)")}</span>
            <span class="user-email mono" title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</span>
          </div>
        </div>
        <div class="user-row-badges">
          <span class="user-badge role-${u.role || "none"}">${u.role ? escapeHtml(ROLE_LABEL[u.role] || u.role) : "—"}</span>
          <span class="user-badge ${statusClass(u)}">${escapeHtml(statusLabel(u))}</span>
          ${joinedLabel(u) ? `<span class="user-joined mono">Joined ${joinedLabel(u)}</span>` : ""}
        </div>
      </div>
      <div class="user-row-controls">
        ${!isPending && u.role === "student" ? teacherPicker(u) : ""}
        ${isPending
          ? `<button class="btn btn-accent btn-sm" data-approve="${u.id}">Approve</button>
             ${canManage(u) ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">Deny</button>` : ""}`
          : canManage(u) ? `
              ${u.role && u.role !== "owner" ? `<select class="select" data-role="${u.id}">${roleOptions.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>` : ""}
              ${u.provider === "password" ? `<button class="btn btn-ghost btn-sm" data-reset-pw="${escapeHtml(u.email)}">Reset password</button>` : ""}
              ${u.role !== "owner" ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">Restrict</button>` : ""}
            ` : ""}
      </div>
    </div>`;
}

function teacherPicker(student){
  if (!isOwnerOrManager()) return student.teacherId ? `<span class="user-badge">${escapeHtml(userName(student.teacherId))}</span>` : "";
  const teachers = usersCache.filter(u => u.role === "teacher" && u.status === "approved");
  return `<select class="select" data-teacher="${student.id}">
    <option value="">No teacher</option>
    ${teachers.map(t => `<option value="${t.id}" ${student.teacherId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
  </select>`;
}

function openApproveModal(uid){
  const u = usersById.get(uid);
  const teachers = usersCache.filter(x => x.role === "teacher" && x.status === "approved");
  const restoring = u.status === "restricted";   // same modal grants a restricted account a fresh role, from scratch
  const defaultStudent = u.role === "student";   // already true for anyone on the free trial
  const modalRoot = $("modalRoot");
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>${restoring ? "Grant access to" : "Approve"} ${escapeHtml(u.name)}</h2>
        <p class="panel-sub">Choose a role for this account.</p>
        <div class="role-choice">
          <label><input type="radio" name="approveRole" value="teacher" ${defaultStudent ? "" : "checked"}> Teacher</label>
          <label><input type="radio" name="approveRole" value="student" ${defaultStudent ? "checked" : ""}> Student</label>
        </div>
        <div id="approveTeacherPick" ${defaultStudent ? "" : "hidden"}>
          <label class="auth-label">Assign a teacher</label>
          <select class="select" id="approveTeacherSelect" style="width:100%;">
            <option value="">— choose a teacher —</option>
            ${teachers.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
          </select>
          ${!teachers.length ? `<p class="panel-sub">No approved teachers yet — approve a teacher first.</p>` : ""}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="approveCancel">Cancel</button>
          <button class="btn btn-accent" id="approveConfirm">${restoring ? "Grant access" : "Approve"}</button>
        </div>
      </div>
    </div>`;
  modalRoot.querySelectorAll('input[name="approveRole"]').forEach(r => r.addEventListener("change", (e) => {
    $("approveTeacherPick").hidden = e.target.value !== "student";
  }));
  $("approveCancel").addEventListener("click", closeModal);
  $("approveConfirm").addEventListener("click", async () => {
    const role = modalRoot.querySelector('input[name="approveRole"]:checked').value;
    const teacherId = role === "student" ? $("approveTeacherSelect").value : null;
    if (role === "student" && !teacherId){ alert("Please choose a teacher for this student."); return; }
    try{ await approveUser(uid, role, teacherId); closeModal(); }
    catch(err){ alert(err.message); }
  });
}

/* ---------------- Students section ---------------- */
function visibleStudents(){
  return isOwnerOrManager()
    ? restrictedLast(usersCache.filter(u => u.role === "student"))
    : restrictedLast(usersCache.filter(u => u.role === "student" && u.teacherId === me().uid));
}

function renderStudentsSection(main){
  const allStudents = visibleStudents();
  syncProgressSubs(allStudents.map(s => s.id));

  // Owner/manager can narrow the list to one teacher's students.
  let teacherFilters = [], teacherFilter = "all";
  if (isOwnerOrManager()){
    const teachers = usersCache.filter(u => u.role === "teacher" && u.status === "approved");
    teacherFilters = [{ value: "all", label: "All", count: allStudents.length }]
      .concat(teachers.map(t => ({ value: t.id, label: t.name || t.email, count: allStudents.filter(x => x.teacherId === t.id).length })))
      .concat([{ value: "none", label: "No teacher", count: allStudents.filter(x => !x.teacherId).length }]);
    teacherFilter = teacherFilters.some(f => f.value === state.filters.students) ? state.filters.students : "all";
  }
  const students = teacherFilter === "all" ? allStudents
    : teacherFilter === "none" ? allStudents.filter(x => !x.teacherId)
    : allStudents.filter(x => x.teacherId === teacherFilter);

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Students (${students.length})</h2>
        <p class="panel-sub">${isOwnerOrManager() ? "Everyone currently enrolled as a student." : "Students assigned to you."}</p></div>
      ${teacherFilters.length > 2 ? filterSwitch("students", teacherFilters, teacherFilter) : ""}
      ${students.length ? `<div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th>${isOwnerOrManager() ? "<th>Teacher</th>" : ""}<th>XP</th><th>Streak</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${students.map(s => {
            const p = progressCache.get(s.id);
            return `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td class="mono">${escapeHtml(s.email)}</td>
              ${isOwnerOrManager() ? `<td>${teacherPicker(s)}</td>` : ""}
              <td class="mono">${p ? p.xp : "—"}</td>
              <td class="mono">${p ? p.streak : "—"}</td>
              <td><span class="user-badge status-${s.status}">${escapeHtml(s.status)}</span></td>
              <td><button class="btn btn-ghost btn-sm" data-view-progress="${s.id}">Progress</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<p class="panel-sub">${allStudents.length ? "No students match this filter." : "No students yet."}</p>`}
    </section>`;

  main.querySelectorAll("[data-teacher]").forEach(sel => sel.addEventListener("change", (e) => reassignTeacher(sel.dataset.teacher, e.target.value)));
  main.querySelectorAll("[data-view-progress]").forEach(btn => btn.addEventListener("click", () => setSection("progress", { selectedStudent: btn.dataset.viewProgress })));
  wireFilters(main);
}

/* ---------------- Progress section ---------------- */
function renderProgressSection(main){
  const students = visibleStudents();

  if (!state.selectedStudent){
    main.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Progress</h2><p class="panel-sub">Pick a student to see their lessons, homework, and grammar progress.</p></div>
        ${students.length ? `<div class="pick-list">${students.map(s => `<button class="pick-row" data-pick="${s.id}"><span>${escapeHtml(s.name)}</span><span class="panel-sub mono">${escapeHtml(s.email)}</span></button>`).join("")}</div>` : `<p class="panel-sub">No students yet.</p>`}
      </section>`;
    main.querySelectorAll("[data-pick]").forEach(btn => btn.addEventListener("click", () => setSection("progress", { selectedStudent: btn.dataset.pick })));
    return;
  }

  const student = usersById.get(state.selectedStudent);
  if (!student){
    main.innerHTML = `<p class="panel-sub">Student not found.</p><button class="auth-link-btn" id="backToPick">&larr; Back</button>`;
    $("backToPick").addEventListener("click", () => setSection("progress", { selectedStudent: null }));
    return;
  }
  syncProgressSubs([state.selectedStudent]);
  syncResetSubs(state.selectedStudent);
  const p = progressCache.get(state.selectedStudent);
  const resets = Object.entries(resetsCache.get(state.selectedStudent) || {})
    .map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);

  const completed = p ? Object.entries(p.completed || {}).map(([day, info]) => ({ day: Number(day), ...info })).sort((a, b) => a.day - b.day) : [];
  const homework = p ? Object.entries(p.homeworkDone || {}).map(([n, info]) => ({ n: Number(n), ...info })).sort((a, b) => a.n - b.n) : [];
  const grammarDone = p ? Object.entries(p.grammarDone || {}).map(([id, info]) => ({ id, ...info })) : [];
  const totalLessons = typeof CURRICULUM !== "undefined" ? CURRICULUM.length : null;
  const totalGrammar = typeof GRAMMAR !== "undefined" ? GRAMMAR.length : null;
  const totalHw = homeworkSessionsTotal() || null;

  main.innerHTML = `
    <button class="auth-link-btn" id="backToPick" style="margin-bottom:12px;">&larr; All students</button>
    <section class="panel">
      <div class="panel-head">
        <h2>${escapeHtml(student.name)}</h2>
        <p class="panel-sub">${escapeHtml(student.email)}${student.teacherId ? " · Teacher: " + escapeHtml(userName(student.teacherId)) : ""}</p>
      </div>
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-num">${p ? p.xp : 0}</span><span class="stat-label">XP</span></div>
        <div class="stat-tile"><span class="stat-num">${p ? p.streak : 0}</span><span class="stat-label">Day streak</span></div>
        <div class="stat-tile"><span class="stat-num">${completed.length}${totalLessons ? "/" + totalLessons : ""}</span><span class="stat-label">Lessons</span></div>
        <div class="stat-tile"><span class="stat-num">${homework.length}${totalHw ? "/" + totalHw : ""}</span><span class="stat-label">Homework</span></div>
        <div class="stat-tile"><span class="stat-num">${grammarDone.length}${totalGrammar ? "/" + totalGrammar : ""}</span><span class="stat-label">Grammar</span></div>
      </div>
    </section>

    ${canGrantUnlock(student) ? `<section class="panel">
      <div class="panel-head">
        <h2>Unlock lessons early</h2>
        <p class="panel-sub">Open a range of days for ${escapeHtml(student.name)} right now, even ones they haven't reached yet. Days outside the range stay locked until they finish their way there — ${escapeHtml(student.name)} can never unlock days themselves.</p>
      </div>
      ${typeof student.unlockFrom === "number" && typeof student.unlockTo === "number"
        ? `<p class="panel-sub" style="margin-bottom:10px;">Days <strong>${student.unlockFrom}–${student.unlockTo}</strong> are open early right now.</p>`
        : ""}
      <div class="reset-row">
        <select class="select" id="unlockFromSelect">${dayOptions(null, student.unlockFrom)}</select>
        <select class="select" id="unlockToSelect">${dayOptions(null, student.unlockTo)}</select>
        <button class="btn btn-accent" id="unlockSetBtn">Unlock</button>
        ${typeof student.unlockFrom === "number" ? `<button class="btn btn-ghost" id="unlockClearBtn">Clear</button>` : ""}
      </div>
    </section>` : ""}

    <section class="panel">
      <div class="panel-head">
        <h2>Reset a lesson</h2>
        <p class="panel-sub">Clears one lesson for ${escapeHtml(student.name)} — completion, quiz, practice and role-play — so they can redo it. Nothing else is touched.</p>
      </div>
      <div class="reset-row">
        <select class="select" id="resetDaySelect">
          ${dayOptions(p, state.resetDay)}
        </select>
        <button class="btn btn-accent" id="resetDayBtn">Reset this lesson</button>
      </div>
      ${resets.length ? `<div class="reset-log">
        <p class="panel-sub" style="margin:14px 0 6px;">Recent resets</p>
        ${resets.map(r => `<div class="reset-log-row"><span>${escapeHtml(resetLabel(r))}</span><span class="panel-sub">${r.appliedAt ? "applied" : "waiting for the student to open the app"}${r.byName ? " · by " + escapeHtml(r.byName) : ""}</span></div>`).join("")}
      </div>` : ""}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Lessons completed (${completed.length})</h2></div>
      ${completed.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Day</th><th>Title</th><th>Date</th><th>Score</th><th></th></tr></thead><tbody>
        ${completed.map(c => `<tr><td>${c.day}</td><td>${escapeHtml(dayTitle(c.day))}</td><td class="mono">${escapeHtml(c.date)}</td><td class="mono">${c.score}%</td><td><button class="btn btn-ghost btn-sm" data-reset="lesson" data-key="${c.day}">Reset</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No lessons completed yet.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Homework completed (${homework.length})</h2></div>
      ${homework.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Session</th><th>Date</th><th>Score</th><th></th></tr></thead><tbody>
        ${homework.map(h => `<tr><td>#${h.n + 1}</td><td class="mono">${escapeHtml(h.date)}</td><td class="mono">${h.score}%</td><td><button class="btn btn-ghost btn-sm" data-reset="homework" data-key="${h.n}">Reset</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No homework completed yet.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Grammar units completed (${grammarDone.length})</h2></div>
      ${grammarDone.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Unit</th><th>Date</th><th>Score</th><th></th></tr></thead><tbody>
        ${grammarDone.map(g => `<tr><td>${escapeHtml(grammarTitle(g.id))}</td><td class="mono">${escapeHtml(g.date)}</td><td class="mono">${g.score}%</td><td><button class="btn btn-ghost btn-sm" data-reset="grammar" data-key="${escapeHtml(g.id)}">Reset</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No grammar units completed yet.</p>`}
    </section>`;

  $("backToPick").addEventListener("click", () => setSection("progress", { selectedStudent: null }));
  $("resetDaySelect").addEventListener("change", (e) => { state.resetDay = e.target.value; });
  $("resetDayBtn").addEventListener("click", () => openResetModal(state.selectedStudent, "lesson", $("resetDaySelect").value));
  main.querySelectorAll("[data-reset]").forEach(btn => btn.addEventListener("click", () => openResetModal(state.selectedStudent, btn.dataset.reset, btn.dataset.key)));

  const unlockSetBtn = $("unlockSetBtn"), unlockClearBtn = $("unlockClearBtn");
  if (unlockSetBtn) unlockSetBtn.addEventListener("click", async () => {
    const from = Number($("unlockFromSelect").value), to = Number($("unlockToSelect").value);
    if (to < from){ alert("The second day has to be the same as or after the first."); return; }
    unlockSetBtn.disabled = true;
    try{ await setUnlockRange(state.selectedStudent, from, to); toast(`Days ${from}–${to} unlocked.`); }
    catch(err){ alert("Couldn't unlock those days: " + err.message); }
    finally{ unlockSetBtn.disabled = false; }
  });
  if (unlockClearBtn) unlockClearBtn.addEventListener("click", async () => {
    unlockClearBtn.disabled = true;
    try{ await clearUnlockRange(state.selectedStudent); toast("Early access cleared."); }
    catch(err){ alert("Couldn't clear it: " + err.message); unlockClearBtn.disabled = false; }
  });
}

/* ---------------- Calendar section ---------------- */
function currentCalendarTeacherId(){
  return isTeacher() ? me().uid : state.selectedTeacherId;
}

function renderCalendarSection(main){
  const teachers = usersCache.filter(u => u.role === "teacher" && u.status === "approved");
  if (isOwnerOrManager() && !state.selectedTeacherId && teachers.length){
    state.selectedTeacherId = teachers[0].id;
  }
  const teacherId = currentCalendarTeacherId();
  subscribeEvents(teacherId);

  const groups = groupEventsByDate(eventsCache);

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head-row">
        <div><h2>Calendar</h2><p class="panel-sub">Scheduled lessons.</p></div>
        ${isOwnerOrManager() ? `
          <select class="select" id="calTeacherPicker">
            ${teachers.length ? teachers.map(t => `<option value="${t.id}" ${t.id === state.selectedTeacherId ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("") : `<option value="">No teachers yet</option>`}
          </select>` : ""}
        ${teacherId ? `<button class="btn btn-accent btn-sm" id="addEventBtn">+ Schedule lesson</button>` : ""}
      </div>
      ${!teacherId ? `<p class="panel-sub">No teacher selected yet.</p>` : groups.length ? groups.map(renderEventGroup).join("") : `<p class="panel-sub">No lessons scheduled.</p>`}
    </section>`;

  const picker = $("calTeacherPicker");
  if (picker) picker.addEventListener("change", (e) => { state.selectedTeacherId = e.target.value || null; renderSection(); });
  const addBtn = $("addEventBtn");
  if (addBtn) addBtn.addEventListener("click", () => openEventModal(null));
  main.querySelectorAll("[data-edit-event]").forEach(el => el.addEventListener("click", () => {
    const ev = eventsCache.find(x => x.id === el.dataset.editEvent);
    if (ev) openEventModal(ev);
  }));
}

function groupEventsByDate(events){
  const map = new Map();
  events.forEach(ev => {
    const d = ev.startAt ? new Date(ev.startAt) : new Date();
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  });
  return Array.from(map.entries()).map(([date, evs]) => ({ date, events: evs }));
}

function fmtTime(ms){
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderEventGroup(group){
  return `
    <div class="cal-group">
      <h3 class="cal-date">${escapeHtml(group.date)}</h3>
      ${group.events.map(ev => `
        <div class="cal-event" data-edit-event="${ev.id}">
          <div class="cal-event-time">${fmtTime(ev.startAt)}</div>
          <div>
            <span class="cal-event-title">${escapeHtml(ev.title)}</span>
            ${ev.studentIds && ev.studentIds.length ? `<span class="cal-event-students">${ev.studentIds.map(id => escapeHtml(userName(id))).join(", ")}</span>` : ""}
          </div>
        </div>`).join("")}
    </div>`;
}

function toDatetimeLocal(ms){
  if (!ms) return "";
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEventModal(existingEvent){
  const teacherId = currentCalendarTeacherId();
  const students = usersCache.filter(u => u.role === "student" && u.teacherId === teacherId);
  const isEdit = !!existingEvent;
  const modalRoot = $("modalRoot");
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>${isEdit ? "Edit lesson" : "Schedule a lesson"}</h2>
        <form id="eventForm" class="auth-form">
          <label class="auth-label">Title</label>
          <input class="auth-input" id="evTitle" required value="${isEdit ? escapeHtml(existingEvent.title) : ""}">
          <label class="auth-label">Start</label>
          <input class="auth-input" id="evStart" type="datetime-local" required value="${isEdit ? toDatetimeLocal(existingEvent.startAt) : ""}">
          <label class="auth-label">Student(s)</label>
          <select class="select" id="evStudents" multiple size="${Math.min(5, Math.max(2, students.length || 2))}" style="width:100%;">
            ${students.length ? students.map(s => `<option value="${s.id}" ${isEdit && existingEvent.studentIds && existingEvent.studentIds.includes(s.id) ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("") : `<option disabled>No students assigned to this teacher yet</option>`}
          </select>
          <label class="auth-label">Notes</label>
          <textarea class="auth-input" id="evNotes" rows="3">${isEdit ? escapeHtml(existingEvent.notes || "") : ""}</textarea>
          <div class="modal-actions">
            ${isEdit ? `<button type="button" class="btn btn-danger" id="evDelete">Delete</button>` : ""}
            <button type="button" class="btn btn-ghost" id="evCancel">Cancel</button>
            <button type="submit" class="btn btn-accent">${isEdit ? "Save" : "Schedule"}</button>
          </div>
        </form>
      </div>
    </div>`;

  $("evCancel").addEventListener("click", closeModal);
  if (isEdit) $("evDelete").addEventListener("click", async () => {
    if (confirm("Delete this scheduled lesson?")){
      try{ await remove(ref(db, `events/${teacherId}/${existingEvent.id}`)); closeModal(); } catch(err){ alert(err.message); }
    }
  });
  $("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const start = new Date($("evStart").value);
    const studentIds = Array.from($("evStudents").selectedOptions).map(o => o.value).filter(Boolean);
    const payload = {
      teacherId,
      teacherName: userName(teacherId),
      title: $("evTitle").value.trim(),
      notes: $("evNotes").value.trim(),
      studentIds,
      startAt: start.getTime(),
      updatedAt: serverTimestamp(),
    };
    try{
      if (isEdit) await update(ref(db, `events/${teacherId}/${existingEvent.id}`), payload);
      else await set(push(ref(db, `events/${teacherId}`)), Object.assign({ createdAt: serverTimestamp() }, payload));
      closeModal();
      toast(isEdit ? "Lesson updated." : "Lesson scheduled.");
    }catch(err){ alert(err.message); }
  });
}

/* ---------------- Account section ---------------- */
function renderAccountSection(main){
  const providerId = (auth.currentUser && auth.currentUser.providerData[0] && auth.currentUser.providerData[0].providerId) || "";
  const isPasswordAccount = providerId === "password";
  const providerLabel = providerId === "google.com" ? "Google" : providerId === "apple.com" ? "Apple" : "email & password";

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Account</h2></div>
      <div class="user-row">
        <div>
          <span class="user-name">${escapeHtml(me().name || "")}</span>
          <span class="user-email">${escapeHtml(me().email || "")} &middot; ${escapeHtml(ROLE_LABEL[me().role] || me().role)}</span>
        </div>
      </div>
      ${isPasswordAccount ? `
        <div class="user-row">
          <div>
            <span class="user-name">Password</span>
            <span class="user-email">We'll email you a link to set a new one.</span>
          </div>
          <button class="btn btn-ghost btn-sm" id="acctResetPw">Send reset email</button>
        </div>
        <div class="user-row">
          <div>
            <span class="user-name">Email address</span>
            <span class="user-email">Sends a confirmation link to your new address.</span>
          </div>
          <button class="btn btn-ghost btn-sm" id="acctChangeEmail">Change email</button>
        </div>
      ` : `
        <div class="user-row">
          <div>
            <span class="user-name">Signed in with ${escapeHtml(providerLabel)}</span>
            <span class="user-email">Your email and password are managed there, not here.</span>
          </div>
        </div>
      `}
      <div class="user-row">
        <div>
          <span class="user-name">Sign out</span>
          <span class="user-email">End your session on this device.</span>
        </div>
        <button class="btn btn-danger btn-sm" id="acctSignOut">Sign out</button>
      </div>
    </section>`;

  const resetBtn = $("acctResetPw");
  if (resetBtn) resetBtn.addEventListener("click", () => sendReset(me().email));
  const changeBtn = $("acctChangeEmail");
  if (changeBtn) changeBtn.addEventListener("click", openChangeEmailModal);
  $("acctSignOut").addEventListener("click", () => window.TTE_signOut && window.TTE_signOut());
}

function openChangeEmailModal(){
  const modalRoot = $("modalRoot");
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>Change email</h2>
        <p class="panel-sub">Confirm your current password, then click the link we send to the new address to finish — nothing changes until you do.</p>
        <form id="emailForm" class="auth-form">
          <label class="auth-label">New email</label>
          <input class="auth-input" id="newEmailInput" type="email" required value="${escapeHtml(me().email || "")}">
          <label class="auth-label">Current password</label>
          <input class="auth-input" id="currentPwInput" type="password" required autocomplete="current-password">
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="emailCancel">Cancel</button>
            <button type="submit" class="btn btn-accent">Change email</button>
          </div>
        </form>
      </div>
    </div>`;
  $("emailCancel").addEventListener("click", closeModal);
  $("emailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newEmail = $("newEmailInput").value.trim();
    const currentPassword = $("currentPwInput").value;
    try{
      await changeEmail(newEmail, currentPassword);
      closeModal();
    }catch(err){
      alert(err.message);
    }
  });
}

/* ---------------- Init ---------------- */
function init(){
  renderShell();
  subscribeUsers();
  setSection(initialSection());
}

window.TTE_mount = init;
window.TTE_refresh = () => { renderShell(); setSection(state.section || initialSection()); };

initAuthGate({ appKind: "admin", mainUrl: "https://truck-talk-webapp.vercel.app/" });
