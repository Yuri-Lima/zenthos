import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { Runnable } from '@langchain/core/runnables';
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import {
  DomainError,
  parseReview,
  RUBRIC_KEYS,
  type Review,
  type RubricKey,
  type RubricScore,
} from '@zenthos/domain';
import type { ReviewerPort, ReviewInput } from '@zenthos/ports';
import {
  findingsPrompt,
  REVIEWER_SYSTEM_PROMPT,
  REVIEWER_VERSION,
  rubricPrompt,
} from './prompt.js';

/** Models already bound to their output schemas: `RubricScoreSchema` and `FindingsSchema`. */
export type ReviewerModels = {
  score: Runnable<BaseLanguageModelInput, unknown>;
  findings: Runnable<BaseLanguageModelInput, unknown>;
};

export type LangGraphReviewerOptions = {
  models: ReviewerModels;
  callbacks?: (input: ReviewInput) => Callbacks;
};

const State = Annotation.Root({
  input: Annotation<ReviewInput>,
  scores: Annotation<Partial<Record<RubricKey, RubricScore>>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  findings: Annotation<unknown>,
});

/**
 * Four rubric lines scored in parallel, one findings pass, then merged and validated against the
 * Review schema. Parallel scoring keeps each judgement narrow, which is what makes an LLM judge
 * consistent enough to compare against humans in the evals. One definition serves the port adapter
 * below and LangGraph Studio (libs/agents/src/studio).
 */
export function buildReviewerGraph(models: ReviewerModels) {
  const score = async (state: { input: ReviewInput; rubric: RubricKey }) => {
    const result = await models.score.invoke([
      ['system', REVIEWER_SYSTEM_PROMPT],
      ['human', rubricPrompt(state.rubric, state.input)],
    ]);
    return { scores: { [state.rubric]: result as RubricScore } };
  };

  // Node names must differ from state channels, so the node is 'collect' and the channel 'findings'.
  const collect = async (state: typeof State.State) => ({
    findings: await models.findings.invoke([
      ['system', REVIEWER_SYSTEM_PROMPT],
      ['human', findingsPrompt(state.input)],
    ]),
  });

  return new StateGraph(State)
    .addNode('score', score)
    .addNode('collect', collect)
    .addConditionalEdges(
      START,
      (state) =>
        RUBRIC_KEYS.map(
          (rubric) => new Send('score', { input: state.input, rubric }),
        ),
      ['score'],
    )
    .addEdge('score', 'collect')
    .addEdge('collect', END)
    .compile();
}

/** The ReviewerPort over the graph: tracing callbacks per call, and the Review schema as the last word. */
export class LangGraphReviewer implements ReviewerPort {
  private readonly graph;
  private readonly callbacks: (input: ReviewInput) => Callbacks;

  constructor({ models, callbacks }: LangGraphReviewerOptions) {
    this.graph = buildReviewerGraph(models);
    this.callbacks = callbacks ?? (() => []);
  }

  async review(input: ReviewInput): Promise<Review> {
    const result = await this.graph.invoke(
      { input, scores: {}, findings: undefined },
      {
        callbacks: this.callbacks(input),
        runName: REVIEWER_VERSION,
        tags: [REVIEWER_VERSION],
      },
    );
    const findings = (result.findings ?? {}) as Partial<
      Pick<Review, 'findings' | 'summary'>
    >;
    try {
      return parseReview({
        scores: result.scores,
        findings: findings.findings ?? [],
        summary: findings.summary,
      });
    } catch (error) {
      if (error instanceof DomainError)
        throw new DomainError('invalid_review', {
          ...error.context,
          scores: result.scores,
        });
      throw error;
    }
  }
}
