import type { Diff } from './implementation.js';

/** Files and changed-line count from a unified diff, as git and GitHub produce it. Pure, no git needed. */
export function parseUnifiedDiff(patch: string): Diff {
  const files: string[] = [];
  let changedLines = 0;
  for (const line of patch.split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      files.push(header[2]);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') || line.startsWith('-')) changedLines++;
  }
  return { files, changedLines, patch };
}
