# Litly

> **Keep this file current.** Whenever product direction, features, architecture, limits, domains or deploy steps change, update this doc in the same change, without waiting to be asked. Remove anything that's no longer true.

Live at **https://litly.com**. An anonymous "what kept you up last night?" feed. Anyone can post without an account, and the whole feed is wiped for everyone at the same moment every day.

## What users can do
- **Post** up to 500 characters, anonymously.
- **Me too** on a post. One per person per post, and tapping again undoes it.
- **Reply** to a post, up to 280 characters.
- **Shuffle** their random avatar.

## How it works
- **Hosting:** One Cloudflare Worker (`src/worker.js`) serves both the API and the static page in `public/`.
- **Database:** Cloudflare D1, which is SQLite (`schema.sql`). Tables: `posts`, `replies`, `metoos`, `bans`. There's also an unused `subscribers` table from an old email waitlist.
- **Daily reset:** Every day at **04:00 UTC**, set by `RESET_HOUR_UTC` in the worker (midnight US Eastern during daylight time). The API only returns posts from the current cycle. A cron job every 15 minutes deletes older posts and their orphaned replies and me-toos. The countdown uses the server's clock and shows the reset time in each visitor's own time zone.
- **Anonymity:** There are no accounts. The server stores a salted hash of the IP (`SALT` secret), never the raw IP. That hash is used for rate limits, me-too dedupe and bans.
- **Avatars:** DiceBear `fun-emoji` (`src/avatars.js`), bundled into `public/avatars.js` by esbuild. The seed is built in the browser from a random localStorage ID, a shuffle count and the reset time, so each person gets a new avatar every day. A fake name like "Wandering Comet" is derived from the same seed.
- **Spam and abuse filters in `looksBad()`:** Blocks links, bare domains, emails, phone numbers, @usernames, scam and "contact me" words (Telegram, crypto, Snapchat and similar), and all-caps text.
- **Other limits:**
  - **Rate limits:** 3 posts and 10 replies per hour per IP hash.
  - **Duplicates:** Exact duplicate posts or replies are rejected.
  - **Honeypot:** A hidden `website` field catches bots.
- **Moderation:** `/admin` (`public/admin.html`) lists posts and replies and can delete, restore or ban. The API is protected by the `ADMIN_TOKEN` secret, sent as `Authorization: Bearer <token>`. Banning deletes all of that person's content.
- **Domains:** `www.litly.com` redirects to `litly.com`.

## Design
Apple-style minimalism: black background, system SF Pro font and one blue accent. The brand logo (`public/logo.svg`) features a custom tired mascot wrapped in a blanket in place of the letter "I" (Pixar-style). The hero features an animated sleeping character (`public/sleepless.webp` with `public/sleepless.gif` fallback, preloaded with high fetch priority) that blinks and yawns over the main headline. Keep everything else simple, with no decorative noise.

## Develop and deploy
```sh
npm install
npm run dev      # local server at http://localhost:8799 with a local D1 database (needs .dev.vars with ADMIN_TOKEN=...)
npm run deploy   # builds avatars and deploys to production
```
- **Cloudflare account:** "Lemelson Capital + Amvona" (`account_id` in `wrangler.toml`), because that's where the `litly.com` zone lives.
- **Schema changes:** Run them on production with `npx wrangler d1 execute cant-sleep --remote --command "..."`. `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so new columns on existing tables need an `ALTER TABLE`.
- **Secrets:** `SALT` and `ADMIN_TOKEN` are Wrangler secrets. Never commit them. `.dev.vars` is gitignored.
