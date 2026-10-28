#!/usr/bin/env bash
# Deploys the edge (Traefik), LangFuse and ZenthOs to the Hetzner host. Run from the repository root:
#   infra/hetzner/deploy.sh zenthos-platform-1 46-224-120-62.sslip.io
# Copies this folder to /srv/zenthos (server-side .env files are never overwritten or deleted), writes the secrets on
# the first run, brings the three stacks up, and pulls the ZenthOs images CI published for `main` (ZENTHOS_IMAGE_TAG
# picks another tag, e.g. sha-1234567). Secrets stay on the server; nothing here prints them.
# SSH_OPTS passes extra ssh options, e.g. SSH_OPTS='-o IdentityAgent=none' when the agent cannot sign unattended.
set -euo pipefail
host="${1:?usage: deploy.sh <ssh host> <domain>}"
domain="${2:?usage: deploy.sh <ssh host> <domain>}"
here="$(cd "$(dirname "$0")" && pwd)"
ssh_opts="${SSH_OPTS:-}"
tag="${ZENTHOS_IMAGE_TAG:-main}"
rsync -a --delete --exclude '.env' -e "ssh $ssh_opts" "$here/" "$host:/srv/zenthos/"
# shellcheck disable=SC2086
ssh $ssh_opts "$host" "set -e
  chmod +x /srv/zenthos/bootstrap-secrets.sh
  /srv/zenthos/bootstrap-secrets.sh '$domain'
  docker compose -f /srv/zenthos/traefik/compose.yaml up -d --wait
  docker compose -f /srv/zenthos/langfuse/compose.yaml up -d --wait
  export ZENTHOS_IMAGE_TAG='$tag'
  docker compose -f /srv/zenthos/zenthos/compose.yaml pull --quiet
  docker compose -f /srv/zenthos/zenthos/compose.yaml up -d --wait
  docker image prune -f >/dev/null
  echo 'zenthos: https://zenthos.$domain  (setup token: ZENTHOS_SETUP_TOKEN in /srv/zenthos/zenthos/.env on the server)'"
