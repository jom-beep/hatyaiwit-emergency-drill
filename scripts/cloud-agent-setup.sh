#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Hatyaiwit Emergency Drill Worker.
# Installs dependencies, ensures local-only dev secrets exist, and prepares the
# local D1 (miniflare) database so `wrangler dev` runs against a real schema.
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci

# Local development secrets for `wrangler dev` only. These are generated with a
# CSPRNG on first run and are never used in production. Google OAuth still needs
# real GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET values to complete a browser login.
if [ ! -f .dev.vars ]; then
  echo "Generating .dev.vars with fresh local development secrets..."
  node - <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const webpush = require("web-push");
const rand = (n) => crypto.randomBytes(n).toString("base64url");
const vapid = webpush.generateVAPIDKeys();
const lines = [
  'GOOGLE_CLIENT_ID="dev-client.apps.googleusercontent.com"',
  'GOOGLE_CLIENT_SECRET="dev-google-client-secret"',
  `SESSION_SECRET="${rand(32)}"`,
  `IDENTITY_HMAC_SECRET="${rand(32)}"`,
  `BOOTSTRAP_CODE="${rand(24)}"`,
  `VAPID_PUBLIC_KEY="${vapid.publicKey}"`,
  `VAPID_PRIVATE_KEY="${vapid.privateKey}"`,
  'VAPID_SUBJECT="mailto:safety-admin@hatyaiwit.ac.th"',
  `TEACHER_CODE="${rand(16)}"`,
  "",
];
fs.writeFileSync(".dev.vars", lines.join("\n"));
NODE
fi

# Apply all D1 migrations to the local miniflare database (idempotent).
npx wrangler d1 migrations apply hatyaiwit-emergency-drill --local

echo "Cloud Agent setup complete."
