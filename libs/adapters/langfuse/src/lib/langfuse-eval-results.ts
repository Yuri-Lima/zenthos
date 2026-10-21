import { EVAL_METRICS, EVAL_SUITES, type EvalMetric, type EvalRunResult } from '@zenthos/domain';
import type { EvalResultsPort } from '@zenthos/ports';
import type { LangfuseReadConfig } from './langfuse-trace-usage.js';

type V3Score = { name: string; value: number | null; timestamp: string; metadata?: Record<string, unknown>; subject?: { kind: string; id: string } };

/** Scores read per metric; the latest runs are what matters, and a page of them covers weeks of runs. */
const SCORES_PER_METRIC = 100;

/**
 * Reads the eval runs back from LangFuse v4 (ADR 016). Events-only LangFuse has no dataset-runs endpoint; the v3
 * scores endpoint returns each run-level score with the experiment run it belongs to (`subject`) and the metadata
 * the experiment stamped on it (suite, prompt version, dataset). One query per metric, grouped by run; dry runs
 * (in-memory agents) are skipped.
 */
export class LangfuseEvalResults implements EvalResultsPort {
  private readonly authorization: string;

  constructor(
    private readonly config: LangfuseReadConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {
    this.authorization = `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`;
  }

  async scoredRuns(): Promise<EvalRunResult[]> {
    const byRun = new Map<string, EvalRunResult>();
    const metrics = Object.keys(EVAL_METRICS) as EvalMetric[];
    const perMetric = await Promise.all(metrics.map((metric) => this.scores(`mean_${metric}`)));
    for (const [index, metric] of metrics.entries()) {
      for (const score of perMetric[index]) {
        // LangFuse returns metadata values parsed: the string 'true' comes back as the boolean true.
        const meta = score.metadata ?? {};
        const suite = EVAL_SUITES.find((s) => s === meta['suite']);
        if (score.subject?.kind !== 'experiment' || !suite || String(meta['dryRun']) === 'true' || typeof score.value !== 'number') continue;
        const run = byRun.get(score.subject.id) ?? {
          suite,
          dataset: String(meta['dataset'] ?? ''),
          promptVersion: String(meta['promptVersion'] ?? ''),
          runName: score.subject.id,
          createdAt: new Date(score.timestamp).toISOString(),
          scores: {},
        };
        run.scores[metric] = score.value;
        byRun.set(score.subject.id, run);
      }
    }
    return [...byRun.values()];
  }

  private async scores(name: string): Promise<V3Score[]> {
    const params = new URLSearchParams({ name, limit: String(SCORES_PER_METRIC), fields: 'core,details,subject' });
    const response = await this.fetchFn(`${this.config.baseUrl}/api/public/v3/scores?${params}`, { headers: { Authorization: this.authorization } });
    if (!response.ok) throw new Error(`LangFuse scores answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return ((await response.json()) as { data: V3Score[] }).data;
  }
}
