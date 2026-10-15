# ADR 007: Users connect providers from the UI; the GitHub App is created once per deployment

Date: 2026-10-14. Status: accepted. Extends ADR 006.

## Three different things the GitHub App form mixes together

| Concern | Who does it | How | Token kind |
| --- | --- | --- | --- |
| ZenthOs's identity on GitHub | The deployment owner, once | A GitHub App. Its private key is the deployment's one secret, in Secret Manager | App JWT, used only to resolve installations |
| A user connecting repositories | Each user, from Settings → Providers | **Connect GitHub** sends them to `github.com/apps/<app>/installations/new`; GitHub redirects to the Setup URL with an installation id; ZenthOs stores it as a provider connection | Installation token, minted per repository, acts as `<app>[bot]`. Everything the pipeline does |
| A user signing in to the dashboard | Each user | **Sign in with GitHub** through the same app's user authorization | User token, acts as that person. Identity and audit only, never the bot's work |

Nobody but the deployment owner ever sees an App ID or a private key.

## Decisions

1. **The pipeline acts only on installation tokens.** A user token is never used to push, comment or open a
   pull request. Approvals made in the dashboard record the user; the resulting GitHub actions still come
   from the bot.
2. **Connections are created by redirect flows, not by pasting.** GitHub: the installation flow above.
   GitLab: its OAuth application and group or project access. Providers with no such flow (YouTrack today)
   take a pasted token with a health check, encrypted at rest (ADR 006).
3. **Self-hosters bootstrap the app with GitHub's App Manifest flow.** The first-run wizard posts a manifest
   (name, permissions, webhook URL, Setup URL), GitHub shows a one-click create page and redirects back with
   a code that ZenthOs exchanges for the app id, private key and webhook secret, then stores them. No PEM is
   ever copied by hand.
4. **Events over polling once the API exists.** The app's webhook points at the REST API; label changes on
   an issue signal the Temporal workflow instead of the 60-second poll. Polling stays as the fallback.

## What this adds to the roadmap

- Phase 3 (REST API): webhook endpoint with signature check, the Setup URL callback that stores
  installations, the manifest exchange endpoint, `provider_connections` rows of kind `github-app`
  (bootstrap) and `github-installation` (per connection).
- Phase 5 (dashboard): Settings → Providers with Connect GitHub, Connect GitLab and token providers;
  Sign in with GitHub; the first-run manifest wizard.

## Until then

The app is created by hand once (steps in `docs/authentication.md`) and its id and key go in `.env`. Three
settings get revisited when the API lands: webhook on and pointed at the API, Setup URL set, and "Any
account" if other accounts should install it. Nothing set now is wasted.
