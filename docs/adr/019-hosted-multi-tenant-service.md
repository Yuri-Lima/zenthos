# ADR 019: ZenthOs is a hosted service with workspaces

Status: accepted, 2026-10-24; slice 1 done the same day. Amends ADR 006, 007, 012 and 018 as each slice lands.

## Context

ZenthOs was built for one operator: the GitHub App is private to the account that created it (`public: false` in
the manifest), the dashboard admits the GitHub logins listed in `ZENTHOS_ALLOWED_LOGINS`, and every model
credential is a variable in the worker's environment. Developers at other companies cannot install the app, sign
in, or bring their own Anthropic account without someone editing a server's `.env`.

The product is one hosted ZenthOs that any team can use. Everything a customer configures happens in the dashboard;
the environment holds only what the operator of the deployment owns.

## Decision

**Workspaces own everything a customer configures.** A workspace has members, GitHub installations, repository
profiles, runs, and its model credential. Every store query is scoped by workspace id; a repository belongs to the
workspace whose installation covers it, so a run started by a webhook finds its workspace from the repository.

**Anyone can sign in with GitHub.** The allowlist goes. A person with no workspace creates one and becomes its
owner; owners invite others by GitHub login. Roles: `owner` (members, credentials, deletion), `admin` (installations,
repositories, credentials), `member` (runs and metrics). The API resolves the current workspace from the session and
checks the role on every route.

**One public ZenthOs GitHub App, owned by the operator.** Created once through the existing manifest flow with
`public: true`, so any user or organisation can install it. The operator does that on a one-time setup page that
appears while no platform app exists and asks for a setup token the API prints at boot, so no app credential is
copied into an environment file. Its OAuth client is the one "Sign in with GitHub" uses.

**Installing binds an installation to a workspace.** Settings > GitHub sends the person to
`github.com/apps/<slug>/installations/new` with a one-time, expiring state naming the workspace. GitHub returns to the
setup URL with the installation id; the API claims it for the workspace only if the installation is on the signed-in
person's own account, or on an organisation they belong to, asked with the installation's own token (the app carries
the organisation permission `members: read` for that), so nobody can claim someone else's installation and no user
token is stored. The `installation` and `installation_repositories` webhooks keep the repository list current, and a
binding survives them until the workspace releases it. One installation belongs to one workspace.

**Each workspace brings its own Anthropic credential.** Settings > Model provider takes an API key, checks it with a
zero-token model lookup, stores it encrypted with the deployment's secret box, and never shows it again (the last
four characters identify it). Owners and admins can replace or remove it. Workflow inputs never carry it: Temporal
keeps workflow history, so activities read the key from the store when they need it. The spec writer and the
reviewer build their model client per run from it, and Claude Code gets it as `ANTHROPIC_API_KEY` in its process
environment for that run only, with the empty, isolated config directory from ADR 018. That retires the
`coding-agent-login` step; the guard against a claude.ai subscription stays. Cloud providers and Workload Identity
Federation per workspace can follow in the same settings section.

**The environment keeps only operator infrastructure:** the database URL, the secrets key, the public URLs,
Temporal's address, LangFuse's keys, and the operator's own CI credentials (federation, unchanged).

## Slices

1. **Workspaces and members.** Workspace and membership in the domain and Postgres; sign-in open to anyone; create a
   workspace on first sign-in; workspace switcher; members page with invitations and roles; repositories, runs and
   connections scoped by workspace. Existing data moves into one workspace owned by the current operator.
   `ZENTHOS_ALLOWED_LOGINS` is removed.
2. **Platform GitHub App and installs.** Public manifest; one-time operator setup with a setup token; install flow
   bound to the workspace and verified against the person's installations; installation webhooks; repository
   credentials come from the platform app and the repository's installation. Per-workspace app connections and
   personal tokens leave the customer settings (tokens left on 27 Oct 2026, ahead of the rest).
3. **Model provider per workspace.** API key settings with check, replace and remove; activities read the key per
   run; Claude Code, the spec writer and the reviewer use it; the worker's Anthropic variables and the Console
   sign-in step are removed.
4. **Isolation before outside customers.** Claude Code runs a customer's repository, including the shell commands
   that repository's profile allows, on shared workers. Each run moves into its own container with no access to
   other runs' files or credentials and egress limited to the Anthropic API and GitHub. Until then, workspaces are
   for trusted teams only.
5. **Limits and per-workspace telemetry.** Cost ceilings and run quotas per workspace; LangFuse traces tagged by
   workspace, then optionally sent to a workspace's own LangFuse keys entered in the dashboard.

## Consequences

- Slice 3 (27 Oct 2026): `ModelKeysPort` keeps one key per workspace, sealed by the same secret box as the app's
  credentials (migration `006-workspace-model-keys`; `rotate-key` re-seals both tables); `ModelProviderPort`
  checks a key with a zero-token call before it is stored (`AnthropicModelProvider`, or the in-memory one for dry
  runs, `MODEL_PROVIDER`); `/model-key` serves the status, takes a key and removes it, owners and admins only; the
  dashboard's Settings has the section and a third first-run step. The worker builds the three agents per
  workspace when a run first needs them (`agentResolver`), from the key read at that moment, and again when the
  key changes; the spec writer and the reviewer get it as their client's key, Claude Code as `ANTHROPIC_API_KEY`
  in its own environment. A run of a workspace without a key uses the deployment's credentials, which is what dry
  runs and the CI evals do; without those either it fails as `model_key_missing`. `ANTHROPIC_API_KEY` left the
  worker's configuration and the `coding-agent-login` step is gone (ADR 018 amended).
- Slice 2 (27 Oct 2026): the platform app is the app connection no workspace owns (`ProviderConnectionsPort.platformApp`);
  the operator creates it once from `/setup` with the setup token the API prints at boot (`ZENTHOS_SETUP_TOKEN`
  or a random one), through a public manifest; `/github/install` and its callback claim installations for the
  workspace, `/github/installations` lists and releases them, and the repository picker reads from them; the
  worker acts as the platform app wherever a bound installation covers the repository. Per-workspace app
  connections left the API and the dashboard; migration 005 promotes a deployment's one existing app and binds its
  installations to the dry-run workspace. The app created before slice 2 must be updated on GitHub by hand: public,
  setup URL `/github/install/callback`, organisation permission members read (docs/authentication.md).
- Slice 1 (24 Oct 2026): workspaces, memberships and roles in the domain; `WorkspacesPort`; `workspace_id` on
  connections, profiles and runs with migration `004-workspaces`; the session carries the current workspace and the
  API guard resolves the person's role in it on every request (`CurrentWorkspace(action)`); sign-in is open and
  `ZENTHOS_ALLOWED_LOGINS` is gone; the dashboard gets the switcher, the create page and the members page. The
  sandbox's `Workspace` type became `Checkout`, so the word has one meaning.
- Data from before workspaces is moved by the migration into the dry-run workspace (one fixed id, no members), so an
  API still running with auth off keeps seeing it, and the first person to sign in once auth is on becomes its owner
  with everything configured so far. That is right for the one existing deployment, whose API is not public; a fresh
  deployment has no such rows, so there is nothing to claim.
- Until slice 2, Sign in with GitHub still uses whichever connection carries OAuth credentials
  (`ProviderConnectionsPort.signInApp`), and each workspace connects its own GitHub App.

- Every port that reads or writes customer data gains a workspace id, and every Postgres table a `workspace_id`
  column. The stores contract tests check that one workspace never reads another's rows.
- Customers pay Anthropic directly through their own key; the operator pays for hosting only.
- A stolen database is not enough to use a customer's key without the deployment's secrets key; a stolen secrets key
  is, so it stays in the operator's secret store and is rotated with `rotate-secrets`.
- The dashboard needs onboarding: sign in, create workspace, install the app, add a key, add a repository. Each step
  checks the previous one, so the first run cannot start half-configured.
