# ADR 004: LangChain is the model boundary; there is no Llm port in the core

Date: 2026-10-13. Status: accepted.

## Decision

The core never calls a model. The only thing it knows is the `SpecWriterPort` (and later ports of the same
kind: reviewer, test planner, router). `libs/agents` implements those ports with LangGraph graphs and takes a
LangChain `Runnable` as its model. Vendor model classes (`ChatAnthropic`, later `ChatOpenAI`) are created in
`libs/agents/*/model.ts` and injected. `libs/agents` is therefore allowed to import LangChain and vendor SDKs;
`libs/domain`, `libs/ports` and `libs/application` are not.

## Why

- LangChain already is a port over model vendors. Wrapping it in a ZenthOs `LlmPort` would be a second
  abstraction with one implementation, which engineering rule 5 forbids.
- Graphs are tested with a `RunnableLambda` that returns canned drafts, so no test needs a vendor.
- Tracing attaches as LangChain callbacks (LangFuse `CallbackHandler`), so observability needs no port either.

## Consequences

- Model routing (phase 4) is a function that returns a `Runnable`, not a new port.
- Default model is `claude-opus-5-5` (config `ZENTHOS_SPEC_MODEL`). Cost is tracked per run through LangFuse.
- Structured output comes from `withStructuredOutput(SpecSchema)`: the zod schema in the domain is the single
  definition of what the model must return.
- Credentials are the SDK's business, not ours: `ChatAnthropic` is given a client factory so the Anthropic SDK
  resolves an API key, an `ant auth login` profile or workload identity federation. No key is ever required
  (`docs/authentication.md`).
