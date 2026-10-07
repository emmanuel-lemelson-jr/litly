// Header auth chip shared by every page: painted from cache before first paint, then confirmed by the server.
// Paint the header from the last known auth state before first paint, so it never
// flashes between "Log in" and the account chip. The server confirms it afterwards.
window.paintNav = function (me) {
  var el = document.getElementById("nav-auth"), a = document.createElement("a");
  if (me) {
    a.className = "nav-me"; a.href = "/u/" + me.username; a.setAttribute("aria-label", "Your profile");
    var u = document.createElement("span"); u.textContent = me.username;
    var i = new Image(30, 30); i.alt = ""; i.src = me.src;
    a.append(u, i);
  } else { a.className = "nav-btn"; a.href = "/signup"; a.textContent = "Log in"; }
  el.replaceChildren(a); el.style.visibility = "";
};
(function () {
  try {
    var me = JSON.parse(localStorage.getItem("litly_me") || "null");
    if (me && me.username && me.src) return window.paintNav(me);
    var pending = Number(localStorage.getItem("litly_pending") || 0);
    // Just came back from signing in: wait for the server instead of flashing "Log in".
    if (pending && Date.now() - pending < 600000) document.getElementById("nav-auth").style.visibility = "hidden";
  } catch (e) {}
})();

// The signed-in profile (or null). Pages await this instead of asking again.
window.litlyMe = fetch("/api/profile").then((r) => (r.ok ? r.json() : null)).catch(() => undefined);

// Header: confirm the cached auth state with the server and only repaint if it changed.
document.addEventListener("DOMContentLoaded", () => window.litlyMe.then((me) => {
  if (me === undefined) { document.getElementById("nav-auth").style.visibility = ""; return; }
  try { localStorage.removeItem("litly_pending"); } catch {}
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem("litly_me") || "null"); } catch {}
  if (!me) {
    try { localStorage.removeItem("litly_me"); } catch {}
    if (cached || document.getElementById("nav-auth").style.visibility === "hidden") paintNav(null);
    return;
  }
  const next = { username: me.username, avatar: me.avatar, src: avatarUri(me.avatar) };
  try { localStorage.setItem("litly_me", JSON.stringify(next)); } catch {}
  if (!cached || cached.username !== next.username || cached.avatar !== next.avatar || document.getElementById("nav-auth").style.visibility === "hidden") paintNav(next);
}));

// Live visitor bar under the header (visitors.js).
(function () { var s = document.createElement("script"); s.src = "/visitors.js"; s.defer = true; document.head.append(s); })();
