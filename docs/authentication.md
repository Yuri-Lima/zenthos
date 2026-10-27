# Authentication to the Claude API

Each workspace brings its own Anthropic API key (ADR 019): an owner or admin enters it in Settings > Model
provider, the API checks it with Anthropic with a zero-token call, stores it sealed with `ZENTHOS_SECRETS_KEY`,
and shows only its last four characters from then on. Every agent of that workspace's runs uses it: the spec
writer and the reviewer as their client's key, Claude Code as `ANTHROPIC_API_KEY` in its own environment. The
invoice is the workspace's Console usage. Create the key under a Console workspace with a spend limit.

The repository and `.env` never hold a key. The deployment's own credentials exist only for runs that have no
workspace key: CI evals, dry runs, the manual commands. There the Anthropic SDK resolves them in its order:
`ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` from the environment, then an explicit `ANTHROPIC_PROFILE`, then the
federation variables, then the active profile on disk. A workspace without a key whose deployment has nothing
either fails its run as `model_key_missing`.

| Where the worker runs | Credential for runs without a workspace key | Why |
| --- | --- | --- |
| Your laptop | `ant auth login` profile for the spec writer and the reviewer | Interactive OAuth; nothing to copy into `.env`. Claude Code does not read the profile, so a coding-agent run on a laptop needs the workspace key. Never a claude.ai subscription, not even for your own development (ADR 018) |
| GitHub Actions (evals) | Workload Identity Federation, GitHub issuer | The job's OIDC token is exchanged for a short-lived token; no secret in the repo |
| Cloud Run, or any deployment someone else uses | Workload Identity Federation, Google issuer, for every agent | The service's identity token from the metadata server. Claude Code's config directory stays empty there |

A leftover `ANTHROPIC_API_KEY`, even an empty one, shadows the other deployment paths. Unset it rather than
blanking it. Access is checked when a workspace's agents are first built, with a zero-token model lookup, so a
wrong setup fails the first activity with the cause, not mid-run.

**What the cost numbers mean.** The run's `estimatedCostUsd` is the sum of every agent call's estimate at
list price: the coding agent's own figure (the Agent SDK documents its `total_cost_usd` as "estimates, not
billing") plus the spec writer's and the reviewer's tokens priced from the table in `libs/agents/src/lib/pricing.ts`. The
invoice is the Console organisation's usage page, not this field. The run also keeps the token counts the models reported, which is what a bill is
based on. LangFuse prices the spec-writer calls itself from its built-in model table.

## Laptop: `ant auth login`

```bash
brew install anthropics/tap/ant
xattr -d com.apple.quarantine "$(brew --prefix)/bin/ant"
ant auth login          # browser flow; pick the org and workspace
ant auth status         # must say the profile won, not an API key
```

Then `SPEC_WRITER=anthropic pnpm worker` works with no key in `.env`. The profile token is bound to one
workspace; to target a specific one, run `ant auth login --profile zenthos --workspace-id wrkspc_...` and set
`ANTHROPIC_PROFILE=zenthos`.

## The coding agent's credential

Claude Code picks its own credential, and on most developer machines that would be a personal claude.ai login.
Anthropic does not allow a product built on the Agent SDK to run on one, so ZenthOs never lets it (ADR 018):
Claude Code always runs with ZenthOs's own config directory, `CODING_AGENT_CONFIG_DIR` (default
`~/.zenthos/claude-code`), where your personal login does not exist and which stays empty, and with the
workspace's key as `ANTHROPIC_API_KEY`, which outranks everything else in Claude Code's order. The worker asks
Claude Code for its account when it builds a workspace's agents and refuses a claude.ai subscription or no
credential at all; every run asks again before its prompt is sent.

An `ant auth login` profile does not reach Claude Code on its own: Claude Code 2.1.296 and 2.1.309 ignored one
named in `ANTHROPIC_PROFILE` (ADR 018). On a laptop, the coding agent therefore runs on the workspace key only.

## GitHub Actions: Workload Identity Federation

Do this once in the Claude Console under **Settings → Workload identity**. The **Connect workload** wizard
with the **GitHub Actions** tile creates all three resources in one flow and then waits 15 minutes for a
test exchange. The values below are what to enter, and what the **Register issuer** dialog expects if you go
field by field.

**1. Issuer**

| Field | Value |
| --- | --- |
| Name | `github-actions` |
| Issuer URL | `https://token.actions.githubusercontent.com` |
| JWKS source | OIDC discovery |
| Discovery base URL | leave blank |
| CA certificate | leave blank |
| Enforce single-use tokens | on; the job mints a fresh token every run |
| Maximum token lifetime | 1 hour |

**2. Service account.** Name it `zenthos-ci`. It is a member of the default workspace already; add it to
the workspace ZenthOs should trace and bill into if that is a different one.

**3. Rule.** Match only this repository. One rule per trust boundary.

| Field | Value |
| --- | --- |
| Name | `zenthos-gha-main` |
| Issuer | `github-actions` |
| Subject prefix | `repo:<owner>/zenthos:ref:refs/heads/main` (or `repo:<owner>/zenthos:*` plus a `ref` claim to cover pull requests) |
| Audience | `https://api.anthropic.com` |
| Claims | `repository_owner` = `<owner>` |
| Target | service account `zenthos-ci` |
| Scope | `workspace:developer` |
| Token lifetime | 600 seconds |

Note the ids the wizard prints: `fdrl_...` (rule), `svac_...` (service account), your organization UUID
from **Settings → Organization**, and `wrkspc_...` when the rule spans more than one workspace.

**4. Workflow.** The job requests an OIDC token for the Anthropic audience and points the SDK at the file.
Put the ids in repository variables, not secrets; none of them is secret.

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  evals:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_FEDERATION_RULE_ID: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
      ANTHROPIC_ORGANIZATION_ID: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
      ANTHROPIC_SERVICE_ACCOUNT_ID: ${{ vars.ANTHROPIC_SERVICE_ACCOUNT_ID }}
      ANTHROPIC_WORKSPACE_ID: ${{ vars.ANTHROPIC_WORKSPACE_ID }}
    steps:
      - uses: actions/checkout@v7
      # `runner.temp` is not available in job-level env; the step exports the path for the steps after it.
      - name: Fetch GitHub OIDC token
        run: |
          token_file="$RUNNER_TEMP/anthropic-jwt"
          curl -sS -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://api.anthropic.com" \
            | jq -r .value > "$token_file"
          echo "ANTHROPIC_IDENTITY_TOKEN_FILE=$token_file" >> "$GITHUB_ENV"
      - run: SPEC_WRITER=anthropic pnpm nx run @zenthos/worker:eval -- spec owner/repo --limit 10   # CI runs the same experiment through langfuse/experiment-action (.github/workflows/evals.yml)
```

Trigger the workflow once inside the wizard's 15-minute window and the rule's page shows the exchange. Failed
exchanges appear under **Authentication events** with a reason: `jti_reused` (a token presented twice), a
claim mismatch against the rule, or `workspace_id_required`.

## GitHub: the platform app

ZenthOs talks to GitHub as one GitHub App per deployment, the platform app (ADR 019): comments and pull requests
come from `<app>[bot]`, each team installs it on its own accounts and organisations from Settings, and the API acts
on a repository only through an installation the team's workspace has claimed. The operator creates the app once.

**1. Set it up.** Start the API; while no platform app exists it prints a line with the setup token (or set
`ZENTHOS_SETUP_TOKEN` yourself). Open `<dashboard>/setup`, enter the token, an app name and optionally the
organisation to own it, and continue: GitHub shows the manifest, you confirm, and the app becomes the platform app.
The manifest asks for Contents, Issues and Pull requests write, Metadata read and, at organisation level, Members
read, which lets the API check that whoever claims an installation belongs to the organisation. The webhook and the
callbacks hang off `ZENTHOS_API_BASE_URL`, so it must be a URL GitHub can reach (a tunnel on a laptop). An app
created by hand on GitHub becomes the platform app through `POST /platform/github/app` with the same token.

**2. Install it.** Sign in, create a workspace, and press *Install on GitHub* in Settings. GitHub asks which
account or organisation and which repositories; back in Settings the installation is claimed for the workspace. A
member can claim an installation on their own account, or on an organisation they belong to; one installation
belongs to one workspace, and *Release* lets it go without uninstalling on GitHub.

**3. Add repositories.** *Add repository* offers the repositories the workspace's installations cover; picking one
fills the default branch and clone URL from GitHub.

**Upgrading an app created before slice 2.** Migration 005 promotes a deployment's one existing app to platform
app and binds its installations to the dry-run workspace. On GitHub, edit that app once: make it public, set the
setup URL to `<ZENTHOS_API_BASE_URL>/github/install/callback`, and add the organisation permission Members read
(installers are asked to accept it).

The private key is the one long-lived secret in this design; it is sealed at rest with `ZENTHOS_SECRETS_KEY`.
`GITHUB_TOKEN` (scoped to the named repositories, with Contents, Issues and Pull requests write) remains only as the
worker's environment fallback for a dry run without a store, and is ignored where a bound installation covers the
repository.

Prove the connection before the first real run, on an issue you own. It posts one comment there, pushes one
marker commit to a throwaway branch, checks that GitHub attributes that commit to the bot, and deletes the branch:

```bash
pnpm nx run @zenthos/worker:contract -- owner/repo#123
```

## Dashboard: Sign in with GitHub

People sign in to the dashboard through the platform app's user authorization (ADR 007). Anyone GitHub vouches
for gets in; the workspaces they belong to decide what they see, and owners invite others by GitHub login (ADR 019).
The API needs the app's OAuth client id and secret: the manifest flow stores them; for an app created by hand, copy
them from the app's settings page on GitHub (generate a client secret there) and pass them to
`POST /platform/github/app` with the setup token.

The app's **Callback URL** must be `<ZENTHOS_API_BASE_URL>/auth/github/callback` (the manifest sets it). Then:

```bash
ZENTHOS_AUTH=github pnpm api
```

`GET /auth/github` starts the flow, the session lives in an httpOnly cookie whose hash is stored, `GET /auth/me`
says who is signed in, `POST /auth/logout` ends it. With `ZENTHOS_AUTH=off` (the default, for local dry runs)
every request is anonymous and the API says so at start; never expose it that way.

## Cloud Run (phase 6)

Same mechanism with the Google issuer (`https://accounts.google.com`), the service's identity token from the
metadata server, and a rule matching the service account's `email` claim. Set up when the deploy exists.

## Source

Anthropic docs: Authentication, Workload Identity Federation, the GitHub Actions provider guide and the WIF
reference, read on 2026-10-13.
