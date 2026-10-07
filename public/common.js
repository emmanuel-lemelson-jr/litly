// Helpers shared by the feed (index.html) and the single-post page (post.html).
const profileHref = (p) => `/u/${p.username}`;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(ts, nowMs) {
  const m = Math.round((ts - nowMs) / 60000);
  if (Math.abs(m) < 1) return "now";
  if (Math.abs(m) < 60) return rtf.format(m, "minute");
  return rtf.format(Math.round(m / 60), "hour");
}

// Static markup only, never user input.
const ICON = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.4-9.4-9C1.4 8.4 3.2 5 6.4 5c2 0 3.5 1 4.4 2.5h2.4C14.1 6 15.6 5 17.6 5c3.2 0 5 3.4 3.8 6.5-1.9 4.6-9.4 9-9.4 9z"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.3 9.2 9.2 0 0 1-3.4-.7L3.5 20.5l1.6-4.4A8.2 8.2 0 0 1 3.5 11.5C3.5 6.8 7.3 3 12 3s9 3.8 9 8.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4l7 7-7 7v-4c-5 0-8.5 1.5-11 5 .8-5.5 4-10 11-11z"/></svg>',
};

function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
}

function pill(icon, label, small) {
  const b = document.createElement("button"); b.type = "button"; b.className = "pill" + (small ? " sm" : "");
  b.innerHTML = ICON[icon] + '<span class="n"></span>' + (label ? `<span>${label}</span>` : "");
  return b;
}

// Heart pill for a post or a reply (`reply: true`). One per person; tap again to undo.
function heartPill(item, isReply, small) {
  const b = pill("heart", "", small);
  const set = (count, mine) => {
    b.classList.toggle("on", mine); b.setAttribute("aria-pressed", mine);
    b.setAttribute("aria-label", mine ? `Unheart, ${count} hearts` : `Heart, ${count} hearts`);
    b.querySelector(".n").textContent = count || ""; b.dataset.count = count; b.dataset.mine = mine ? "1" : "";
  };
  set(item.metoo || 0, !!item.mine);
  b.addEventListener("click", async () => {
    const was = !!b.dataset.mine, c = Number(b.dataset.count);
    set(Math.max(0, c + (was ? -1 : 1)), !was); // optimistic
    try {
      const res = await fetch("/api/metoo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, reply: isReply }) });
      const data = await res.json();
      if (!res.ok) throw new Error();
      set(data.count, data.mine);
    } catch { set(c, was); }
  });
  return b;
}

// Share pill: native share sheet on touch devices, otherwise copy the link.
function sharePill(path, small) {
  const b = pill("share", small ? "" : "Share", small);
  b.setAttribute("aria-label", "Share");
  if (small) b.insertAdjacentHTML("beforeend", "<span>Share</span>");
  b.addEventListener("click", async () => {
    const url = new URL(path, location.origin).href;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { prompt("Copy this link", url); }
  });
  return b;
}

// Delete your own post or reply (the server checks ownership). Resolves true if it was deleted.
async function deleteMine(kind, id) {
  const what = kind === "post" ? "post (and its photo, if any)" : "reply";
  if (!confirm(`Delete this ${what}? This can't be undone.`)) return false;
  try {
    const res = await fetch(`/api/${kind}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error();
    return true;
  } catch { toast("Couldn't delete. Try again."); return false; }
}

// Little avatar that links to the author's profile when they have one.
function avatarEl(item, size) {
  const img = new Image(size, size); img.alt = ""; img.src = avatarUri(item.avatar);
  const a = document.createElement("a"); a.href = profileHref(item); a.setAttribute("aria-label", `${item.username}'s profile`); a.append(img);
  return a;
}
function nameEl(item) {
  const el = document.createElement("a"); el.textContent = item.username; el.href = profileHref(item);
  return el;
}

// One post in a list (feed or profile). `me` is the signed-in profile or null; `onDelete(li)` runs after a delete.
function postCard(p, { now, enter, me, onDelete }) {
  const li = document.createElement("li"); li.className = "fpost" + (enter ? " enter" : "");
  const box = document.createElement("div");
  const who = document.createElement("div"); who.className = "who";
  const t = document.createElement("time"); t.dateTime = new Date(p.created_at).toISOString(); t.textContent = ago(p.created_at, now);
  who.append(nameEl(p), t);
  box.append(who);
  if (p.body) { const text = document.createElement("p"); text.textContent = p.body; box.append(text); } // never innerHTML user input
  if (p.image) {
    const im = new Image(); im.className = "pimg"; im.src = "/" + p.image; im.alt = "Photo attached to the post"; im.loading = "lazy"; im.decoding = "async";
    if (p.image_w && p.image_h) { im.width = p.image_w; im.height = p.image_h; }
    box.append(im);
  }
  const href = `/p/${p.id}`;
  const acts = document.createElement("div"); acts.className = "pills";
  const n = p.replies || 0;
  const cb = pill("bubble", ""); cb.querySelector(".n").textContent = n || "";
  cb.setAttribute("aria-label", n ? `${n} ${n === 1 ? "reply" : "replies"}` : "Reply");
  cb.addEventListener("click", () => { location.href = href; });
  acts.append(heartPill(p, false), cb, sharePill(href));
  if (me && p.username && p.username === me.username) {
    const d = pill("trash", ""); d.classList.add("del"); d.setAttribute("aria-label", "Delete post"); d.title = "Delete";
    d.addEventListener("click", async () => { if (await deleteMine("post", p.id)) { li.remove(); onDelete && onDelete(li); } });
    acts.append(d);
  }
  box.append(acts);
  li.append(avatarEl(p, 40), box);
  // Tapping the post opens it (but not while selecting text, or on a link or pill).
  li.addEventListener("click", (e) => {
    if (e.target.closest(".pill, a") || getSelection().toString()) return;
    location.href = href;
  });
  return li;
}
