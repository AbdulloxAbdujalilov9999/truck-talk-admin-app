# Truck Talk — Admin Platform

The owner/manager/teacher dashboard for [Truck Talk English](https://github.com/AbdulloxAbdujalilov9999/truck-talk-webapp) — approve sign-up requests, assign students to teachers, see each student's lesson/homework/grammar progress, and manage teachers' scheduled-lesson calendars.

This is a separate repo from the course site, but **not a separate backend** — it shares one Firebase project (Authentication + Realtime Database) with `truck-talk-webapp`, which is what makes it "connected to the main platform": the same accounts, roles, and student progress data are visible from both. It's Realtime Database rather than Firestore specifically because Realtime Database works on the free Spark plan with no billing account required.

## What's inside

- **`index.html`** / **`admin.js`** — the dashboard: Users (owner/manager: approve requests, assign Teacher/Student + a teacher, restrict/restore access), Students, Progress (per-student lesson/homework/grammar completion), and Calendar (teachers manage their own scheduled lessons; owner/manager can view/edit any teacher's)
- **`shared/`** — the account gate (Google/Apple/email sign-in, "request access" flow, approval/restriction screens) and Firebase config. **This is a hand-kept copy of the same folder in `truck-talk-webapp`** — see the comment at the top of `shared/auth-gate.js`. If you change sign-in/approval behavior in one repo, mirror the change in the other.
- **`database.rules.json`** — the server-side access rules (the real security boundary, not the UI). A reference copy of the same rules used by `truck-talk-webapp`; deploy once to the shared Firebase project, from either repo.

## Setup

This must point at the **same Firebase project** as the course repo — that's what connects the two. If that project already exists (see `truck-talk-webapp`'s README for how to create it), just:

1. Copy the same config object into [`shared/firebase-config.js`](shared/firebase-config.js) that you used in the course repo's copy — including `databaseURL`.
2. Serve this folder with any static file server (`python3 -m http.server 8000`, Firebase Hosting, Netlify, GitHub Pages, etc.) and open it.
3. Sign in with the hardcoded owner address in `shared/firebase-config.js` (`abdujalilov7707@gmail.com`) to get owner access — same bootstrap as the course repo.

**One thing to wire up once both sites are deployed:** in `admin.js`, `initAuthGate({ appKind: "admin", mainUrl: null })` — set `mainUrl` to the course site's real URL so a student who accidentally signs into this dashboard gets a working "Open Course" link instead of just guidance text. (The course repo has the mirror-image setting — its `adminUrl` — for the same reason, pointing back here.)

## Roles

- **Owner** — everything: approve/restrict anyone, assign teachers, edit any teacher's calendar. One hardcoded account (`abdujalilov7707@gmail.com`), enforced in `database.rules.json`.
- **Manager** — same day-to-day approval/management powers as owner, but can't touch owner or manager accounts.
- **Teacher** — Students/Progress/Calendar scoped to their own assigned students; manages their own calendar.
- **Student** accounts don't use this app — they sign into the course site instead.
