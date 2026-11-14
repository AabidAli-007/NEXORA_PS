import type {
  CareerProfile,
  EvidenceState,
  LearnerSkill,
  ReadinessResult,
  SkillGapItem,
} from './types';

/**
 * Computes demonstrated proficiency D from a LearnerSkill record.
 * Critical NEXORA principle:
 * - Unassessed and Declared skills have D = 0 for readiness math because
 *   claiming a skill is not evidence of mastery.
 * - Only Demonstrated or Validated skills contribute their evidence-backed proficiency.
 */
export function getEvidenceBackedProficiency(skill: LearnerSkill | undefined): number {
  if (!skill) return 0;
  if (skill.evidenceState === 'Demonstrated' || skill.evidenceState === 'Validated') {
    return Math.max(0, Math.min(5, skill.proficiency));
  }
  return 0;
}

function resolveStatusLabel(
  skill: LearnerSkill | undefined,
  gap: number
): { label: SkillGapItem['statusLabel']; isUnassessed: boolean } {
  if (!skill || skill.evidenceState === 'Unassessed') {
    return { label: 'Missing Evidence', isUnassessed: true };
  }
  if (skill.evidenceState === 'Declared') {
    return { label: 'Declared Only', isUnassessed: true };
  }
  if (gap > 0) {
    return { label: 'Needs Improvement', isUnassessed: false };
  }
  if (skill.evidenceState === 'Validated') {
    return { label: 'Validated', isUnassessed: false };
  }
  return { label: 'Demonstrated', isUnassessed: false };
}

function buildGapExplanation(
  skillName: string,
  required: number,
  demonstrated: number,
  evidenceState: EvidenceState,
  declaredLevel: string,
  gap: number
): string {
  if (evidenceState === 'Unassessed') {
    return `No assessment or practical evidence recorded for ${skillName} yet. Treated as missing evidence rather than failure.`;
  }
  if (evidenceState === 'Declared') {
    return `${skillName} is declared (${declaredLevel}) but lacks assessment or project evidence. Complete an assessment or project to prove proficiency toward target ${required}/5.`;
  }
  if (gap > 0) {
    return `${skillName} is ${evidenceState.toLowerCase()} at ${demonstrated}/5 against a ${required}/5 career target (gap of ${gap.toFixed(1)}).`;
  }
  return `${skillName} meets or exceeds the ${required}/5 requirement with ${evidenceState.toLowerCase()} proficiency (${demonstrated}/5).`;
}

/**
 * Dynamic Career Readiness Engine
 * Gap = max(0, R - D)
 * Weighted Gap = Gap * W
 * Readiness = 100 * [1 - (Sum(Weighted Gap) / Sum(R * W))]
 * Safely handles empty career profiles (returns 0).
 */
export function calculateCareerReadiness(
  career: CareerProfile | undefined | null,
  learnerSkills: LearnerSkill[],
  previousCareerId?: string | null
): ReadinessResult {
  if (!career || career.requirements.length === 0) {
    return {
      careerId: career?.id ?? 'none',
      careerTitle: career?.title ?? 'Unselected Career',
      readinessScore: 0,
      totalWeightedRequirements: 0,
      totalWeightedGaps: 0,
      requiredCount: 0,
      demonstratedOrValidatedCount: 0,
      declaredOnlyCount: 0,
      unassessedCount: 0,
      skillsNeedingImprovementCount: 0,
      skillGaps: [],
      priorityGaps: [],
      transferableSkills: [],
      methodologyNote:
        'No structured career profile selected. Select a target career to compute evidence-weighted readiness.',
    };
  }

  const skillById = new Map<string, LearnerSkill>();
  for (const s of learnerSkills) {
    skillById.set(s.skillId, s);
  }

  let sumWeightedRequirements = 0;
  let sumWeightedGaps = 0;
  let demonstratedOrValidatedCount = 0;
  let declaredOnlyCount = 0;
  let unassessedCount = 0;
  let skillsNeedingImprovementCount = 0;

  const skillGaps: SkillGapItem[] = career.requirements.map((req) => {
    const learnerSkill = skillById.get(req.skillId);
    const evidenceState: EvidenceState = learnerSkill?.evidenceState ?? 'Unassessed';
    const declaredLevel = learnerSkill?.declaredLevel ?? 'Not Listed';
    const D = getEvidenceBackedProficiency(learnerSkill);
    const R = req.requiredProficiency;
    const W = req.weight;

    const gap = Math.max(0, R - D);
    const weightedGap = Number((gap * W).toFixed(4));
    const weightedReq = R * W;

    sumWeightedRequirements += weightedReq;
    sumWeightedGaps += weightedGap;

    const { label, isUnassessed } = resolveStatusLabel(learnerSkill, gap);

    if (evidenceState === 'Demonstrated' || evidenceState === 'Validated') {
      demonstratedOrValidatedCount += 1;
      if (gap > 0) {
        skillsNeedingImprovementCount += 1;
      }
    } else if (evidenceState === 'Declared') {
      declaredOnlyCount += 1;
    } else {
      unassessedCount += 1;
    }

    const isTransferable =
      Boolean(previousCareerId && previousCareerId !== career.id) &&
      (evidenceState === 'Demonstrated' || evidenceState === 'Validated') &&
      D > 0;

    return {
      skillId: req.skillId,
      skillName: req.skillName,
      category: req.category,
      requiredProficiency: R,
      demonstratedProficiency: D,
      declaredLevel,
      evidenceState,
      weight: W,
      isRequired: req.isRequired,
      gap: Number(gap.toFixed(2)),
      weightedGap,
      isUnassessed,
      isTransferable,
      statusLabel: label,
      explanation: buildGapExplanation(
        req.skillName,
        R,
        D,
        evidenceState,
        declaredLevel,
        gap
      ),
    };
  });

  const readinessScore =
    sumWeightedRequirements <= 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(100 * (1 - sumWeightedGaps / sumWeightedRequirements))
          )
        );

  const priorityGaps = [...skillGaps]
    .filter((item) => item.weightedGap > 0)
    .sort((a, b) => b.weightedGap - a.weightedGap);

  const transferableSkills = skillGaps.filter((item) => item.isTransferable);

  return {
    careerId: career.id,
    careerTitle: career.title,
    readinessScore,
    totalWeightedRequirements: Number(sumWeightedRequirements.toFixed(2)),
    totalWeightedGaps: Number(sumWeightedGaps.toFixed(2)),
    requiredCount: career.requirements.length,
    demonstratedOrValidatedCount,
    declaredOnlyCount,
    unassessedCount,
    skillsNeedingImprovementCount,
    skillGaps,
    priorityGaps,
    transferableSkills,
    methodologyNote:
      'Prototype Readiness = 100 × [1 - Σ(max(0, R - D) × W) / Σ(R × W)]. Only Demonstrated or Validated evidence counts toward D; Declared or Unassessed skills are tracked separately as missing evidence. This is an internal readiness indicator, not an employment guarantee.',
  };
}
