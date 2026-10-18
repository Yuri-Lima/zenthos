import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { Runnable } from '@langchain/core/runnables';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { DomainError, parseSpec, type Spec } from '@zenthos/domain';
import type { SpecWriterInput, SpecWriterPort } from '@zenthos/ports';
import {
  SPEC_WRITER_SYSTEM_PROMPT,
  SPEC_WRITER_VERSION,
  specWriterUserPrompt,
} from './prompt.js';

/** A model already bound to the Spec schema, e.g. `chatModel.withStructuredOutput(SpecSchema)`. */
export type StructuredSpecModel = Runnable<BaseLanguageModelInput, unknown>;

export type LangGraphSpecWriterOptions = {
  model: StructuredSpecModel;
  /** Tracing callbacks for one invocation. Called per draftSpec call. */
  callbacks?: (input: SpecWriterInput) => Callbacks;
  /** Drafts before giving up. Each retry feeds the schema errors back to the model. */
  maxAttempts?: number;
};

const State = Annotation.Root({
  input: Annotation<SpecWriterInput>,
  attempt: Annotation<number>,
  draft: Annotation<unknown>,
  issues: Annotation<string | undefined>,
  spec: Annotation<Spec | undefined>,
});

/**
 * write -> validate -> (done | write again with the errors | give up).
 * The graph is small on purpose: the schema is the only judge of a draft. One definition serves the
 * port adapter below and LangGraph Studio (libs/agents/src/studio).
 */
export function buildSpecWriterGraph(
  model: StructuredSpecModel,
  maxAttempts = 3,
) {
  const draft = async (state: typeof State.State) => {
    const { ticket, repoContext } = state.input;
    const draft = await model.invoke([
      ['system', SPEC_WRITER_SYSTEM_PROMPT],
      [
        'human',
        specWriterUserPrompt({
          ticketKey: ticket.key,
          title: ticket.title,
          body: ticket.body,
          repoContext,
          previousIssues: state.issues,
        }),
      ],
    ]);
    return { draft, attempt: state.attempt + 1 };
  };

  const validate = (state: typeof State.State) => {
    try {
      return {
        spec: parseSpec({
          ...(state.draft as object),
          ticketKey: state.input.ticket.key,
        }),
        issues: undefined,
      };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return {
        spec: undefined,
        issues: JSON.stringify(error.context['issues'], null, 2),
      };
    }
  };

  const next = (state: typeof State.State) => {
    if (state.spec) return END;
    return state.attempt < maxAttempts ? 'write' : END;
  };

  return new StateGraph(State)
    .addNode('write', draft)
    .addNode('validate', validate)
    .addEdge(START, 'write')
    .addEdge('write', 'validate')
    .addConditionalEdges('validate', next, ['write', END])
    .compile();
}

/** The SpecWriterPort over the graph: tracing callbacks per call, and a domain error when every attempt failed. */
export class LangGraphSpecWriter implements SpecWriterPort {
  private readonly graph;
  private readonly callbacks: (input: SpecWriterInput) => Callbacks;

  constructor({
    model,
    callbacks,
    maxAttempts = 3,
  }: LangGraphSpecWriterOptions) {
    this.graph = buildSpecWriterGraph(model, maxAttempts);
    this.callbacks = callbacks ?? (() => []);
  }

  async draftSpec(input: SpecWriterInput): Promise<Spec> {
    const result = await this.graph.invoke(
      {
        input,
        attempt: 0,
        draft: undefined,
        issues: undefined,
        spec: undefined,
      },
      {
        callbacks: this.callbacks(input),
        runName: SPEC_WRITER_VERSION,
        tags: [SPEC_WRITER_VERSION],
      },
    );
    if (!result.spec) {
      throw new DomainError('invalid_spec', {
        attempts: result.attempt,
        issues: result.issues,
      });
    }
    return result.spec;
  }
}
