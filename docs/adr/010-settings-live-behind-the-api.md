# ADR 010: Provider connections and repository profiles live behind the API

Status: accepted, 2026-10-15

## Context

ADR 006 decided that providers and their credentials are configuration the product owns, and ADR 007 that
people connect a provider through a redirect flow rather than by pasting ids and keys. Until now both lived
in the worker's environment and in `apps/worker/src/repos.ts`.

## Decision

- **Two stores, two ports.** `ProviderConnectionsPort` and `RepoProfilesPort` are the only way the core
  reads them. The Postgres adapter keeps connections in two halves: a public jsonb (installations, app slug)
  and a sealed bytea (credentials, app secrets) encrypted with AES-256-GCM under one deployment key,
  `ZENTHOS_SECRETS_KEY`. The in-memory adapter seeds profiles from `repos.ts` for dry runs. The schema is a
  short ordered list of SQL statements applied once each; no migration tool.
- **The API is NestJS over Express with OpenAPI at `/docs` (ADR 003).** Request bodies are zod schemas; the
  same schema validates and documents. Controllers are thin: they call the use cases in `libs/application`
  through one injected ports object. It runs on `swc-node`, which emits the decorator metadata NestJS needs
  and `tsx` cannot.
- **GitHub connects by the manifest flow.** `GET /providers/github/manifest` sends the browser to GitHub
  with the app manifest and a one-time state; GitHub returns a code that `manifest/callback` exchanges for
  the app's credentials through the `GitHubAppsPort`; the app's setup URL then lands on `install/callback`
  with the installation, which is read from GitHub and recorded. The connection id is chosen before the
  flow starts so the setup URL can name it.
- **The webhook replaces polling where it is configured.** `POST /webhooks/github` finds the connection by
  the app id GitHub sends, verifies the signature against that connection's secret and the raw bytes, maps
  the event to a command in the domain (`commandFromGitHubEvent`), and applies it: `zenthos:run` starts a
  run, the approval labels signal it, installation events update the connection. Repositories without a
  profile are ignored.
- **Runs are driven through a port too.** `RunControlPort` (start, decide, state) has a Temporal adapter the
  API and the CLI share, and an in-memory twin for tests; the adapter owns the workflow bundler config.
- **The worker reads profiles and connections from the store** when `DATABASE_URL` is set, and from
  `repos.ts` otherwise. Credentials are decided per repository: the connection the profile names, else the
  worker's environment as the fallback for a laptop with one app in `.env`; with neither, the run stops
  before touching GitHub (`no_credentials`). One Octokit setup is kept per distinct credentials.

## Consequences

- One long-lived secret remains: the deployment key. On a laptop it sits in `.env`; on Cloud Run it comes
  from Secret Manager. `pnpm nx run @zenthos/worker:rotate-key` re-seals every row under a new key in one
  transaction; then the API and the worker restart with the new value.
- The API's controllers import two pure GitHub helpers, the manifest builder and the webhook signature check,
  straight from the GitHub adapter package rather than through a port. They are driving-side code using a
  framework-free helper, not a core dependency on an adapter; accepted, revisit if a second provider needs them.
- Manifest state is kept in the API process for ten minutes; a restart mid-flow means starting over, which
  is acceptable for a flow a person runs once.
- GitHub must reach the API for the webhook and the callbacks; on a laptop that is a tunnel, and the
  label polling in the worker remains the fallback when there is none.

## Amendment, 2026-10-18: the settings pages

- **Credentials are checked before they are stored.** A pasted token or a hand-made app's key goes through
  one authenticated read (`GitHubAppsPort.whoAmI`); a refusal is `invalid_credentials` and nothing is saved.
  The same read is the health check the settings page runs on demand (`POST /providers/:id/check`).
- **The health check also refreshes an app's installations** from GitHub (`listInstallations`) and stores
  them. The install redirect and the webhook remain the primary path; on a laptop without a public URL they
  never arrive, and the stored list was empty while the app was in fact installed. The check catches up.
- **Coverage is a domain rule** (`coversRepository`): an app covers a repository only where it is installed;
  a token's reach is unknown without asking GitHub. The settings page warns on a profile whose app does not
  cover it; the worker still decides for real at run time.
- **The first-run steps are derived, not stored**: a connection exists, it may act somewhere, a repository
  profile exists. Each turns green as soon as it is true; nothing tracks "wizard completed".
- **GitHub's redirects land on the dashboard**: after a manifest without an app page, and after an install,
  the API sends the browser to `ZENTHOS_DASHBOARD_ORIGIN/settings?connected=<id>`.
- **Gate commands are picked from the allowed commands** in the form, so the domain's subset rule cannot be
  broken from the UI; the API still enforces it for every other caller.
