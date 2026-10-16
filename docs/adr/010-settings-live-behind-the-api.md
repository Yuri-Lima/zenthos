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
  from Secret Manager. Rotating it means re-sealing every row, a small script when it is needed.
- Manifest state is kept in the API process for ten minutes; a restart mid-flow means starting over, which
  is acceptable for a flow a person runs once.
- GitHub must reach the API for the webhook and the callbacks; on a laptop that is a tunnel, and the
  label polling in the worker remains the fallback when there is none.
