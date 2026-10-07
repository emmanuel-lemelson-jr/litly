// Live visitor bar + pop-up, shared by every page (loaded from nav.js).
// "Awake" = loaded or touched the site in the last 15 minutes (the server decides). Countries come from
// Cloudflare's edge; the browser only sends a random id that changes every UTC day.
(function () {
  var nav = document.querySelector("nav");
  if (!nav) return;
  var names, flagOf = function (c) { return c === "XX" ? "/globe.svg" : "/flags/" + c.toLowerCase() + ".svg"; };
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  var label = function (c) { var n = c !== "XX" && names && (function () { try { return names.of(c); } catch (e) {} })(); return n ? "Visitor in " + n : "Visitor"; };
  var fmt = new Intl.NumberFormat();

  var bar = document.createElement("button");
  bar.type = "button"; bar.className = "vbar"; bar.setAttribute("aria-haspopup", "dialog");
  bar.innerHTML = '<span class="vdot"></span><b class="vawake"></b><span class="vtotal"></span><span class="vflags"></span>';
  nav.after(bar);
  var dlg = document.createElement("dialog");
  dlg.className = "vdlg";
  dlg.innerHTML = '<div class="vhead"><span class="vdot"></span><h2>Visitors <span class="vcount"></span></h2><button type="button" class="vclose" aria-label="Close">×</button></div><ul class="vlist"></ul>';
  document.body.append(dlg);
  var $ = function (el, s) { return el.querySelector(s); };
  var list = $(dlg, ".vlist"), rows = new Map(), snap = null;

  function img(c) {
    var i = new Image(); i.alt = ""; i.src = flagOf(c); i.loading = "lazy";
    i.onerror = function () { i.onerror = null; i.src = "/globe.svg"; };
    return i;
  }
  function rel(t, now) {
    var s = Math.max(0, (now - t) / 1000);
    return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d";
  }
  function paintBar(s) {
    $(bar, ".vawake").textContent = fmt.format(s.awake) + " awake";
    $(bar, ".vtotal").textContent = "· " + fmt.format(s.total) + " visit" + (s.total === 1 ? "" : "s") + " recently";
    var seen = [], f = $(bar, ".vflags");
    s.recent.forEach(function (v) { if (seen.length < 5 && seen.indexOf(v.c) < 0) seen.push(v.c); });
    f.replaceChildren.apply(f, seen.map(img));
    bar.classList.add("ready");
  }
  function paintList(s, animate) {
    $(dlg, ".vcount").textContent = "(" + fmt.format(s.total) + ")";
    s.recent.slice().reverse().forEach(function (v) {
      if (rows.has(v.id)) return;
      var li = document.createElement("li"), name = document.createElement("span"), time = document.createElement("span");
      name.className = "vname"; name.textContent = label(v.c);
      time.className = "vtime"; time.dataset.t = v.t;
      li.append(img(v.c), name, time);
      if (animate) li.className = "vnew";
      list.prepend(li); rows.set(v.id, li);
    });
    rows.forEach(function (li, id) { if (!s.recent.some(function (v) { return v.id === id; })) { li.remove(); rows.delete(id); } });
    tick();
  }
  function tick() {
    if (!snap) return;
    var now = Date.now();
    list.querySelectorAll(".vtime").forEach(function (el) { el.textContent = rel(Number(el.dataset.t), now); });
  }
  function apply(s) {
    var first = !snap; snap = s;
    window.litlyPlaces = s.places || [];
    dispatchEvent(new Event("litly:places"));
    paintBar(s); paintList(s, !first);
    try { localStorage.setItem("litly_visitors", JSON.stringify({ awake: s.awake, total: s.total, recent: s.recent.slice(0, 5) })); } catch (e) {}
  }

  // Last known numbers first so the bar doesn't pop in empty.
  try { var c = JSON.parse(localStorage.getItem("litly_visitors") || "null"); if (c && c.recent) paintBar(c); } catch (e) {}

  function visitorId() {
    var day = new Date().toISOString().slice(0, 10);
    try {
      var v = JSON.parse(localStorage.getItem("litly_vid") || "null");
      if (v && v.day === day && v.id) return v.id;
      v = { day: day, id: crypto.randomUUID() };
      localStorage.setItem("litly_vid", JSON.stringify(v));
      return v.id;
    } catch (e) { return crypto.randomUUID(); }
  }
  function ping() {
    if (document.visibilityState !== "visible") return;
    fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: visitorId() }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (s) { if (s) apply(s); }).catch(function () {});
  }
  ping();
  setInterval(ping, 30000);
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", ping);
  // Touching the page after a long idle (still visible) refreshes presence right away.
  var last = Date.now();
  ["pointerdown", "keydown", "scroll"].forEach(function (e) {
    addEventListener(e, function () { if (Date.now() - last > 60000) { last = Date.now(); ping(); } }, { passive: true });
  });

  bar.addEventListener("click", function () { tick(); dlg.showModal(); });
  $(dlg, ".vclose").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();
