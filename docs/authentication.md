# Authentication to the Claude API

ZenthOs never stores an Anthropic API key. The SDK resolves credentials in this order: `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN`, then an explicit `ANTHROPIC_PROFILE`, then the federation variables, then the active
profile on disk. The worker verifies access at boot with a zero-token model lookup, so a wrong setup fails
before the first ticket.

| Where the worker runs | Credential | Why |
| --- | --- | --- |
| Your laptop | `ant auth login` profile for the spec writer; Claude Code's own claude.ai login for the coding agent | Interactive OAuth; nothing to copy into `.env`. A laptop has no OIDC issuer to federate from. Claude Code on a subscription is allowed for your own development only: Anthropic does not permit offering claude.ai login or its rate limits inside a product built on the Agent SDK |
| GitHub Actions (evals in phase 3) | Workload Identity Federation, GitHub issuer | The job's OIDC token is exchanged for a short-lived token; no secret in the repo |
| Cloud Run (phase 5), or any deployment someone else uses | Workload Identity Federation, Google issuer, for both the spec writer and the coding agent | The service's identity token from the metadata server. The coding agent must not run on anyone's claude.ai subscription there; it gets the deployment's credentials, and its cost lands on the organization's Console usage |

A leftover `ANTHROPIC_API_KEY`, even an empty one, shadows both other paths. Unset it rather than blanking it.

**What the cost numbers mean.** The run's `estimatedCostUsd` is the sum of the agents' own estimates at
list price; the Agent SDK documents its `total_cost_usd` as "estimates, not billing". Under a subscription
nothing is charged for the coding agent; under an API key or federation the invoice is the Console's usage
page, not this field. The run also keeps the token counts the models reported, which is what a bill is
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
      ANTHROPIC_IDENTITY_TOKEN_FILE: ${{ runner.temp }}/anthropic-jwt
    steps:
      - uses: actions/checkout@v4
      - name: Fetch GitHub OIDC token
        run: |
          curl -sS -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://api.anthropic.com" \
            | jq -r .value > "$ANTHROPIC_IDENTITY_TOKEN_FILE"
      - run: SPEC_WRITER=anthropic pnpm nx run @zenthos/evals:run
```

Trigger the workflow once inside the wizard's 15-minute window and the rule's page shows the exchange. Failed
exchanges appear under **Authentication events** with a reason: `jti_reused` (a token presented twice), a
claim mismatch against the rule, or `workspace_id_required`.

## GitHub: the ZenthOs app

ZenthOs talks to GitHub as a GitHub App, so comments and pull requests come from `<app>[bot]` and each
repository owner decides where it is installed (ADR 006). Creating the app is a one-time bootstrap for a
deployment; users will connect repositories from the dashboard with an install redirect, and self-hosters
will get the app created for them by the manifest wizard (ADR 007). Until the API and dashboard exist,
create it by hand:

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**. Name it `zenthos` (or
   `zenthos-dev` for your own tests). Homepage URL can be the repository. Uncheck **Webhook → Active** for now.
2. Repository permissions: **Contents** read and write, **Issues** read and write, **Pull requests** read and
   write, **Metadata** read. No organisation or account permissions.
3. **Where can this app be installed**: only on this account, unless others will install it.
4. After creating it, note the **App ID** and generate a **private key** (a `.pem` download).
5. **Install App** on the repositories ZenthOs may work on, for example `mara-sandra-connect`.

Then in `.env`:

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

## Cloud Run (phase 5)

Same mechanism with the Google issuer (`https://accounts.google.com`), the service's identity token from the
metadata server, and a rule matching the service account's `email` claim. Set up when the deploy exists.

## Source

Anthropic docs: Authentication, Workload Identity Federation, the GitHub Actions provider guide and the WIF
reference, read on 2026-10-13.
