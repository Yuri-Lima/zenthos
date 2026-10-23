# ADR 018: The coding agent runs on organisation credentials only

Status: accepted, 2026-10-24. Supersedes the laptop exception in ADR 005.

## Context

The coding agent is Claude Code, driven by the Agent SDK: `query()` starts the SDK's bundled Claude Code binary and
talks to it over JSON lines. Claude Code picks its own credential, and the last entry in its authentication order is
a claude.ai login. On a developer's laptop that login was always present, so every coding-agent run so far went to a
personal Claude Max subscription.

Anthropic does not allow third-party products, agents built on the Agent SDK included, to offer claude.ai login or
its rate limits (Agent SDK overview). ADR 005 allowed the login on a developer's own laptop. ZenthOs is meant to be
run by developers at other companies, so that exception would become the way most installations start, and the
cost of a run would land on whoever happened to be signed in rather than on an organisation's Console usage.

What was measured on Claude Code 2.1.296 (the SDK's binary) and 2.1.309, 24 Oct 2026:

- The init message's `apiKeySource` is `none` for a claude.ai login, a profile and a cloud provider alike; it cannot
  tell them apart. The session's `accountInfo()` can: a claude.ai login reports `subscriptionType` ("Claude Max").
- `accountInfo()` answers before any message is sent, so the check costs no model call.
- With `CLAUDE_CONFIG_DIR` set, Claude Code reads only that directory's sign-in (on macOS the Keychain entry is keyed
  to the directory), so a developer's personal login is out of reach.
- An `ant auth login` profile named in `ANTHROPIC_PROFILE` was not used by either version, contrary to the
  authentication docs: with the claude.ai login present the login won, without it the run was "Not logged in". The
  spec writer and the reviewer, which call the API through the Anthropic SDK, do use that profile.

## Decision

- **No subscription, anywhere.** There is no setting that allows one. The adapter refuses a claude.ai login on a
  laptop exactly as on a server.
- **ZenthOs's own Claude Code config directory**, `CODING_AGENT_CONFIG_DIR` (default `~/.zenthos/claude-code`), is
  always passed as `CLAUDE_CONFIG_DIR`, and `CLAUDE_CODE_OAUTH_TOKEN` (a subscription token from
  `claude setup-token`) is removed from the environment Claude Code gets.
- **Accepted credentials**, in Claude Code's own order: a cloud provider (`CLAUDE_CODE_USE_BEDROCK`, `_VERTEX`,
  `_FOUNDRY`), `ANTHROPIC_AUTH_TOKEN` for a gateway, `ANTHROPIC_API_KEY`, Workload Identity Federation
  (`ANTHROPIC_FEDERATION_RULE_ID` with `ANTHROPIC_ORGANIZATION_ID`), or a Claude Console sign-in in that directory.
  On a laptop that sign-in is `pnpm nx run @zenthos/worker:coding-agent-login` (`claude auth login --console`,
  choosing **Create an API key**: a workspace key kept in that directory's credential store, never in `.env`; the
  keyless choice would rewrite the shared Anthropic profile and sign out claude.ai logins on the machine). On a
  server the directory stays empty and federation supplies the credential.
- **Checked twice.** The worker asks Claude Code for its account at boot and does not start on a subscription or
  without any credential. Every run asks again before its prompt is sent and fails as
  `implementation_failed: credential_refused` without reaching the model.

## Consequences

- Every coding-agent run is billed to a Console organisation and shows on its usage page; `estimatedCostUsd` stays
  an estimate beside it (ADR 015).
- Prompt caching is five minutes throughout unless `ENABLE_PROMPT_CACHING_1H` is set; the cost split from ADR 015
  still holds, with no one-hour writes to attribute.
- Signing in is one more step for a new developer, and needs the `claude` CLI on the PATH for that step only; runs
  use the SDK's bundled binary.
- The check relies on `accountInfo()` keeping `subscriptionType` for claude.ai logins. A Claude Code update that
  changes it shows up as a refused run or a failed boot, never as a quiet fallback, because the config directory
  never holds a claude.ai login in the first place.
- If Claude Code starts honouring `ant` profiles, the Console sign-in step can become the same profile the spec
  writer uses. Retest when the SDK is upgraded.
