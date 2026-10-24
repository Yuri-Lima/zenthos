# Authentication to the Claude API

ZenthOs never stores an Anthropic API key. The SDK resolves credentials in this order: `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN`, then an explicit `ANTHROPIC_PROFILE`, then the federation variables, then the active
profile on disk. The worker verifies access at boot with a zero-token model lookup, so a wrong setup fails
before the first ticket.

| Where the worker runs | Credential | Why |
| --- | --- | --- |
| Your laptop | `ant auth login` profile for the spec writer and the reviewer; a Claude Console sign-in in ZenthOs's own Claude Code config directory for the coding agent | Interactive OAuth; nothing to copy into `.env`. A laptop has no OIDC issuer to federate from. Never a claude.ai subscription, not even for your own development (ADR 018) |
| GitHub Actions (evals in phase 3) | Workload Identity Federation, GitHub issuer | The job's OIDC token is exchanged for a short-lived token; no secret in the repo |
| Cloud Run (phase 5), or any deployment someone else uses | Workload Identity Federation, Google issuer, for every agent | The service's identity token from the metadata server. Claude Code's config directory stays empty there, so federation is the only credential it can find |

A leftover `ANTHROPIC_API_KEY`, even an empty one, shadows both other paths. Unset it rather than blanking it.

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

## Laptop: the coding agent's Console sign-in

Claude Code picks its own credential, and on most developer machines that would be a personal claude.ai login.
Anthropic does not allow a product built on the Agent SDK to run on one, so ZenthOs never lets it (ADR 018):
Claude Code always runs with ZenthOs's own config directory, `CODING_AGENT_CONFIG_DIR` (default
`~/.zenthos/claude-code`), where your personal login does not exist. Sign that directory in once with a Claude
Console account, which bills the organisation's API usage:

```bash
pnpm nx run @zenthos/worker:coding-agent-login
```

It runs `claude auth login --console` (the `claude` CLI must be installed for this step) and then checks the
account the way the worker does at boot. Claude Code offers two ways to sign in; pick **Create an API key**. Claude
Code creates a Console key for a workspace you choose and keeps it in that directory's credential store (the macOS
Keychain entry for that directory), not in `.env` and not in the repository; give the workspace a spend limit in the
Console. The other choice, **Sign in with your Console account**, writes your active Anthropic profile (the one
`ant auth login` uses for the spec writer) and signs out claude.ai logins stored on the machine, which would sign
your own Claude Code out too. The worker refuses to start when Claude Code reports a claude.ai subscription or no
credential at all, and every run asks again before its prompt is sent.

An `ant auth login` profile does not reach Claude Code on its own: Claude Code 2.1.296 and 2.1.309 ignored one
named in `ANTHROPIC_PROFILE` (ADR 018), which is why the coding agent has its own sign-in step.

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

## GitHub: the ZenthOs app

ZenthOs talks to GitHub as a GitHub App, so comments and pull requests come from `<app>[bot]` and each
repository owner decides where it is installed (ADR 006). The API creates the app for you through GitHub's
manifest flow and stores it as a provider connection (ADR 007, ADR 010): start `pnpm api` with
`DATABASE_URL`, `ZENTHOS_SECRETS_KEY`, `GITHUB_APPS=octokit` and `ZENTHOS_API_BASE_URL` set to a URL GitHub
can reach (a tunnel on a laptop), open `/providers/github/manifest?name=zenthos-dev` in a browser, create the
app on GitHub, and install it; the webhook, the callbacks and the permissions are all in the manifest.

To create it by hand instead, for a worker that takes credentials from `.env`:

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**. Name it `zenthos` (or
   `zenthos-dev` for your own tests). Homepage URL can be the repository. Uncheck **Webhook → Active** for now.
2. Repository permissions: **Contents** read and write, **Issues** read and write, **Pull requests** read and
   write, **Metadata** read. No organisation or account permissions.
3. **Where can this app be installed**: only on this account, unless others will install it.
4. After creating it, note the **App ID** and generate a **private key** (a `.pem` download).
5. **Install App** on the repositories ZenthOs may work on, for example `mara-sandra-connect`.

Then either store it as a connection through the API, which the worker resolves per repository profile:

```bash
curl -X POST localhost:3200/providers/github/app -H 'content-type: application/json' \
  -d "{\"name\":\"zenthos-dev\",\"appId\":\"123456\",\"privateKey\":$(jq -Rs . < zenthos.private-key.pem)}"
```

or, for a worker without the store, in `.env` as the fallback credentials:

```bash
ISSUE_TRACKER=github
SCM=github
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_FILE=/absolute/path/zenthos.private-key.pem
```

The worker resolves the installation per repository at first use and mints tokens as needed; nothing else
to configure per repo. Commits are authored as the app's bot user, `<slug>[bot]`, with the no-reply address
GitHub assigns to it, so the commit, the comment and the pull request all show the same bot. Never set a
hand-written no-reply address: GitHub maps it to whichever account owns that name. Keep the `.pem` out of the repository; on Cloud Run it comes from Secret Manager.
The private key is the one long-lived secret in this design.

A fine-grained personal token (`GITHUB_TOKEN`, scoped to the named repositories, with Contents, Issues and
Pull requests write) still works as an interim and is ignored once the app is configured.

Prove the connection before the first real run, on an issue you own. It posts one comment there, pushes one
marker commit to a throwaway branch, checks that GitHub attributes that commit to the bot, and deletes the branch:

```bash
pnpm nx run @zenthos/worker:contract -- owner/repo#123
```

## Dashboard: Sign in with GitHub

People sign in to the dashboard through the connected GitHub App's user authorization (ADR 007). Anyone GitHub
vouches for gets in; the workspaces they belong to decide what they see, and owners invite others by GitHub
login (ADR 019). The API needs the App's OAuth
client id and secret: the manifest flow stores them; for an app created by hand, copy them from the app's
settings page on GitHub (generate a client secret there) and connect the app again with them:

```bash
curl -X POST localhost:3200/providers/github/app -H 'content-type: application/json' \
  -d "{\"name\":\"zenthos-dev\",\"appId\":\"123456\",\"privateKey\":$(jq -Rs . < key.pem),\"clientId\":\"Iv1....\",\"clientSecret\":\"...\"}"
```

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
