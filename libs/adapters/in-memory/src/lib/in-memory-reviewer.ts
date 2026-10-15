import type { Review } from '@zenthos/domain';
import type { ReviewerPort, ReviewInput } from '@zenthos/ports';

/** Reviewer that needs no model: fours across the board and no findings, unless told otherwise. */
export class InMemoryReviewer implements ReviewerPort {
  constructor(private readonly canned?: Partial<Review>) {}

  async review({ diff }: ReviewInput): Promise<Review> {
    const evidence = `Judged ${diff.files.length} file(s), ${diff.changedLines} changed line(s), without a model`;
    return {
      scores: {
        correctness: { score: 4, evidence },
        spec_coverage: { score: 4, evidence },
        readability: { score: 4, evidence },
        engineering_rules: { score: 4, evidence },
      },
      findings: [],
      summary: 'Dry-run review: no model was consulted, the scores are placeholders.',
      ...this.canned,
    };
  }
}
