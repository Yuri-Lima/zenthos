import type { Implementation, RepoProfile, Spec, Workspace } from '@zenthos/domain';

export type ImplementInput = {
  workspace: Workspace;
  spec: Spec;
  profile: RepoProfile;
  /** Gate failures from the previous attempt, so the agent can fix them. */
  feedback?: string;
};

/** Writes code in the workspace to satisfy the spec. May only run commands the profile allows. */
export interface CodingAgentPort {
  implement(input: ImplementInput): Promise<Implementation>;
}
