import { createAuth } from "./auth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// The whole site resets at the same instant for everyone: 04:00 UTC daily
// (midnight US Eastern during daylight time). Change this one number to move it.
const RESET_HOUR_UTC = 4;
const MAX_LEN = 500;
const MIN_LEN = 3;
const POSTS_PER_HOUR = 3;
const REPLIES_PER_HOUR = 10;
const REPLY_MAX_LEN = 280;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Start of the current feed cycle and the next reset, in epoch ms (UTC-based).
function cycle(now = Date.now()) {
  const d = new Date(now);
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_HOUR_UTC);
  if (next <= now) next += DAY_MS;
  return { start: next - DAY_MS, next };
}

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashIp(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const data = new TextEncoder().encode(ip + (env.SALT || "dev-salt"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Anonymous posting attracts abuse. These filters keep scams, doxxing and
// "contact me" spam off the domain, which is what gets domains flagged.
const TLDS = "com|net|org|io|co|me|ly|app|dev|xyz|ru|cn|top|info|biz|link|site|online|shop|club|live|cc|tv|gg|lol";
const SCAM_WORDS = /\b(telegram|whatsapp|t\.me|cash\s?app|venmo|zelle|paypal|bitcoin|btc|ethereum|crypto|onlyfans|snapchat|snap\s?me|dm me|text me|call me|add me|forex|investment|giveaway)\b/i;

function looksBad(text) {
  if (/(https?:\/\/|www\.)/i.test(text)) return "No links please.";
  if (new RegExp(`\\b[a-z0-9-]{2,}\\.(${TLDS})\\b`, "i").test(text)) return "No links please.";
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return "Please don't share contact info.";
  if (/(?:\+?\d[\s().-]?){9,}/.test(text)) return "Please don't share phone numbers.";
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(text)) return "Please don't share usernames.";
  if (SCAM_WORDS.test(text)) return "That kind of post isn't allowed here.";
  if (/(.)\1{14,}/.test(text)) return "That looks like spam.";
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length > 25 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) {
    return "Easy on the caps.";
  }
  return null;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function listPosts(request, env) {
  const now = Date.now();
  const { start, next } = cycle(now);
  const ipHash = await hashIp(request, env);
  const { results: posts } = await env.DB.prepare(
    `SELECT p.id, p.body, p.avatar, p.created_at,
       (SELECT COUNT(*) FROM metoos m WHERE m.post_id = p.id) AS metoo,
       EXISTS(SELECT 1 FROM metoos m WHERE m.post_id = p.id AND m.ip_hash = ?) AS mine
     FROM posts p WHERE p.created_at >= ? AND p.hidden = 0
     ORDER BY p.created_at DESC LIMIT 200`
  )
    .bind(ipHash, start)
    .all();
  const { results: replies } = await env.DB.prepare(
    `SELECT id, post_id, body, avatar, created_at FROM replies
     WHERE created_at >= ? AND post_id IN (SELECT id FROM posts WHERE created_at >= ? AND hidden = 0)
     ORDER BY created_at ASC LIMIT 1500`
  )
    .bind(start, start)
    .all();
  const byPost = new Map();
  for (const r of replies) {
    if (!byPost.has(r.post_id)) byPost.set(r.post_id, []);
    byPost.get(r.post_id).push(r);
  }
  for (const p of posts) {
    p.mine = !!p.mine;
    p.replies = byPost.get(p.id) || [];
  }
  return json({ posts, now, resetAt: next });
}

// Public teaser for the sign-up page: only the top few posts by me-too, trimmed,
// with no replies, so the full feed isn't exposed to logged-out visitors.
async function topPosts(env) {
  const now = Date.now();
  const { start, next } = cycle(now);
  const { results } = await env.DB.prepare(
    `SELECT p.id, SUBSTR(p.body, 1, 180) AS body, p.avatar,
       (SELECT COUNT(*) FROM metoos m WHERE m.post_id = p.id) AS metoo
     FROM posts p WHERE p.created_at >= ? AND p.hidden = 0
     ORDER BY metoo DESC, p.created_at DESC LIMIT 5`
  )
    .bind(start)
    .all();
  const res = json({ posts: results, now, resetAt: next });
  res.headers.set("cache-control", "public, max-age=30");
  return res;
}

// ---- Account profile (random username + avatar, editable) ----
const U_ADJ = ["restless", "wired", "sleepless", "quiet", "wandering", "drifting", "midnight", "hazy", "lingering", "dozy"];
const U_NOUN = ["owl", "moth", "fox", "comet", "moon", "firefly", "cat", "star", "raccoon", "lantern"];
const RESERVED_NAMES = /^(admin|administrator|litly|moderator|mod|support|staff|official|help|root|system)$/;
const pick = (a) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
const randomSeed = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomUsername = () => `${pick(U_ADJ)}_${pick(U_NOUN)}_${crypto.getRandomValues(new Uint32Array(1))[0] % 1000}`;

async function sessionUser(request, env, origin) {
  if (!env.BETTER_AUTH_SECRET) return null;
  const auth = await createAuth(env, origin);
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? session.user : null;
}

async function getOrCreateProfile(env, user) {
  const find = () => env.DB.prepare("SELECT username, avatar FROM profiles WHERE user_id = ?").bind(user.id).first();
  const existing = await find();
  if (existing) return existing;
  for (let i = 0; i < 8; i++) {
    const username = randomUsername(), avatar = randomSeed();
    try {
      await env.DB.prepare("INSERT INTO profiles (user_id, username, avatar, created_at) VALUES (?, ?, ?, ?)")
        .bind(user.id, username, avatar, Date.now())
        .run();
      return { username, avatar };
    } catch {
      const again = await find(); // lost a race, or the username was taken: retry
      if (again) return again;
    }
  }
  throw new Error("Could not create profile");
}

async function profile(request, env, url) {
  const user = await sessionUser(request, env, url.origin);
  if (!user) return json({ error: "Not signed in" }, 401);
  let p = await getOrCreateProfile(env, user);

  if (request.method === "POST") {
    const payload = await readBody(request);
    if (!payload) return json({ error: "Bad request" }, 400);
    const username = payload.username === undefined ? p.username : String(payload.username).trim().toLowerCase();
    const avatar = payload.avatar === undefined ? p.avatar : String(payload.avatar);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: "Usernames are 3-20 letters, numbers or underscores." }, 400);
    if (RESERVED_NAMES.test(username)) return json({ error: "That username isn't available." }, 400);
    if (!/^[0-9a-f]{12}$/.test(avatar)) return json({ error: "Bad avatar." }, 400);
    try {
      await env.DB.prepare("UPDATE profiles SET username = ?, avatar = ? WHERE user_id = ?").bind(username, avatar, user.id).run();
    } catch {
      return json({ error: "That username is taken." }, 409);
    }
    p = { username, avatar };
  }
  return json({ name: user.name, username: p.username, avatar: p.avatar });
}

async function createPost(request, env) {
  const payload = await readBody(request);
  if (!payload) return json({ error: "Bad request" }, 400);
  if (payload.website) return json({ ok: true }); // honeypot: pretend success

  const body = String(payload.body || "").trim().replace(/\s+\n/g, "\n");
  if (body.length < MIN_LEN) return json({ error: "Write a little more." }, 400);
  if (body.length > MAX_LEN) return json({ error: `Max ${MAX_LEN} characters.` }, 400);
  const bad = looksBad(body);
  if (bad) return json({ error: bad }, 400);

  const ipHash = await hashIp(request, env);
  const banned = await env.DB.prepare("SELECT 1 FROM bans WHERE ip_hash = ?").bind(ipHash).first();
  if (banned) return json({ error: "Posting isn't available right now." }, 403);
  const now = Date.now();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM posts WHERE ip_hash = ? AND created_at > ?"
  )
    .bind(ipHash, now - 60 * 60 * 1000)
    .first();
  if (recent.c >= POSTS_PER_HOUR) {
    return json({ error: "Easy there. Try again in a bit." }, 429);
  }

  const { start } = cycle(now);
  const dup = await env.DB.prepare("SELECT 1 FROM posts WHERE body = ? AND created_at >= ?")
    .bind(body, start)
    .first();
  if (dup) return json({ error: "Someone already posted that exact thing." }, 409);

  // Avatar seed is computed in the browser from (random id, shuffle count, feed
  // cycle) so the composer preview matches the posted avatar exactly. It rotates
  // every cycle. Accept only a 12-char hex string; otherwise derive one here.
  const given = String(payload.avatar || "");
  const avatar = /^[0-9a-f]{12}$/.test(given)
    ? given
    : (await sha(`${ipHash}|${start}|${env.SALT || "dev-salt"}`)).slice(0, 12);

  await env.DB.prepare("INSERT INTO posts (body, ip_hash, avatar, created_at) VALUES (?, ?, ?, ?)")
    .bind(body, ipHash, avatar, now)
    .run();
  return json({ ok: true });
}


// ---- "me too": one per person per post, tap again to undo ----
async function toggleMeToo(request, env) {
  const payload = await readBody(request);
  const id = Number(payload?.id);
  if (!Number.isInteger(id)) return json({ error: "Bad request" }, 400);
  const ipHash = await hashIp(request, env);
  const banned = await env.DB.prepare("SELECT 1 FROM bans WHERE ip_hash = ?").bind(ipHash).first();
  if (banned) return json({ error: "Not available right now." }, 403);
  const { start } = cycle();
  const post = await env.DB.prepare("SELECT 1 FROM posts WHERE id = ? AND hidden = 0 AND created_at >= ?")
    .bind(id, start)
    .first();
  if (!post) return json({ error: "That post is gone." }, 404);

  const had = await env.DB.prepare("SELECT 1 FROM metoos WHERE post_id = ? AND ip_hash = ?").bind(id, ipHash).first();
  if (had) await env.DB.prepare("DELETE FROM metoos WHERE post_id = ? AND ip_hash = ?").bind(id, ipHash).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO metoos (post_id, ip_hash) VALUES (?, ?)").bind(id, ipHash).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM metoos WHERE post_id = ?").bind(id).first();
  return json({ ok: true, count: row.c, mine: !had });
}

// ---- replies ----
async function createReply(request, env) {
  const payload = await readBody(request);
  if (!payload) return json({ error: "Bad request" }, 400);
  if (payload.website) return json({ ok: true }); // honeypot

  const postId = Number(payload.post_id);
  if (!Number.isInteger(postId)) return json({ error: "Bad request" }, 400);
  const body = String(payload.body || "").trim().replace(/\s+\n/g, "\n");
  if (body.length < 2) return json({ error: "Write a little more." }, 400);
  if (body.length > REPLY_MAX_LEN) return json({ error: `Max ${REPLY_MAX_LEN} characters.` }, 400);
  const bad = looksBad(body);
  if (bad) return json({ error: bad }, 400);

  const ipHash = await hashIp(request, env);
  const banned = await env.DB.prepare("SELECT 1 FROM bans WHERE ip_hash = ?").bind(ipHash).first();
  if (banned) return json({ error: "Posting isn't available right now." }, 403);

  const now = Date.now();
  const { start } = cycle(now);
  const post = await env.DB.prepare("SELECT 1 FROM posts WHERE id = ? AND hidden = 0 AND created_at >= ?")
    .bind(postId, start)
    .first();
  if (!post) return json({ error: "That post is gone." }, 404);

  const recent = await env.DB.prepare("SELECT COUNT(*) AS c FROM replies WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, now - 60 * 60 * 1000)
    .first();
  if (recent.c >= REPLIES_PER_HOUR) return json({ error: "Easy there. Try again in a bit." }, 429);

  const dup = await env.DB.prepare("SELECT 1 FROM replies WHERE post_id = ? AND body = ? AND created_at >= ?")
    .bind(postId, body, start)
    .first();
  if (dup) return json({ error: "Someone already said that." }, 409);

  const given = String(payload.avatar || "");
  const avatar = /^[0-9a-f]{12}$/.test(given)
    ? given
    : (await sha(`${ipHash}|${start}|${env.SALT || "dev-salt"}`)).slice(0, 12);

  await env.DB.prepare("INSERT INTO replies (post_id, body, avatar, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(postId, body, avatar, ipHash, now)
    .run();
  return json({ ok: true });
}

// Remove replies / me-toos whose post no longer exists.
async function cleanOrphans(env) {
  await env.DB.prepare("DELETE FROM replies WHERE post_id NOT IN (SELECT id FROM posts)").run();
  await env.DB.prepare("DELETE FROM metoos WHERE post_id NOT IN (SELECT id FROM posts)").run();
}

// ---- admin: protected by the ADMIN_TOKEN secret ----
function isAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  return !!env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`;
}

async function admin(request, env, path) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  if (path === "/api/admin/posts") {
    const { results } = await env.DB.prepare(
      "SELECT id, body, avatar, reports, hidden, substr(ip_hash,1,8) AS ip, created_at FROM posts ORDER BY hidden DESC, reports DESC, created_at DESC LIMIT 300"
    ).all();
    const { results: replies } = await env.DB.prepare(
      "SELECT id, post_id, body, substr(ip_hash,1,8) AS ip, created_at FROM replies ORDER BY created_at DESC LIMIT 300"
    ).all();
    return json({ posts: results, replies });
  }
  const payload = (await readBody(request)) || {};
  const id = Number(payload.id);
  if (!Number.isInteger(id)) return json({ error: "Bad request" }, 400);
  if (path === "/api/admin/delete") {
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
    await cleanOrphans(env);
  } else if (path === "/api/admin/delete-reply") {
    await env.DB.prepare("DELETE FROM replies WHERE id = ?").bind(id).run();
  } else if (path === "/api/admin/ban-reply") {
    const row = await env.DB.prepare("SELECT ip_hash FROM replies WHERE id = ?").bind(id).first();
    if (row) {
      await env.DB.prepare("INSERT OR IGNORE INTO bans (ip_hash, created_at) VALUES (?, ?)").bind(row.ip_hash, Date.now()).run();
      await env.DB.prepare("DELETE FROM replies WHERE ip_hash = ?").bind(row.ip_hash).run();
      await env.DB.prepare("DELETE FROM posts WHERE ip_hash = ?").bind(row.ip_hash).run();
      await cleanOrphans(env);
    }
  } else if (path === "/api/admin/restore") {
    await env.DB.prepare("UPDATE posts SET hidden = 0, reports = 0 WHERE id = ?").bind(id).run();
  } else if (path === "/api/admin/ban") {
    const row = await env.DB.prepare("SELECT ip_hash FROM posts WHERE id = ?").bind(id).first();
    if (row) {
      await env.DB.prepare("INSERT OR IGNORE INTO bans (ip_hash, created_at) VALUES (?, ?)").bind(row.ip_hash, Date.now()).run();
      await env.DB.prepare("DELETE FROM posts WHERE ip_hash = ?").bind(row.ip_hash).run();
      await env.DB.prepare("DELETE FROM replies WHERE ip_hash = ?").bind(row.ip_hash).run();
      await cleanOrphans(env);
    }
  } else return json({ error: "Not found" }, 404);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One canonical host: litly.com (keeps localStorage/identity in one place)
    if (url.hostname !== "litly.com" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      url.hostname = "litly.com";
      return Response.redirect(url.toString(), 301);
    }
    try {
      if (url.pathname.startsWith("/api/auth/")) {
        if (!env.BETTER_AUTH_SECRET) return json({ error: "Sign-in isn't set up." }, 503);
        const auth = await createAuth(env, url.origin);
        return await auth.handler(request);
      }
      if (url.pathname === "/api/posts" && request.method === "GET") return await listPosts(request, env);
      if (url.pathname === "/api/profile" && (request.method === "GET" || request.method === "POST")) return await profile(request, env, url);
      if (url.pathname === "/api/top" && request.method === "GET") return await topPosts(env);
      if (url.pathname === "/api/metoo" && request.method === "POST") return await toggleMeToo(request, env);
      if (url.pathname === "/api/replies" && request.method === "POST") return await createReply(request, env);
      if (url.pathname === "/api/posts" && request.method === "POST") return await createPost(request, env);
      if (url.pathname.startsWith("/api/admin/")) return await admin(request, env, url.pathname);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Something broke. Try again." }, 500);
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.includes("favicon") || url.pathname.includes("apple-touch-icon")) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "no-cache, must-revalidate");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },

  async scheduled(_event, env) {
    await env.DB.prepare("DELETE FROM posts WHERE created_at < ?")
      .bind(cycle().start)
      .run();
    await cleanOrphans(env);
  },
};
