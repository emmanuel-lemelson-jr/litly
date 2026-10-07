import { betterAuth } from "better-auth";

// Sign in with Google / Apple via Better Auth, backed by the same D1 database.
// Real name and email are stored on the account, but posts never reference it.
const enc = new TextEncoder();
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Apple's "client secret" is a short-lived JWT signed with the .p8 key (ES256).
async function appleClientSecret(env) {
  const pem = env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID })));
  const body = b64u(
    enc.encode(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: env.APPLE_CLIENT_ID }))
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

// Built per request because Workers bindings and secrets only exist on `env`.
// Session checks (every profile/account load) don't need the sign-in providers, so they skip signing
// Apple's client secret and reuse one instance per isolate instead of rebuilding Better Auth each request.
const sessionAuths = new Map();
export async function createAuth(env, origin, sessionOnly = false) {
  if (sessionOnly && sessionAuths.has(origin)) return sessionAuths.get(origin);
  const socialProviders = {};
  if (!sessionOnly && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (!sessionOnly && env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY) {
    socialProviders.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: await appleClientSecret(env) };
  }
  const auth = betterAuth({
    appName: "Litly",
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    socialProviders,
    // Apple posts the sign-in result back from appleid.apple.com.
    trustedOrigins: ["https://appleid.apple.com"],
    // Stay signed in for 90 days of inactivity; each day of use pushes the expiry out again.
    // The signed cookie cache lets most session checks skip the database (a sign-out or revoke can lag up to 5 minutes).
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 5 * 60 } },
  });
  if (sessionOnly) sessionAuths.set(origin, auth);
  return auth;
}
