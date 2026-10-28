#!/usr/bin/env bash
# Runs on the server. Writes each stack's .env once, readable by its owner only, with fresh random secrets:
# /srv/zenthos/langfuse/.env, then /srv/zenthos/zenthos/.env (which reuses LangFuse's project keys so the API and
# the worker trace into the same project). Prints variable names, never values. An existing file is kept: rotating
# a secret is a deliberate edit, not a rerun.
set -euo pipefail
domain="${1:?usage: bootstrap-secrets.sh <domain, e.g. 46-224-120-62.sslip.io>}"
umask 077
hex() { openssl rand -hex "$1"; }
written() { echo "wrote $1: $(cut -d= -f1 "$1" | paste -sd' ' -)"; }

langfuse=/srv/zenthos/langfuse/.env
if [ -f "$langfuse" ]; then
  echo "$langfuse exists; secrets kept"
else
  cat > "$langfuse" <<ENV
ZENTHOS_DOMAIN=$domain
POSTGRES_PASSWORD=$(hex 24)
CLICKHOUSE_PASSWORD=$(hex 24)
REDIS_PASSWORD=$(hex 24)
OBJECTSTORE_PASSWORD=$(hex 24)
LANGFUSE_SALT=$(hex 24)
LANGFUSE_ENCRYPTION_KEY=$(hex 32)
LANGFUSE_NEXTAUTH_SECRET=$(hex 32)
LANGFUSE_PUBLIC_KEY=pk-lf-$(hex 16)
LANGFUSE_SECRET_KEY=sk-lf-$(hex 24)
LANGFUSE_ADMIN_EMAIL=admin@zenthos.local
LANGFUSE_ADMIN_PASSWORD=$(hex 16)
ENV
  written "$langfuse"
fi

zenthos=/srv/zenthos/zenthos/.env
if [ -f "$zenthos" ]; then
  echo "$zenthos exists; secrets kept"
else
  cat > "$zenthos" <<ENV
ZENTHOS_DOMAIN=$domain
POSTGRES_PASSWORD=$(hex 24)
ZENTHOS_SECRETS_KEY=$(hex 32)
ZENTHOS_SETUP_TOKEN=$(hex 16)
$(grep -E '^LANGFUSE_(PUBLIC|SECRET)_KEY=' "$langfuse")
ENV
  written "$zenthos"
fi
