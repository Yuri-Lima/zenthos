import { z } from 'zod';

/**
 * How ZenthOs authenticates to GitHub. A GitHub App is the default: ZenthOs acts as `zenthos[bot]`,
 * repository owners install it where they choose, and tokens are minted per installation and short-lived.
 * A personal token is never stored: it remains only as the worker's GITHUB_TOKEN fallback for a dry run without
 * a store. Stored provider connections are apps, edited from the settings page (ADR 006, ADR 019).
 */
export type GitHubCredentials =
  | { type: 'github-app'; appId: string; privateKey: string }
  | { type: 'github-token'; token: string };

/** What a provider says about one repository when a profile is added: enough to fill the form, nothing more. */
export const RepositoryInfoSchema = z.object({ defaultBranch: z.string().min(1), cloneUrl: z.string().min(1) });
export type RepositoryInfo = z.infer<typeof RepositoryInfoSchema>;
