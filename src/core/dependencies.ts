import type { CareerRequirement, LearnerSkill, RoadmapStepStatus } from './types';

export interface DependencyEdge {
  skillId: string;
  prerequisites: string[];
}

export interface DependencyValidationResult {
  valid: boolean;
  cyclePath: string[] | null;
  orderedSkillIds: string[];
}

/**
 * Validates that a skill dependency graph has no circular dependencies
 * and returns a deterministic topological ordering.
 */
export function validateDependencyGraph(
  nodes: DependencyEdge[]
): DependencyValidationResult {
  const adj = new Map<string, string[]>();
  const nodeIds = new Set<string>();

  for (const n of nodes) {
    nodeIds.add(n.skillId);
    adj.set(n.skillId, [...n.prerequisites]);
    for (const p of n.prerequisites) {
      nodeIds.add(p);
      if (!adj.has(p)) {
        adj.set(p, []);
      }
    }
  }

  // State: 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map<string, number>();
  const stack: string[] = [];
  const ordered: string[] = [];

  function dfs(id: string): string[] | null {
    state.set(id, 1);
    stack.push(id);

    const prereqs = adj.get(id) ?? [];
    for (const prereq of prereqs) {
      const s = state.get(prereq) ?? 0;
      if (s === 1) {
        const cycleStart = stack.indexOf(prereq);
        return [...stack.slice(cycleStart), prereq];
      }
      if (s === 0) {
        const cycle = dfs(prereq);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    state.set(id, 2);
    ordered.push(id);
    return null;
  }

  for (const id of nodeIds) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = dfs(id);
      if (cycle) {
        return {
          valid: false,
          cyclePath: cycle,
          orderedSkillIds: [],
        };
      }
    }
  }

  return {
    valid: true,
    cyclePath: null,
    orderedSkillIds: ordered,
  };
}

/**
 * Checks whether all prerequisites for a given skill are satisfied by either:
 * - Demonstrated/Validated evidence meeting at least level 1, OR
 * - Completed roadmap steps in the current plan.
 */
export function arePrerequisitesMet(
  prerequisites: string[],
  learnerSkills: LearnerSkill[],
  completedSkillIds: Set<string>
): boolean {
  if (prerequisites.length === 0) return true;
  const skillMap = new Map(learnerSkills.map((s) => [s.skillId, s]));
  return prerequisites.every((prereqId) => {
    if (completedSkillIds.has(prereqId)) return true;
    const skill = skillMap.get(prereqId);
    return Boolean(
      skill &&
        (skill.evidenceState === 'Demonstrated' || skill.evidenceState === 'Validated') &&
        skill.proficiency >= 1
    );
  });
}

export function determineRoadmapStepStatus(
  req: CareerRequirement,
  learnerSkills: LearnerSkill[],
  completedSkillIds: Set<string>,
  existingStatus?: RoadmapStepStatus
): RoadmapStepStatus {
  const skill = learnerSkills.find((s) => s.skillId === req.skillId);
  const meetsTarget =
    skill &&
    (skill.evidenceState === 'Demonstrated' || skill.evidenceState === 'Validated') &&
    skill.proficiency >= req.requiredProficiency;

  if (meetsTarget) {
    return 'COMPLETED';
  }
  if (existingStatus === 'NEEDS_REVISION') {
    return 'NEEDS_REVISION';
  }
  const unlocked = arePrerequisitesMet(req.prerequisites, learnerSkills, completedSkillIds);
  if (!unlocked) {
    return 'LOCKED';
  }
  if (existingStatus === 'IN_PROGRESS') {
    return 'IN_PROGRESS';
  }
  if (
    skill &&
    (skill.evidenceState === 'Demonstrated' || skill.evidenceState === 'Validated') &&
    skill.proficiency > 0
  ) {
    return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}
