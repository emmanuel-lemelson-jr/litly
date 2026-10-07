# Litly

> **Keep this file current.** Whenever product direction, features, architecture, limits, domains or deploy steps change, update this doc in the same change, without waiting to be asked. Remove anything that's no longer true.

Live at **https://litly.com**. An anonymous "what kept you up last night?" feed. Anyone can post without an account, and the whole feed is wiped for everyone at the same moment every day.

## What users can do
- **Post** up to 500 characters, anonymously.
- **Heart** a post. One per person per post, and tapping again undoes it. (Stored in the `metoos` table and `/api/metoo`, a leftover name.)
- **Reply** to a post, up to 280 characters. Replies show under the post; the reply box only appears after pressing Reply.
- **Shuffle** their random avatar.

## How it works
- **Hosting:** One Cloudflare Worker (`src/worker.js`) serves both the API and the static page in `public/`.
- **Database:** Cloudflare D1, which is SQLite (`schema.sql`). Tables: `posts`, `replies`, `metoos` (hearts), `bans`, `profiles`, plus Better Auth's `user`, `session`, `account`, `verification`. There's also an unused `subscribers` table from an old email waitlist.
- **Daily reset:** Every day at **04:00 UTC**, set by `RESET_HOUR_UTC` in the worker (midnight US Eastern during daylight time). The API only returns posts from the current cycle. A cron job every 15 minutes deletes older posts and their orphaned replies and me-toos. The countdown uses the server's clock and shows the reset time in each visitor's own time zone.
- **Anonymity:** There are no accounts. The server stores a salted hash of the IP (`SALT` secret), never the raw IP. That hash is used for rate limits, me-too dedupe and bans.
- **Avatars:** DiceBear `fun-emoji` (`src/avatars.js`), bundled into `public/avatars.js` by esbuild. The seed is built in the browser from a random localStorage ID, a shuffle count and the reset time, so each person gets a new avatar every day. A fake name like "Wandering Comet" is derived from the same seed.
- **Spam and abuse filters in `looksBad()`:** Blocks links, bare domains, emails, phone numbers, @usernames, scam and "contact me" words (Telegram, crypto, Snapchat and similar), and all-caps text.
- **Other limits:**
  - **Rate limits:** 3 posts and 10 replies per hour per IP hash.
  - **Duplicates:** Exact duplicate posts or replies are rejected.
  - **Honeypot:** A hidden `website` field catches bots.
- **Moderation:** `/admin` (`public/admin.html`) lists posts and replies and can delete, restore or ban. The API is protected by the `ADMIN_TOKEN` secret, sent as `Authorization: Bearer <token>`. Banning deletes all of that person's content.
- **Domains:** All non-canonical hosts (`www.litly.com` and `*.workers.dev`, including `cant-sleep-feed.flektmail.workers.dev` via `redirect-worker/`) 301 redirect to `litly.com`.

- **Sign-up page (`/signup`, `public/signup.html`):** Headline "Can't sleep? Vent about it." (accent on the second line). Google and Apple buttons (Better Auth, `src/auth.js`, served under `/api/auth/*`) with terms and privacy agreement text placed directly underneath. The right side shows the sleepy mascot plus a slow single lane of cards (3-4 visible, fading at the edges, drifting upward in a seamless loop, pausing on hover) built from the top 5 posts by me-too from `GET /api/top` (bodies trimmed to 180 chars, no replies), so the full feed isn't exposed to logged-out visitors.

- **Legal pages:** `/privacy` (`public/privacy.html`) and `/terms` (`public/terms.html`), linked from the sign-up page and the footer. They contain a `[CONTACT EMAIL]` placeholder to replace with a real address, and they should be reviewed by a lawyer.

- **Accounts:** Sign in with Google or Apple via Better Auth. Real name and email are stored in the `user` table but never shown publicly, and posts/replies never reference accounts. The header shows a "Log in" button, or the person's avatar + username (links to `/account`) when signed in. To avoid flicker, an inline script paints the header from a `litly_me` localStorage cache before first paint, then `/api/profile` confirms it and only repaints on a change; a `litly_pending` flag hides the header while returning from a sign-in. Sessions last 90 days of inactivity (rolling, refreshed daily). `/account` (`public/account.html`) shows the avatar, username and name; `GET/POST /api/profile` assigns a random username (e.g. `hazy_moon_838`) and avatar on first visit, and lets them change both (username 3-20 chars `[a-z0-9_]`, unique). Posting is still anonymous and tied to the IP hash, not the account.

## Design
Social preview (Open Graph / Twitter card) image is `public/og-v4.png` (1200x630): black, the sleeping mascot centered over "Can't sleep?" with "Vent about it." in the accent color beneath it, and the logo top-left. No subtext, and no og/twitter description tags. Bump the filename when it changes, since platforms cache these.

Apple-style minimalism: black background, system SF Pro font and a soothing periwinkle accent (`#869ad5`) matching the tired avatar mascot. The brand logo (`public/logo.svg`) features a custom tired mascot wrapped in a blanket in place of the letter "I" (Pixar-style). Favicon suite follows modern web standards: scalable `public/favicon.svg` and multi-resolution 32-bit `public/favicon.ico` (16, 32, 48px) with full alpha transparency, featuring the blanket-wrapped mascot inside an Apple-style rounded black squircle with transparent corners; alongside `public/apple-touch-icon.png` (180x180) and standard PNG icons (`favicon-32x32.png`, `favicon-16x16.png`). The hero features an animated sleeping character (`public/sleepless.webp` with `public/sleepless.gif` fallback, preloaded with high fetch priority) that blinks and yawns over the main headline ("Can't sleep?"). Subhead: "You're not alone. Vent anonymously." The post composer is a compact auto-expanding field featuring a character-by-character typing placeholder cycling punchy late-night thoughts (animating immediately on start). Keep everything else simple, with no decorative noise.

## Develop and deploy
```sh
npm install
npm run dev      # local server at http://localhost:8799 with a local D1 database (needs .dev.vars with ADMIN_TOKEN=...)
npm run deploy   # builds avatars and deploys to production
```
- **Cloudflare account:** "Lemelson Capital + Amvona" (`account_id` in `wrangler.toml`), because that's where the `litly.com` zone lives.
- **Schema changes:** Run them on production with `npx wrangler d1 execute cant-sleep --remote --command "..."`. `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so new columns on existing tables need an `ALTER TABLE`.
- **Secrets:** `SALT` and `ADMIN_TOKEN` are Wrangler secrets. Never commit them. `.dev.vars` is gitignored.
