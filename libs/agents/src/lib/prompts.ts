import { REVIEWER_SYSTEM_PROMPT, REVIEWER_VERSION } from './reviewer/prompt.js';
import { SPEC_WRITER_SYSTEM_PROMPT, SPEC_WRITER_VERSION } from './spec-writer/prompt.js';

/**
 * The prompts CI publishes to LangFuse (ADR 016): the repository stays the source, reviewed in pull requests;
 * LangFuse gets each version for its playground and prompt experiments. Runs never fetch them.
 */
export const PUBLISHED_PROMPTS = [
  { version: SPEC_WRITER_VERSION, text: SPEC_WRITER_SYSTEM_PROMPT },
  { version: REVIEWER_VERSION, text: REVIEWER_SYSTEM_PROMPT },
] as const;

/** `spec-writer/v1` is the LangFuse prompt `spec-writer` under the label `v1`. */
export function promptAddress(version: string): { name: string; label: string } {
  const slash = version.indexOf('/');
  if (slash <= 0 || slash === version.length - 1) throw new Error(`prompt versions look like name/label, got ${version}`);
  return { name: version.slice(0, slash), label: version.slice(slash + 1) };
}
