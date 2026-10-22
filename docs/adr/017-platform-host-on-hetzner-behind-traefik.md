# ADR 017: A platform host on Hetzner, with Traefik at the edge

Status: accepted, 2026-10-22

## Context

The evals gate in CI (ADR 016) needs a LangFuse that GitHub's runners can reach, and the label-driven start needs a
public URL for the GitHub App's webhook. A laptop is neither. Cloud Run stays the target for the API, the worker and
the dashboard in phase 6; LangFuse is a stateful stack (Postgres, ClickHouse, Redis, an object store) that does not
fit there.

## Decision

- **One Hetzner Cloud server** (CPX32, Ubuntu 26.04, Nuremberg, labels `project=zenthos env=staging role=platform`),
  prepared by `infra/hetzner/cloud-init.yaml`: Docker from Ubuntu's archive, a `deploy` user with key-only SSH, ufw
  for 22, 80 and 443, swap, fail2ban, automatic security updates. Rescaled with "CPU and RAM only" if memory runs
  short; LangFuse recommends 16 GiB and this starts at 8.
- **Traefik is the edge** (`infra/hetzner/traefik`): the only container that publishes ports; HTTPS from Let's
  Encrypt; a service opts in with labels on the `edge` network, so a new endpoint is declared next to the service
  that serves it. Traefik reads the Docker API through a read-only socket proxy, never the socket itself.
- **LangFuse v4** (`infra/hetzner/langfuse`) runs behind it at `https://langfuse.<domain>` with sign-up closed and
  one admin, org and project created at boot. Its object store is internal: ZenthOs traces text, not media.
- **Secrets are generated on the server** by `bootstrap-secrets.sh` into `/srv/zenthos/langfuse/.env` (mode 600),
  once; the script prints names, never values. `deploy.sh` copies the folder and never overwrites a server `.env`.
- **The domain is one variable.** It starts as `46-224-120-62.sslip.io`; sslip.io is not a public suffix, so its
  Let's Encrypt limits are shared with everyone using it. A real domain replaces it by rerunning the deploy with
  the new name after editing `ZENTHOS_DOMAIN` in the server's `.env`.

## Consequences

- The Docker Compose setup has no high availability and no backup of its own (LangFuse's own guide says so).
  Hetzner Backups cover the server disk; a lost server loses traces since the last backup, which a staging trace
  store can afford.
- Docker-published ports bypass ufw; that is why only Traefik publishes, and why the Hetzner Cloud Firewall
  (by label `project=zenthos`) is the outer wall.
- The same host can take the API's public webhook endpoint and Temporal later, each as a Traefik-labelled service.
