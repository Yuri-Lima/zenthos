import { z } from 'zod';

/** What GitHub tells us about the person who signed in; the login is the audit identity (ADR 007). */
export const GitHubUserSchema = z.object({ login: z.string().min(1), id: z.number().int().positive(), avatarUrl: z.url().optional() });
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

/** A signed-in dashboard user. The id is an opaque secret the browser holds in a cookie; stores keep only its hash. */
export const SessionSchema = z.object({
  id: z.string().min(32),
  user: GitHubUserSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof SessionSchema>;

export const isSessionExpired = (session: Session, now = new Date()): boolean => Date.parse(session.expiresAt) <= now.getTime();

/** Case-insensitive, as GitHub logins are. An empty allowlist admits nobody. */
export const isLoginAllowed = (login: string, allowedLogins: readonly string[]): boolean => allowedLogins.some((allowed) => allowed.toLowerCase() === login.toLowerCase());
