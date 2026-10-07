// A light 2D-canvas "3D" globe for the home page: land drawn as dots, night side lit up, and real
// visitor activity from visitors.js (window.litlyPlaces): every country ever seen gets a steady glow
// (bigger with more visits) and countries with someone awake in the last 15 minutes pulse.
// Needs /land.js (1-degree land mask) and /centroids.js (country centers).
(function () {
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const ACCENT = [134, 154, 213];

  const vec = (lat, lon) => { const c = Math.cos(lat * RAD); return [c * Math.sin(lon * RAD), Math.sin(lat * RAD), c * Math.cos(lon * RAD)]; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Land mask: 360x180 bits, row 0 = lat 90..89, col 0 = lon -180..-179.
  function loadMask() {
    const bin = atob(window.LAND_MASK || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (lat, lon) => {
      const x = Math.floor(((lon + 180) % 360 + 360) % 360), y = Math.min(179, Math.max(0, Math.floor(90 - lat)));
      const i = y * 360 + x;
      return (bytes[i >> 3] >> (i & 7)) & 1;
    };
  }

  // Evenly spread points over the sphere (Fibonacci lattice), keeping the ones on land.
  function landPoints(isLand, n) {
    const out = [], g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y), a = i * g;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const lat = Math.asin(y) / RAD, lon = Math.atan2(x, z) / RAD;
      if (isLand(lat, lon)) out.push(x, y, z);
    }
    return Float32Array.from(out);
  }

  // Where the sun is straight overhead right now (as a unit vector); the opposite side is night.
  function sunVec(d) {
    const day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const dec = 23.44 * Math.sin(TAU * (day - 81) / 365);
    const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
    return { v: vec(dec, -(hours - 12) * 15), lon: -(hours - 12) * 15 };
  }

  window.initGlobe = function (canvas) {
    if (!window.LAND_MASK) return;
    const ctx = canvas.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = landPoints(loadMask(), 16000);
    const count = pts.length / 3;
    let sun = sunVec(new Date());
    // Start facing the night side, where people are up.
    let yaw = sun.lon + 180, drag = null, vel = 0, last = performance.now(), nextEvent = 0, size = 0, dpr = 1, onScreen = true;
    const tilt = 18 * RAD, st = Math.sin(tilt), ct = Math.cos(tilt);
    const events = [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      size = Math.round(r.width);
      canvas.width = canvas.height = Math.round(size * dpr);
    }

    // Real places, from the latest visitor snapshot: awake ones pulse, all of them glow.
    const places = () => (window.litlyPlaces || []).filter((p) => window.COUNTRY_LL && window.COUNTRY_LL[p.c]);
    function spawn(now) {
      const awake = places().filter((p) => p.a > 0);
      if (!awake.length) return;
      let total = 0; awake.forEach((p) => { total += p.a; });
      let pick = Math.random() * total, i = 0;
      while (i < awake.length - 1 && (pick -= awake[i].a) > 0) i++;
      const ll = window.COUNTRY_LL[awake[i].c];
      // a little scatter so a whole country doesn't pulse from one pixel
      events.push({ v: vec(ll[0] + (Math.random() - .5) * 5, ll[1] + (Math.random() - .5) * 7), t0: now });
    }

    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      if (!drag) {
        yaw += (reduce ? 0 : dt * 0.006) + vel; // gentle spin plus any leftover flick
        vel *= 0.95;
      }
      if (!reduce && now > nextEvent) { spawn(now); nextEvent = now + 600 + Math.random() * 900; }
      draw(now);
    }

    function draw(now) {
      const S = size * dpr, R = S * 0.43, cx = S / 2, cy = S / 2;
      ctx.clearRect(0, 0, S, S);

      // atmosphere glow, then the dark ball with a soft highlight
      let g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.15);
      g.addColorStop(0, `rgba(${ACCENT},.28)`); g.addColorStop(.45, `rgba(${ACCENT},.07)`); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.15, 0, TAU); ctx.fill();
      g = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
      g.addColorStop(0, "#141a2e"); g.addColorStop(1, "#05060d");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(1, dpr); ctx.strokeStyle = `rgba(${ACCENT},.35)`; ctx.stroke();

      const cy0 = Math.cos(yaw * RAD), sy0 = Math.sin(yaw * RAD);
      const rot = (x, y, z) => { // yaw about Y so lon=yaw faces us, then tilt about X
        const x1 = x * cy0 - z * sy0, z1 = x * sy0 + z * cy0;
        return [x1, y * ct - z1 * st, y * st + z1 * ct];
      };

      // land dots in 4 brightness buckets so each bucket is a single fill
      const dot = Math.max(1, R * 0.0072);
      const buckets = [[], [], [], []];
      for (let i = 0; i < count; i++) {
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const p = rot(x, y, z);
        if (p[2] <= 0) continue;
        const night = 1 - smooth(-.12, .22, x * sun.v[0] + y * sun.v[1] + z * sun.v[2]); // 1 on the night side
        const lum = (.2 + .8 * night) * (.35 + .65 * p[2]);
        buckets[Math.min(3, (lum * 4) | 0)].push(cx + p[0] * R, cy - p[1] * R);
      }
      const alphas = [.22, .4, .65, .95];
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = b === 3 ? `rgba(190,205,245,${alphas[b]})` : `rgba(${ACCENT},${alphas[b]})`;
        ctx.beginPath();
        const a = buckets[b];
        for (let i = 0; i < a.length; i += 2) { ctx.moveTo(a[i] + dot, a[i + 1]); ctx.arc(a[i], a[i + 1], dot, 0, TAU); }
        ctx.fill();
      }

      // every country that has ever visited: a steady glow that grows with visits
      const maxN = Math.max(1, ...places().map((p) => p.n));
      for (const pl of places()) {
        const ll = window.COUNTRY_LL[pl.c], p = rot(...vec(ll[0], ll[1]));
        if (p[2] <= .04) continue;
        const px = cx + p[0] * R, py = cy - p[1] * R, k = Math.log(1 + pl.n) / Math.log(1 + maxN);
        const rr = dot * (2.2 + 3.5 * k);
        const gg = ctx.createRadialGradient(px, py, 0, px, py, rr * 2.4);
        gg.addColorStop(0, `rgba(235,240,255,${(.55 + .3 * k) * p[2]})`); gg.addColorStop(.35, `rgba(${ACCENT},${.4 * p[2]})`); gg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px, py, rr * 2.4, 0, TAU); ctx.fill();
      }

      // "someone is awake here right now" pulses
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i], age = (now - e.t0) / 3200;
        if (age >= 1) { events.splice(i, 1); continue; }
        const p = rot(e.v[0], e.v[1], e.v[2]);
        if (p[2] <= .04) continue;
        const px = cx + p[0] * R, py = cy - p[1] * R, fade = 1 - age;
        ctx.fillStyle = `rgba(235,240,255,${.95 * Math.min(1, fade * 2.2)})`;
        ctx.beginPath(); ctx.arc(px, py, dot * 2.1, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${ACCENT},${.7 * fade})`; ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath(); ctx.ellipse(px, py, dot * 2 + R * .09 * age, (dot * 2 + R * .09 * age) * (.35 + .65 * p[2]), Math.atan2(py - cy, px - cx), 0, TAU); ctx.stroke();
      }
    }

    // drag to spin (touch keeps vertical page scroll)
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, t: performance.now() }; vel = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const d = (e.clientX - drag.x) * (-180 / (size * .8)); // ~half a turn across the globe
      yaw += d; vel = d * .5; drag.x = e.clientX;
      if (reduce) draw(performance.now());
    });
    const end = () => { drag = null; canvas.style.cursor = ""; };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);

    new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(canvas);
    new IntersectionObserver((en) => { onScreen = en[0].isIntersecting; }).observe(canvas);
    setInterval(() => { sun = sunVec(new Date()); }, 60000);
    resize();
    if (reduce) { addEventListener("litly:places", () => draw(performance.now())); draw(performance.now()); return; }
    (function loop(now) { if (onScreen && !document.hidden) frame(now); else last = now; requestAnimationFrame(loop); })(performance.now());
  };
})();
