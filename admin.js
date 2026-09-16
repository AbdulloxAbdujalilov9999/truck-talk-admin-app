/* Truck Talk — Admin platform (owner / manager / teacher).
 * Sections: Users (owner/manager), Students, Progress, Calendar.
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
import { db } from "./shared/firebase.js";
import { initAuthGate } from "./shared/auth-gate.js";
import {
  ref, onValue, set, update, remove, push, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const ROLE_LABEL = { owner: "Owner", manager: "Manager", teacher: "Teacher", student: "Student" };

let state = { section: "users", selectedStudent: null, selectedTeacherId: null };
let usersCache = [];
let usersById = new Map();
let progressCache = new Map();
let progressUnsubs = new Map();
let eventsCache = [];
let unsubUsers = null;
let unsubTeacherStudentsIndex = null;
let studentUnsubs = new Map(); // uid -> unsub (teacher mode only)
let unsubEvents = null;

function $(id){ return document.getElementById(id); }
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
async function approveUser(uid, role, teacherId){
  const updates = {
    [`users/${uid}/role`]: role,
    [`users/${uid}/status`]: "approved",
    [`users/${uid}/updatedAt`]: serverTimestamp(),
    [`users/${uid}/teacherId`]: role === "student" ? (teacherId || null) : null,
  };
  if (role === "student" && teacherId) updates[`teacherStudents/${teacherId}/${uid}`] = true;
  await update(ref(db), updates);
  toast("Approved.");
}
async function setUserStatus(uid, status){
  await update(ref(db), { [`users/${uid}/status`]: status, [`users/${uid}/updatedAt`]: serverTimestamp() });
  toast(status === "restricted" ? "Access restricted." : "Access restored.");
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

/* ---------------- Shell ---------------- */
function initialSection(){ return isOwnerOrManager() ? "users" : "students"; }

function renderShell(){
  const shell = $("appShell");
  const navItems = [];
  if (isOwnerOrManager()) navItems.push(["users", "Users"]);
  navItems.push(["students", "Students"]);
  navItems.push(["progress", "Progress"]);
  navItems.push(["calendar", "Calendar"]);

  shell.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand">
          <span class="brand-mark">TRUCK TALK</span>
          <span class="admin-brand-sub">ADMIN</span>
        </div>
        <nav class="admin-nav">
          ${navItems.map(([id, label]) => `
            <button class="admin-nav-btn" data-section="${id}">
              <span>${label}</span>
              ${id === "users" ? `<span class="ttx-badge" id="navUsersBadge" hidden>0</span>` : ""}
            </button>`).join("")}
        </nav>
      </aside>
      <div class="admin-main">
        <header class="admin-topbar">
          <span class="admin-user-name">${escapeHtml(me().name || me().email)}</span>
          <span class="admin-role-pill">${escapeHtml(ROLE_LABEL[me().role] || me().role)}</span>
          <button class="btn btn-ghost btn-sm" id="adminSignOut">Sign out</button>
        </header>
        <main id="adminApp" class="admin-content"></main>
      </div>
    </div>`;

  shell.querySelectorAll("[data-section]").forEach(btn => {
    btn.addEventListener("click", () => setSection(btn.dataset.section, { selectedStudent: null }));
  });
  $("adminSignOut").addEventListener("click", () => window.TTE_signOut && window.TTE_signOut());
  updateUsersBadge();
}

function setSection(section, extra){
  state.section = section;
  Object.assign(state, extra || {});
  document.querySelectorAll(".admin-nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.section === state.section));
  renderSection();
}

function renderSection(){
  const main = $("adminApp");
  if (!main) return;
  if (state.section === "users") renderUsersSection(main);
  else if (state.section === "students") renderStudentsSection(main);
  else if (state.section === "progress") renderProgressSection(main);
  else if (state.section === "calendar") renderCalendarSection(main);
}

/* ---------------- Users section ---------------- */
function renderUsersSection(main){
  if (!isOwnerOrManager()){ main.innerHTML = `<p class="panel-sub">You don't have access to this section.</p>`; return; }
  const pending = usersCache.filter(u => u.status === "pending");
  const others = usersCache.filter(u => u.status !== "pending");

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Pending requests</h2>
        <p class="panel-sub">People who signed up and are waiting to be approved.</p></div>
      ${pending.length ? pending.map(u => userRow(u, true)).join("") : `<p class="panel-sub">No pending requests.</p>`}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>All users (${others.length})</h2></div>
      ${others.length ? others.map(u => userRow(u, false)).join("") : `<p class="panel-sub">No one yet.</p>`}
    </section>`;

  main.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => openApproveModal(btn.dataset.approve)));
  main.querySelectorAll("[data-restrict]").forEach(btn => btn.addEventListener("click", () => {
    if (confirm("Restrict this person's access? They'll be signed out immediately.")) setUserStatus(btn.dataset.restrict, "restricted");
  }));
  main.querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", () => setUserStatus(btn.dataset.restore, "approved")));
  main.querySelectorAll("[data-role]").forEach(sel => sel.addEventListener("change", (e) => setUserRole(sel.dataset.role, e.target.value)));
  main.querySelectorAll("[data-teacher]").forEach(sel => sel.addEventListener("change", (e) => reassignTeacher(sel.dataset.teacher, e.target.value)));
}

function canManage(u){
  return isOwner() || (isManager() && u.role !== "owner" && u.role !== "manager");
}

function userRow(u, isPending){
  const initial = escapeHtml(((u.name || "?")[0] || "?").toUpperCase());
  const roleOptions = ["teacher", "student"].concat(isOwner() ? ["manager"] : []);
  return `
    <div class="user-row">
      <div class="user-row-main">
        ${u.photoURL ? `<img class="user-avatar" src="${escapeHtml(u.photoURL)}" alt="">` : `<span class="user-avatar user-avatar-fallback">${initial}</span>`}
        <div>
          <span class="user-name">${escapeHtml(u.name || "(no name)")}</span>
          <span class="user-email mono">${escapeHtml(u.email)}</span>
        </div>
      </div>
      <div class="user-row-meta">
        <span class="user-badge role-${u.role || "none"}">${u.role ? escapeHtml(ROLE_LABEL[u.role] || u.role) : "—"}</span>
        <span class="user-badge status-${u.status}">${escapeHtml(u.status)}</span>
        ${!isPending && u.role === "student" ? teacherPicker(u) : ""}
      </div>
      <div class="user-row-actions">
        ${isPending
          ? `<button class="btn btn-accent btn-sm" data-approve="${u.id}">Approve</button>
             ${canManage(u) ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">Deny</button>` : ""}`
          : canManage(u) ? `
              ${u.role && u.role !== "owner" ? `<select class="select" data-role="${u.id}">${roleOptions.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>` : ""}
              ${u.status === "restricted"
                ? `<button class="btn btn-ghost btn-sm" data-restore="${u.id}">Restore access</button>`
                : (u.role !== "owner" ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">Restrict</button>` : "")}
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
  const modalRoot = $("modalRoot");
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>Approve ${escapeHtml(u.name)}</h2>
        <p class="panel-sub">Choose a role for this account.</p>
        <div class="role-choice">
          <label><input type="radio" name="approveRole" value="teacher" checked> Teacher</label>
          <label><input type="radio" name="approveRole" value="student"> Student</label>
        </div>
        <div id="approveTeacherPick" hidden>
          <label class="auth-label">Assign a teacher</label>
          <select class="select" id="approveTeacherSelect" style="width:100%;">
            <option value="">— choose a teacher —</option>
            ${teachers.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
          </select>
          ${!teachers.length ? `<p class="panel-sub">No approved teachers yet — approve a teacher first.</p>` : ""}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="approveCancel">Cancel</button>
          <button class="btn btn-accent" id="approveConfirm">Approve</button>
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
    ? usersCache.filter(u => u.role === "student")
    : usersCache.filter(u => u.role === "student" && u.teacherId === me().uid);
}

function renderStudentsSection(main){
  const students = visibleStudents();
  syncProgressSubs(students.map(s => s.id));

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Students (${students.length})</h2>
        <p class="panel-sub">${isOwnerOrManager() ? "Everyone currently enrolled as a student." : "Students assigned to you."}</p></div>
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
      </table></div>` : `<p class="panel-sub">No students yet.</p>`}
    </section>`;

  main.querySelectorAll("[data-teacher]").forEach(sel => sel.addEventListener("change", (e) => reassignTeacher(sel.dataset.teacher, e.target.value)));
  main.querySelectorAll("[data-view-progress]").forEach(btn => btn.addEventListener("click", () => setSection("progress", { selectedStudent: btn.dataset.viewProgress })));
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
  const p = progressCache.get(state.selectedStudent);

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

    <section class="panel">
      <div class="panel-head"><h2>Lessons completed (${completed.length})</h2></div>
      ${completed.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Day</th><th>Title</th><th>Date</th><th>Score</th></tr></thead><tbody>
        ${completed.map(c => `<tr><td>${c.day}</td><td>${escapeHtml(dayTitle(c.day))}</td><td class="mono">${escapeHtml(c.date)}</td><td class="mono">${c.score}%</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No lessons completed yet.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Homework completed (${homework.length})</h2></div>
      ${homework.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Session</th><th>Date</th><th>Score</th></tr></thead><tbody>
        ${homework.map(h => `<tr><td>#${h.n + 1}</td><td class="mono">${escapeHtml(h.date)}</td><td class="mono">${h.score}%</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No homework completed yet.</p>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Grammar units completed (${grammarDone.length})</h2></div>
      ${grammarDone.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Unit</th><th>Date</th><th>Score</th></tr></thead><tbody>
        ${grammarDone.map(g => `<tr><td>${escapeHtml(grammarTitle(g.id))}</td><td class="mono">${escapeHtml(g.date)}</td><td class="mono">${g.score}%</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="panel-sub">No grammar units completed yet.</p>`}
    </section>`;

  $("backToPick").addEventListener("click", () => setSection("progress", { selectedStudent: null }));
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
          <div class="cal-event-time">${fmtTime(ev.startAt)} – ${fmtTime(ev.endAt)}</div>
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
          <label class="auth-label">End</label>
          <input class="auth-input" id="evEnd" type="datetime-local" required value="${isEdit ? toDatetimeLocal(existingEvent.endAt) : ""}">
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
    const end = new Date($("evEnd").value);
    if (end <= start){ alert("End time must be after the start time."); return; }
    const studentIds = Array.from($("evStudents").selectedOptions).map(o => o.value).filter(Boolean);
    const payload = {
      teacherId,
      teacherName: userName(teacherId),
      title: $("evTitle").value.trim(),
      notes: $("evNotes").value.trim(),
      studentIds,
      startAt: start.getTime(),
      endAt: end.getTime(),
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

/* ---------------- Init ---------------- */
function init(){
  renderShell();
  subscribeUsers();
  setSection(initialSection());
}

window.TTE_mount = init;
window.TTE_refresh = () => { renderShell(); setSection(state.section || initialSection()); };

// This app lives in its own repo/deployment now, separate from the course
// site — there's no fixed relative path to it. Once the course is deployed,
// set mainUrl to its real URL so a student who signs in here gets a working
// link back; until then a signed-in student just sees guidance text instead
// of a dead link.
initAuthGate({ appKind: "admin", mainUrl: null });
