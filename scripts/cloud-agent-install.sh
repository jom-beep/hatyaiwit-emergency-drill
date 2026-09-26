#!/usr/bin/env bash
set -euo pipefail

# Cloud Agent install: idempotent bootstrap for the Cloudflare Worker dev setup.
# Runs after the repository is checked out. Safe to run repeatedly.

cd "$(dirname "$0")/.."

echo "==> Installing dependencies (npm ci)"
npm ci

# Local development uses `wrangler dev`, which reads secrets from .dev.vars.
# Real Google OAuth / VAPID credentials are only required for the production
# login and Web Push flows, not for `wrangler dev`, the test suite, or the
# no-login /demo mode. Generate throwaway, local-only values here so the dev
# server starts cleanly without any externally provided secrets. .dev.vars is
# gitignored and never committed.
if [ ! -f .dev.vars ]; then
  echo "==> Generating local .dev.vars (throwaway dev-only secrets)"
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  IDENTITY_HMAC_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  VAPID_JSON="$(npx --no-install web-push generate-vapid-keys --json)"
  VAPID_PUBLIC_KEY="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).publicKey)" "$VAPID_JSON")"
  VAPID_PRIVATE_KEY="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).privateKey)" "$VAPID_JSON")"
  cat > .dev.vars <<EOF
GOOGLE_CLIENT_ID="local-dev-google-client-id"
GOOGLE_CLIENT_SECRET="local-dev-google-client-secret"
SESSION_SECRET="${SESSION_SECRET}"
IDENTITY_HMAC_SECRET="${IDENTITY_HMAC_SECRET}"
BOOTSTRAP_CODE="local-dev-bootstrap-code"
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY}"
VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY}"
VAPID_SUBJECT="mailto:safety-admin@example.com"
TEACHER_CODE="local-dev-teacher-code"
EOF
else
  echo "==> .dev.vars already present; leaving it untouched"
fi

echo "==> Applying D1 migrations to the local database"
npx wrangler d1 migrations apply hatyaiwit-emergency-drill --local

echo "==> Install complete"
