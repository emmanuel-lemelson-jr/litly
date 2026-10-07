#!/usr/bin/env bash
# One-time: copy the production secrets onto the Worker (in the account set in wrangler.toml).
# Reads .dev.vars and the Apple .p8 key from the project folder. Values are never printed.
#   SALT=<old production salt> ./scripts/set-secrets.sh   (keeps IP hashes/bans/hearts as they were)
#   ./scripts/set-secrets.sh                              (generates a new SALT; old bans and "your hearts" reset)
set -euo pipefail
cd "$(dirname "$0")/.."

put() { printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null && echo "set $1"; }

while IFS='=' read -r key value || [[ -n "$key" ]]; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  value="${value%\"}"; value="${value#\"}"
  put "$key" "$value"
done < .dev.vars

for f in AuthKey_*.p8; do
  [[ -f "$f" ]] && put APPLE_PRIVATE_KEY "$(cat "$f")" && break
done

if [[ -n "${SALT:-}" ]]; then put SALT "$SALT"; else put SALT "$(openssl rand -hex 32)"; echo "(generated a new SALT)"; fi
echo "Done."
