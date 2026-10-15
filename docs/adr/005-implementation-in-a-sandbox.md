# ADR 005: Implementation runs in a disposable sandbox, review happens on the open merge request

Date: 2026-10-13. Status: accepted.

## Decisions

1. **One fresh shallow clone per implementation attempt**, on a branch named from the ticket key, removed
   after the merge request is open or the attempt is abandoned. The agent never sees a long-lived checkout
   and never pushes; the pipeline commits and pushes with its own identity.
2. **One allowlist, enforced twice.** `RepoProfile.allowedCommands` is a list of exact command lines.
   `isCommandAllowed` in the domain is the only matcher. The git sandbox refuses any other command, and
   the Claude Code adapter answers the agent's Bash permission prompts with the same function. A gate
   command must itself be an allowed command.
3. **Deterministic gates first, cheapest first.** Forbidden paths, diff budget, secret scan and cost
   ceiling read the diff and the run; only when they pass do the repository's own commands run. The
   first failing command stops the gate run and its output becomes the agent's feedback for one retry.
4. **Review happens on the open merge request**, so the run state order is implemented, gates_passed,
   mr_opened, reviewed, verified, done. A failed review returns to spec_approved and the next
   implementation pushes to the same branch. This is how humans review, and the reviewer agent of
   phase 3 posts where they already look.
5. **Workspace activities run on one worker.** The workspace path is local to the worker that cloned
   it. Phase 2 deploys one worker; phase 5 moves to Temporal sessions or a per-worker task queue if
   more than one is needed.

6. **The pipeline owns `zenthos/*` branches.** The push is a force push and the commit step is skipped when
   nothing is staged, so the pull-request step can be retried and a stale branch left by an earlier escalated
   run of the same ticket is replaced rather than merged into. Humans do not work on these branches.

## Why not

- Running the agent in the worker's own checkout: no isolation, no clean diff, and nothing to throw away
  on failure.
- Globs or prefixes in the allowlist: `bun run *` would also allow `bun run ../x`; an exact list is
  readable and reviewable in one glance.
- Letting the agent run git: it could push, rewrite history or touch the base branch; the pipeline needs
  to own the branch.

## Consequences

- Repository profiles live in `apps/worker/src/repos.ts`, one per target repo, and are the single place
  that says what may run where.
- Playwright is not a gate yet for Legal Connect: it needs the local database the repo's scripts create
  in Docker. Lint and format run; e2e joins the gate list once the sandbox can start that database.
- Claude Code authenticates with the Anthropic credential chain (ADR 004 and `docs/authentication.md`),
  never with a key held by ZenthOs. Its own claude.ai login is acceptable only on a developer's laptop:
  Anthropic forbids offering claude.ai login or rate limits inside a product built on the Agent SDK, so any
  shared deployment gives the coding agent the deployment's credentials, federation on Cloud Run.
- The cost the agent reports is an estimate at list price and is recorded as such (`estimatedCostUsd`),
  beside the token counts a bill would be based on. The cost ceiling gate judges the estimate.
