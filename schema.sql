CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  avatar TEXT,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  user_id TEXT,        -- author's account (NULL on posts made before sign-in was required)
  image TEXT,          -- R2 key of the attached photo, if any
  image_w INTEGER,
  image_h INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_ip ON posts(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  post_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (post_id, ip_hash)
);

CREATE TABLE IF NOT EXISTS bans (
  ip_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metoos (
  post_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (post_id, ip_hash)
);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  avatar TEXT,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  parent_id INTEGER, -- NULL = top-level reply to the post; otherwise the reply it answers
  user_id TEXT,      -- author's account (NULL on old replies and on deleted ones)
  deleted INTEGER NOT NULL DEFAULT 0 -- 1 = author deleted it but other replies hang off it, so it stays as "[deleted]"
);
CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_replies_user ON replies(user_id, created_at);

-- Hearts on replies (one per person per reply), like metoos does for posts.
CREATE TABLE IF NOT EXISTS reply_metoos (
  reply_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (reply_id, ip_hash)
);

-- Accounts (Better Auth). These hold real name/email from Google or Apple sign-in.
-- Posts and replies point at the account by id but are shown under the public
-- profile username only, never the real name or email.
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_user ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_user ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"("identifier");

-- Public-facing account profile. Randomly assigned on first visit, editable by the user.
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Visitor tracking. Nothing here is identifying: the key is SHA-256(day + random browser id).
-- One row per visitor per UTC day (dedupe + presence); last_seen drives the "awake" count.
CREATE TABLE IF NOT EXISTS visitor_days (
  hash TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visitor_days_seen ON visitor_days(last_seen);
-- Distinct visitors per day, and the all-time total (key 'total').
CREATE TABLE IF NOT EXISTS visitor_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
-- Visits per country (two-letter code, 'XX' = unknown).
CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);
-- Rolling log of first sightings, newest first in the pop-up (trimmed to 200).
CREATE TABLE IF NOT EXISTS recent_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
