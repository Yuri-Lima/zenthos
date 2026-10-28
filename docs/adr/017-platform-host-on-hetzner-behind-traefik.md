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

## Amendment, 28 October 2026: ZenthOs runs on the host too

The API, the worker and the dashboard run on the same host as a third Compose stack (`infra/hetzner/zenthos`),
with their own Postgres and Temporal; Cloud Run is no longer planned. The hosted service (ADR 019) is one
deployment, and a Compose stack beside LangFuse is the smallest one that works.

- **One origin.** `https://zenthos.<domain>` serves the dashboard; Traefik sends `/api/*` to the API with the prefix
  stripped. The production dashboard calls `/api` (`environment.production.ts`), so there is no CORS and the session
  cookie is first-party. `ZENTHOS_API_BASE_URL` carries the prefix, so the GitHub callbacks and the webhook land on
  it; `ZENTHOS_AUTH` is `github` in the stack itself, never a variable.
- **Images from CI.** `Dockerfile` builds three targets from one install; `.github/workflows/images.yml` publishes
  them to GHCR on every push to `main` as `main` and `sha-<commit>`. The API and the worker run from the TypeScript
  sources as `pnpm api` and `pnpm worker` do, because the Temporal workflow bundle resolves the libraries' sources
  the same way. `deploy.sh` rsyncs the folder, writes the secrets once (`bootstrap-secrets.sh`, which reuses
  LangFuse's project keys), pulls the images and brings the three stacks up; `ZENTHOS_IMAGE_TAG` pins a commit.
- **The worker's toolchain is part of its image:** git, node and bun today, for Legal Connect's gate commands. Until
  slice 4 of ADR 019 each run shares the worker container, so the host serves trusted teams only.
- **Operators reach Temporal's UI** through `ssh -L 8080:127.0.0.1:8080`; it is bound to the loopback and never
  routed. The setup token for the platform GitHub App is in `/srv/zenthos/zenthos/.env` on the server.
- Memory: the host had 4.9 GiB free before this stack; LangFuse's own recommendation is 16 GiB. Rescale when the
  worker's runs push it to swap.

