#!/usr/bin/env bash
# Runs on the server. Writes /srv/zenthos/langfuse/.env once, readable by its owner only, with fresh random secrets.
# Prints variable names, never values. An existing file is kept: rotating a secret is a deliberate edit, not a rerun.
set -euo pipefail
domain="${1:?usage: bootstrap-secrets.sh <domain, e.g. 46-224-120-62.sslip.io>}"
file=/srv/zenthos/langfuse/.env
umask 077
if [ -f "$file" ]; then
  echo "$file exists; secrets kept"
  exit 0
fi
hex() { openssl rand -hex "$1"; }
cat > "$file" <<ENV
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
echo "wrote $file: $(cut -d= -f1 "$file" | paste -sd' ' -)"
