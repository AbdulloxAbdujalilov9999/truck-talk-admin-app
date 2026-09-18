/* Inserts a <script src="vendor-auth-bridge.js"> tag into the COPIED
 * www/index.html only — the root project's index.html (the live website)
 * is never touched, so this native-Android-only dependency can't ever show
 * up as a 404 on the real site. */
const fs = require("fs");
const path = "www/index.html";
let html = fs.readFileSync(path, "utf8");
const marker = '<script type="module"';
if (!html.includes("vendor-auth-bridge.js")) {
  html = html.replace(marker, '<script src="vendor-auth-bridge.js"></script>\n' + marker);
  fs.writeFileSync(path, html);
}
