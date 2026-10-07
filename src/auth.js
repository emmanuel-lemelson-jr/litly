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
export async function createAuth(env, origin) {
  const socialProviders = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY) {
    socialProviders.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: await appleClientSecret(env) };
  }
  return betterAuth({
    appName: "Litly",
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    socialProviders,
    // Apple posts the sign-in result back from appleid.apple.com.
    trustedOrigins: ["https://appleid.apple.com"],
    session: { expiresIn: 60 * 60 * 24 * 30 },
  });
}
