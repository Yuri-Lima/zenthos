/**
 * How ZenthOs authenticates to GitHub. A GitHub App is the default: ZenthOs acts as `zenthos[bot]`,
 * repository owners install it where they choose, and tokens are minted per installation and short-lived.
 * A personal token is the interim for a single account. Today these come from the environment; ADR 006
 * moves them to stored provider connections edited from the settings page.
 */
export type GitHubCredentials =
  | { type: 'github-app'; appId: string; privateKey: string }
  | { type: 'github-token'; token: string };
