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
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // the browser shrinks photos first, so real uploads are far smaller
const IMAGE_TYPES = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

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

// Author fields come from the account's public profile (username + avatar), so a change on
// /account shows up on everything they've posted. Old posts without an account have neither.
const POST_COLS = `p.id, p.body, p.created_at, p.image, p.image_w, p.image_h, pr.username,
       COALESCE(pr.avatar, p.avatar) AS avatar,
       (SELECT COUNT(*) FROM metoos m WHERE m.post_id = p.id) AS metoo,
       (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS replies`;
const POST_JOIN = "FROM posts p LEFT JOIN profiles pr ON pr.user_id = p.user_id";
const heartedByMe = "EXISTS(SELECT 1 FROM metoos m WHERE m.post_id = p.id AND m.ip_hash = ?) AS mine";

// The feed only shows the current 24h cycle; everything older stays in the database
// (profiles, direct links) but is no longer listed here.
async function listPosts(request, env) {
  const now = Date.now();
  const { start, next } = cycle(now);
  const ipHash = await hashIp(request, env);
  const { results: posts } = await env.DB.prepare(
    `SELECT ${POST_COLS}, ${heartedByMe}
     ${POST_JOIN} WHERE p.created_at >= ? AND p.hidden = 0
     ORDER BY p.created_at DESC LIMIT 200`
  )
    .bind(ipHash, start)
    .all();
  for (const p of posts) p.mine = !!p.mine;
  return json({ posts, now, resetAt: next });
}

// One post with its whole reply tree (flat; the browser nests it by parent_id).
// Works for any post that still exists, however old.
async function getPost(request, env, url) {
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return json({ error: "Bad request" }, 400);
  const now = Date.now();
  const { next } = cycle(now);
  const ipHash = await hashIp(request, env);
  const post = await env.DB.prepare(
    `SELECT ${POST_COLS}, p.ip_hash, ${heartedByMe}
     ${POST_JOIN} WHERE p.id = ? AND p.hidden = 0`
  )
    .bind(ipHash, id)
    .first();
  if (!post) return json({ error: "Gone", gone: true }, 404);
  post.mine = !!post.mine;
  const opHash = post.ip_hash;
  delete post.ip_hash;
  const { results: replies } = await env.DB.prepare(
    `SELECT r.id, r.parent_id, r.created_at, r.deleted,
       CASE WHEN r.deleted THEN '[deleted]' ELSE r.body END AS body,
       CASE WHEN r.deleted THEN NULL ELSE pr.username END AS username,
       CASE WHEN r.deleted THEN NULL ELSE COALESCE(pr.avatar, r.avatar) END AS avatar,
       (SELECT COUNT(*) FROM reply_metoos m WHERE m.reply_id = r.id) AS metoo,
       EXISTS(SELECT 1 FROM reply_metoos m WHERE m.reply_id = r.id AND m.ip_hash = ?) AS mine,
       r.ip_hash = ? AS op
     FROM replies r LEFT JOIN profiles pr ON pr.user_id = r.user_id
     WHERE r.post_id = ? ORDER BY r.created_at ASC LIMIT 1000`
  )
    .bind(ipHash, opHash, id)
    .all();
  for (const r of replies) { r.mine = !!r.mine; r.op = !!r.op && !r.deleted; r.deleted = !!r.deleted; }
  return json({ post, replies, now, resetAt: next });
}

// A person's public profile: who they are plus every post and reply they've made.
async function getUser(request, env, url) {
  const name = String(url.searchParams.get("name") || "").toLowerCase();
  const prof = await env.DB.prepare("SELECT user_id, username, avatar, created_at FROM profiles WHERE username = ?").bind(name).first();
  if (!prof) return json({ error: "No such person." }, 404);
  const ipHash = await hashIp(request, env);
  const { results: posts } = await env.DB.prepare(
    `SELECT ${POST_COLS}, ${heartedByMe}
     ${POST_JOIN} WHERE p.user_id = ? AND p.hidden = 0 ORDER BY p.created_at DESC LIMIT 200`
  )
    .bind(ipHash, prof.user_id)
    .all();
  for (const p of posts) p.mine = !!p.mine;
  const { results: replies } = await env.DB.prepare(
    `SELECT r.id, r.post_id, r.body, r.created_at, SUBSTR(p.body, 1, 100) AS post_body,
       (SELECT COUNT(*) FROM reply_metoos m WHERE m.reply_id = r.id) AS metoo,
       EXISTS(SELECT 1 FROM reply_metoos m WHERE m.reply_id = r.id AND m.ip_hash = ?) AS mine
     FROM replies r JOIN posts p ON p.id = r.post_id
     WHERE r.user_id = ? AND r.deleted = 0 AND p.hidden = 0 ORDER BY r.created_at DESC LIMIT 200`
  )
    .bind(ipHash, prof.user_id)
    .all();
  for (const r of replies) r.mine = !!r.mine;
  return json({ user: { username: prof.username, avatar: prof.avatar, joined: prof.created_at }, posts, replies });
}

// Public teaser for the sign-up page: only the top few posts by me-too, trimmed,
// with no replies, so the full feed isn't exposed to logged-out visitors.
async function topPosts(env) {
  const now = Date.now();
  const { start, next } = cycle(now);
  const { results } = await env.DB.prepare(
    `SELECT p.id, SUBSTR(p.body, 1, 180) AS body, p.created_at, pr.username, COALESCE(pr.avatar, p.avatar) AS avatar,
       (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS replies,
       (SELECT COUNT(*) FROM metoos m WHERE m.post_id = p.id) AS metoo
     FROM posts p LEFT JOIN profiles pr ON pr.user_id = p.user_id WHERE p.created_at >= ? AND p.hidden = 0
     ORDER BY metoo DESC, p.created_at DESC LIMIT 5`
  )
    .bind(start)
    .all();
  const res = json({ posts: results, now, resetAt: next });
  res.headers.set("cache-control", "public, max-age=30");
  return res;
}

// ---- Account profile (random username + avatar, editable) ----
const U_ADJ = ["restless", "wired", "sleepless", "quiet", "wandering", "drifting", "midnight", "hazy", "lingering", "dozy", "sleepy", "cozy", "moonlit", "starry", "mellow", "gentle", "foggy", "dreamy", "nocturnal", "tired", "silent", "velvet", "lazy", "twilight"];
const U_NOUN = ["owl", "moth", "fox", "comet", "moon", "firefly", "cat", "star", "raccoon", "lantern", "bat", "cloud", "panda", "bear", "otter", "badger", "luna", "pillow", "blanket", "lamp", "sparrow", "willow", "ember", "dusk"];
const RESERVED_NAMES = /^(admin|administrator|litly|moderator|mod|support|staff|official|help|root|system)$/;
const pick = (a) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
const randomSeed = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
// Keep names short and memorable (e.g. "sleepy_fox"). Digits are only added when the
// plain name is taken, and get longer as more people sign up and collisions pile up.
const randomUsername = (attempt) => {
  const base = `${pick(U_ADJ)}_${pick(U_NOUN)}`;
  if (attempt < 8) return base;
  const digits = attempt < 14 ? 2 : 3; // longest base is 17 chars; the 20-char username limit leaves room for 3 digits
  return `${base}${crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** digits}`;
};

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
  for (let i = 0; i < 24; i++) {
    const username = randomUsername(i), avatar = randomSeed();
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
  return json({ username: p.username, avatar: p.avatar });
}

// Identify the real file type from its first bytes instead of trusting what the browser says.
function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

// Signing in is required to post. The form is multipart so a photo can ride along; the browser
// has already resized it (and stripped location data by redrawing it on a canvas).
async function createPost(request, env, url) {
  const user = await sessionUser(request, env, url.origin);
  if (!user) return json({ error: "Log in to post." }, 401);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Bad request" }, 400); }
  if (form.get("website")) return json({ ok: true }); // honeypot: pretend success

  const body = String(form.get("body") || "").trim().replace(/\s+\n/g, "\n");
  const file = form.get("image");
  const hasImage = file && typeof file !== "string" && file.size > 0;
  if (body.length < (hasImage ? 0 : MIN_LEN)) return json({ error: "Write a little more." }, 400);
  if (body.length > MAX_LEN) return json({ error: `Max ${MAX_LEN} characters.` }, 400);
  const bad = body && looksBad(body);
  if (bad) return json({ error: bad }, 400);

  let ext = null, bytes = null, w = null, h = null;
  if (hasImage) {
    if (!env.MEDIA) return json({ error: "Photos aren't available right now." }, 503);
    if (file.size > MAX_IMAGE_BYTES) return json({ error: "That photo is too big." }, 413);
    bytes = new Uint8Array(await file.arrayBuffer());
    ext = sniffImage(bytes);
    if (!ext) return json({ error: "Only JPEG, PNG or WebP photos." }, 400);
    w = Number(form.get("image_w")); h = Number(form.get("image_h"));
    if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 8000 && h <= 8000)) { w = null; h = null; }
  }

  const ipHash = await hashIp(request, env);
  const banned = await env.DB.prepare("SELECT 1 FROM bans WHERE ip_hash = ?").bind(ipHash).first();
  if (banned) return json({ error: "Posting isn't available right now." }, 403);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND created_at > ?")
    .bind(user.id, now - 60 * 60 * 1000)
    .first();
  if (recent.c >= POSTS_PER_HOUR) return json({ error: "Easy there. Try again in a bit." }, 429);

  const { start } = cycle(now);
  if (body) {
    const dup = await env.DB.prepare("SELECT 1 FROM posts WHERE body = ? AND created_at >= ?").bind(body, start).first();
    if (dup) return json({ error: "Someone already posted that exact thing." }, 409);
  }

  const profile = await getOrCreateProfile(env, user);
  let key = null;
  if (hasImage) {
    key = `img/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: IMAGE_TYPES[ext] } });
  }
  try {
    await env.DB.prepare("INSERT INTO posts (body, ip_hash, avatar, created_at, user_id, image, image_w, image_h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(body, ipHash, profile.avatar, now, user.id, key, w, h)
      .run();
  } catch (err) {
    if (key) await env.MEDIA.delete(key).catch(() => {}); // don't leave a photo behind for a post that failed
    throw err;
  }
  return json({ ok: true });
}

// Delete posts and everything attached to them, including the photos in R2.
async function removePosts(env, ids) {
  for (const id of ids) {
    const post = await env.DB.prepare("SELECT image FROM posts WHERE id = ?").bind(id).first();
    if (post?.image && env.MEDIA) await env.MEDIA.delete(post.image);
    await env.DB.prepare("DELETE FROM reply_metoos WHERE reply_id IN (SELECT id FROM replies WHERE post_id = ?)").bind(id).run();
    await env.DB.prepare("DELETE FROM replies WHERE post_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM metoos WHERE post_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  }
}

// Authors can delete their own post (photo included) or reply.
async function deleteOwn(request, env, url, kind) {
  const user = await sessionUser(request, env, url.origin);
  if (!user) return json({ error: "Log in first." }, 401);
  const payload = await readBody(request);
  const id = Number(payload?.id);
  if (!Number.isInteger(id)) return json({ error: "Bad request" }, 400);
  if (kind === "post") {
    const row = await env.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(id).first();
    if (!row || row.user_id !== user.id) return json({ error: "Not yours to delete." }, 403);
    await removePosts(env, [id]);
  } else {
    const row = await env.DB.prepare("SELECT user_id FROM replies WHERE id = ?").bind(id).first();
    if (!row || row.user_id !== user.id) return json({ error: "Not yours to delete." }, 403);
    // Keep a "[deleted]" placeholder if other replies hang off it, like Reddit; otherwise remove it.
    const child = await env.DB.prepare("SELECT 1 FROM replies WHERE parent_id = ? LIMIT 1").bind(id).first();
    if (child) await env.DB.prepare("UPDATE replies SET deleted = 1, body = '', user_id = NULL, avatar = NULL WHERE id = ?").bind(id).run();
    else {
      await env.DB.prepare("DELETE FROM reply_metoos WHERE reply_id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM replies WHERE id = ?").bind(id).run();
    }
  }
  return json({ ok: true });
}

// Photos are served from R2 through the Worker. Keys are random, so they cache forever.
async function serveImage(env, key) {
  const obj = env.MEDIA && (await env.MEDIA.get(key));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

// ---- "me too": one per person per post, tap again to undo ----
async function toggleMeToo(request, env) {
  const payload = await readBody(request);
  const id = Number(payload?.id);
  if (!Number.isInteger(id)) return json({ error: "Bad request" }, 400);
  const ipHash = await hashIp(request, env);
  const banned = await env.DB.prepare("SELECT 1 FROM bans WHERE ip_hash = ?").bind(ipHash).first();
  if (banned) return json({ error: "Not available right now." }, 403);
  // Same toggle for posts and for replies (`reply: true`); only the table differs.
  const isReply = !!payload.reply;
  const [table, col] = isReply ? ["reply_metoos", "reply_id"] : ["metoos", "post_id"];
  const live = isReply
    ? env.DB.prepare("SELECT 1 FROM replies r JOIN posts p ON p.id = r.post_id WHERE r.id = ? AND p.hidden = 0 AND r.deleted = 0")
    : env.DB.prepare("SELECT 1 FROM posts WHERE id = ? AND hidden = 0");
  if (!(await live.bind(id).first())) return json({ error: "That post is gone." }, 404);

  const had = await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ? AND ip_hash = ?`).bind(id, ipHash).first();
  if (had) await env.DB.prepare(`DELETE FROM ${table} WHERE ${col} = ? AND ip_hash = ?`).bind(id, ipHash).run();
  else await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (${col}, ip_hash) VALUES (?, ?)`).bind(id, ipHash).run();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = ?`).bind(id).first();
  return json({ ok: true, count: row.c, mine: !had });
}

// ---- replies ----
async function createReply(request, env, url) {
  const user = await sessionUser(request, env, url.origin);
  if (!user) return json({ error: "Log in to reply." }, 401);
  const payload = await readBody(request);
  if (!payload) return json({ error: "Bad request" }, 400);
  if (payload.website) return json({ ok: true }); // honeypot

  const postId = Number(payload.post_id);
  if (!Number.isInteger(postId)) return json({ error: "Bad request" }, 400);
  const parentId = payload.parent_id == null ? null : Number(payload.parent_id);
  if (parentId !== null && !Number.isInteger(parentId)) return json({ error: "Bad request" }, 400);
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
  const post = await env.DB.prepare("SELECT 1 FROM posts WHERE id = ? AND hidden = 0").bind(postId).first();
  if (!post) return json({ error: "That post is gone." }, 404);

  if (parentId !== null) {
    const parent = await env.DB.prepare("SELECT 1 FROM replies WHERE id = ? AND post_id = ?").bind(parentId, postId).first();
    if (!parent) return json({ error: "That reply is gone." }, 404);
  }

  const recent = await env.DB.prepare("SELECT COUNT(*) AS c FROM replies WHERE user_id = ? AND created_at > ?")
    .bind(user.id, now - 60 * 60 * 1000)
    .first();
  if (recent.c >= REPLIES_PER_HOUR) return json({ error: "Easy there. Try again in a bit." }, 429);

  const dup = await env.DB.prepare("SELECT 1 FROM replies WHERE post_id = ? AND body = ? AND created_at >= ?")
    .bind(postId, body, start)
    .first();
  if (dup) return json({ error: "Someone already said that." }, 409);

  const profile = await getOrCreateProfile(env, user);
  const res = await env.DB.prepare("INSERT INTO replies (post_id, parent_id, body, avatar, ip_hash, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(postId, parentId, body, profile.avatar, ipHash, now, user.id)
    .run();
  return json({ ok: true, id: res.meta.last_row_id });
}

// Remove replies / me-toos whose post no longer exists.
async function cleanOrphans(env) {
  await env.DB.prepare("DELETE FROM replies WHERE post_id NOT IN (SELECT id FROM posts)").run();
  await env.DB.prepare("DELETE FROM metoos WHERE post_id NOT IN (SELECT id FROM posts)").run();
  await env.DB.prepare("DELETE FROM reply_metoos WHERE reply_id NOT IN (SELECT id FROM replies)").run();
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
    await removePosts(env, [id]);
  } else if (path === "/api/admin/delete-reply") {
    await env.DB.prepare("DELETE FROM replies WHERE id = ?").bind(id).run();
    await cleanOrphans(env);
  } else if (path === "/api/admin/ban-reply") {
    const row = await env.DB.prepare("SELECT ip_hash FROM replies WHERE id = ?").bind(id).first();
    if (row) {
      await env.DB.prepare("INSERT OR IGNORE INTO bans (ip_hash, created_at) VALUES (?, ?)").bind(row.ip_hash, Date.now()).run();
      await env.DB.prepare("DELETE FROM replies WHERE ip_hash = ?").bind(row.ip_hash).run();
      const { results: theirs } = await env.DB.prepare("SELECT id FROM posts WHERE ip_hash = ?").bind(row.ip_hash).all();
      await removePosts(env, theirs.map((r) => r.id));
      await cleanOrphans(env);
    }
  } else if (path === "/api/admin/restore") {
    await env.DB.prepare("UPDATE posts SET hidden = 0, reports = 0 WHERE id = ?").bind(id).run();
  } else if (path === "/api/admin/ban") {
    const row = await env.DB.prepare("SELECT ip_hash FROM posts WHERE id = ?").bind(id).first();
    if (row) {
      await env.DB.prepare("INSERT OR IGNORE INTO bans (ip_hash, created_at) VALUES (?, ?)").bind(row.ip_hash, Date.now()).run();
      const { results: theirs } = await env.DB.prepare("SELECT id FROM posts WHERE ip_hash = ?").bind(row.ip_hash).all();
      await removePosts(env, theirs.map((r) => r.id));
      await env.DB.prepare("DELETE FROM replies WHERE ip_hash = ?").bind(row.ip_hash).run();
      await cleanOrphans(env);
    }
  } else return json({ error: "Not found" }, 404);
  return json({ ok: true });
}

// ---- Visitors: country + "awake" presence --------------------------------------------------
// Country comes free from Cloudflare's edge (request.cf.country), so there is no IP lookup.
// The browser sends a random id that changes daily; we only ever store SHA-256(day + id).
const AWAKE_MS = 15 * 60 * 1000; // someone is "awake" if they loaded or touched the page in the last 15 minutes
const RECENT_KEEP = 200;
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|node-fetch|go-http/i;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function visitorSnapshot(env, now) {
  const [awake, total, recent, places] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM visitor_days WHERE last_seen > ?").bind(now - AWAKE_MS),
    env.DB.prepare("SELECT value FROM visitor_stats WHERE key = 'total'"),
    env.DB.prepare("SELECT id, country AS c, created_at AS t FROM recent_visits ORDER BY id DESC LIMIT ?").bind(RECENT_KEEP),
    // Globe: every country ever seen (n = all-time visits) and how many are awake there right now (a).
    env.DB.prepare(
      `SELECT c.code AS c, c.visits AS n,
         (SELECT COUNT(*) FROM visitor_days v WHERE v.country = c.code AND v.last_seen > ?) AS a
       FROM countries c WHERE c.code != 'XX' ORDER BY c.visits DESC LIMIT 250`
    ).bind(now - AWAKE_MS),
  ]);
  return { awake: awake.results[0].n, total: total.results[0]?.value || 0, recent: recent.results, places: places.results, now };
}

// Called on load, when the tab becomes visible again, and every so often while it stays visible.
async function recordVisit(request, env) {
  const body = await readBody(request);
  const id = String(body?.id || "");
  const now = Date.now();
  if (/^[A-Za-z0-9-]{16,64}$/.test(id) && !BOT_UA.test(request.headers.get("user-agent") || "")) {
    const day = new Date(now).toISOString().slice(0, 10);
    const hash = await sha256Hex(day + id);
    let country = String(request.cf?.country || "XX").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || country === "T1") country = "XX"; // T1 = Tor
    const seen = await env.DB.prepare("UPDATE visitor_days SET last_seen = ? WHERE hash = ?").bind(now, hash).run();
    if (!seen.meta.changes) {
      // First sighting today. INSERT OR IGNORE keeps two simultaneous tabs from double counting.
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO visitor_days (hash, day, country, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)")
        .bind(hash, day, country, now, now).run();
      if (ins.meta.changes) {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO visitor_stats (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1").bind("day:" + day),
          env.DB.prepare("INSERT INTO visitor_stats (key, value) VALUES ('total', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1"),
          env.DB.prepare("INSERT INTO countries (code, visits) VALUES (?, 1) ON CONFLICT(code) DO UPDATE SET visits = visits + 1").bind(country),
          env.DB.prepare("INSERT INTO recent_visits (country, created_at) VALUES (?, ?)").bind(country, now),
          env.DB.prepare("DELETE FROM recent_visits WHERE id <= (SELECT MAX(id) FROM recent_visits) - ?").bind(RECENT_KEEP),
          env.DB.prepare("DELETE FROM visitor_days WHERE day < ?").bind(new Date(now - 2 * DAY_MS).toISOString().slice(0, 10)),
        ]);
      }
    }
  }
  return json(await visitorSnapshot(env, now));
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
      if (url.pathname === "/api/post" && request.method === "GET") return await getPost(request, env, url);
      if (url.pathname === "/api/user" && request.method === "GET") return await getUser(request, env, url);
      if (url.pathname === "/api/post/delete" && request.method === "POST") return await deleteOwn(request, env, url, "post");
      if (url.pathname === "/api/reply/delete" && request.method === "POST") return await deleteOwn(request, env, url, "reply");
      if (url.pathname === "/api/profile" && (request.method === "GET" || request.method === "POST")) return await profile(request, env, url);
      if (url.pathname === "/api/visit" && request.method === "POST") return await recordVisit(request, env);
      if (url.pathname === "/api/visitors" && request.method === "GET") return json(await visitorSnapshot(env, Date.now()));
      if (url.pathname === "/api/top" && request.method === "GET") return await topPosts(env);
      if (url.pathname === "/api/metoo" && request.method === "POST") return await toggleMeToo(request, env);
      if (url.pathname === "/api/replies" && request.method === "POST") return await createReply(request, env, url);
      if (url.pathname === "/api/posts" && request.method === "POST") return await createPost(request, env, url);
      if (url.pathname.startsWith("/api/admin/")) return await admin(request, env, url.pathname);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Something broke. Try again." }, 500);
    }
    if (url.pathname.startsWith("/img/") && request.method === "GET") return await serveImage(env, url.pathname.slice(1));
    // /u/name is a public profile page; the page itself reads the name from the URL.
    if (/^\/u\/[A-Za-z0-9_]{3,20}\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/profile", url), request));
    // /p/123 is the single-post page; the page itself reads the id from the URL.
    if (/^\/p\/\d+\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/post", url), request));
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.includes("favicon") || url.pathname.includes("apple-touch-icon")) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "no-cache, must-revalidate");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },
};
