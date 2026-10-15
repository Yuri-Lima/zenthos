# ADR 006: Providers are configuration, and a GitHub App is the default GitHub identity

Date: 2026-10-14. Status: accepted.

## Decisions

1. **ZenthOs acts as a GitHub App, not as a person.** Repository owners install the app where they want it.
   The worker holds the app id and private key, resolves the installation that covers each repository, and
   lets Octokit mint short-lived installation tokens, including a fresh one before every clone and push.
   Comments and pull requests appear as `<app>[bot]`. A personal token remains as an interim for one
   account and is ignored when the app is configured.
2. **Provider connections are data the product owns**, not code and not only environment variables.
   Target: a `provider_connections` table (type, display name, non-secret config, encrypted secret) and a
   `repo_profiles` table with the same fields `RepoProfile` has today, both managed through the REST API
   (phase 3) and a **Settings → Providers** page in the dashboard (phase 5). Secrets are encrypted at rest
   with a key the worker gets from the environment or a secret manager, and are never returned by the API.
3. **Today's seam.** The domain already has the credential type (`GitHubCredentials`) and the worker builds
   it from the environment in one function (`githubCredentials`). Repository profiles live in
   `apps/worker/src/repos.ts`. Moving both to the database changes those two sources only; the adapters
   and use cases take the same objects either way.

## Why

- Attribution and audit: the role this project targets asks for measurable, attributable agent work. A bot
  identity makes "merged with no human code changes" a clean number.
- Scope and revocation per repository, decided by the repository's owner, not by whoever holds a token.
- Several providers at once (GitHub App per organisation, GitLab for Phoenix, YouTrack, model vendors)
  cannot be expressed as one environment variable each. A table with one row per connection can.

## Consequences

- Phase 3 gains the two tables, the API endpoints and a migration tool; phase 5 the settings page.
- The app's private key is still a long-lived secret: `.env` on a laptop, Secret Manager on Cloud Run.
- The GitLab (phase 4) and YouTrack adapters are written against the same connection shape from the start.
