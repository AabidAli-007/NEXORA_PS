import type { AssessmentQuestion, EvidenceState, LearnerSkill, ProficiencyScore } from './types';

export interface SubmittedAnswer {
  questionId: string;
  answer: string;
}

export interface GradedQuestionResult {
  questionId: string;
  conceptTag: string;
  correct: boolean;
  submittedAnswer: string;
  correctAnswer: string;
  explanation: string;
}

export interface AssessmentGradingOutput {
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  weakConcepts: string[];
  adaptiveDecision: 'REMEDIAL_REQUIRED' | 'TARGETED_PRACTICE' | 'PROGRESSION_ELIGIBLE';
  questionResults: GradedQuestionResult[];
  recommendedEvidenceState: EvidenceState;
  recommendedProficiency: ProficiencyScore;
  rubricSummary: string;
}

export function normalizeAnswer(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Deterministic assessment scorer and adaptive decision engine.
 * Thresholds (configurable prototype thresholds):
 * - < 60%: REMEDIAL_REQUIRED
 * - 60% - 84%: TARGETED_PRACTICE
 * - >= 85%: PROGRESSION_ELIGIBLE
 *
 * Critical rule: a single objective MCQ-only assessment cannot automatically
 * promote a skill to Validated (which requires project/mentor/credential evidence).
 */
export function evaluateAssessmentSubmission(
  questions: AssessmentQuestion[],
  answers: SubmittedAnswer[],
  currentSkill: LearnerSkill | undefined,
  practicalSubmission?: { completedTasksCount?: number; reflectionNotes?: string }
): AssessmentGradingOutput {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));
  const weakConceptSet = new Set<string>();
  let correctCount = 0;

  const questionResults: GradedQuestionResult[] = questions.map((q) => {
    const submitted = answerMap.get(q.id) ?? '';
    const isCorrect =
      submitted.length > 0 &&
      normalizeAnswer(submitted) === normalizeAnswer(q.correctAnswer);
    if (isCorrect) {
      correctCount += 1;
    } else {
      weakConceptSet.add(q.conceptTag);
    }
    return {
      questionId: q.id,
      conceptTag: q.conceptTag,
      correct: isCorrect,
      submittedAnswer: submitted,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
    };
  });

  const totalCount = questions.length;
  const scorePercent =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  let adaptiveDecision: AssessmentGradingOutput['adaptiveDecision'];
  if (scorePercent < 60) {
    adaptiveDecision = 'REMEDIAL_REQUIRED';
  } else if (scorePercent < 85) {
    adaptiveDecision = 'TARGETED_PRACTICE';
  } else {
    adaptiveDecision = 'PROGRESSION_ELIGIBLE';
  }

  const hasNonMcqEvidence = questions.some((q) => q.type !== 'MCQ');
  const hasPracticalNotes = Boolean(
    practicalSubmission?.reflectionNotes && practicalSubmission.reflectionNotes.trim().length >= 15
  );

  const prevState: EvidenceState = currentSkill?.evidenceState ?? 'Unassessed';
  const prevProficiency: ProficiencyScore = currentSkill?.proficiency ?? 0;

  let recommendedEvidenceState: EvidenceState = prevState;
  let recommendedProficiency: ProficiencyScore = prevProficiency;
  let rubricSummary = '';

  if (scorePercent < 60) {
    // Low assessment score keeps existing Validated state if previously earned via project,
    // otherwise marks Demonstrated at foundational level (1) only if some partial mastery or keeps Declared.
    if (prevState === 'Unassessed' || prevState === 'Declared') {
      recommendedEvidenceState = prevState;
      recommendedProficiency = 0;
    } else {
      recommendedProficiency = Math.min(prevProficiency, 2) as ProficiencyScore;
    }
    rubricSummary = `Scored ${scorePercent}% (< 60% threshold). Remedial learning inserted for weak concepts: ${
      Array.from(weakConceptSet).join(', ') || 'core fundamentals'
    }.`;
  } else if (scorePercent < 85) {
    if (hasNonMcqEvidence || hasPracticalNotes) {
      recommendedEvidenceState = prevState === 'Validated' ? 'Validated' : 'Demonstrated';
      recommendedProficiency = Math.max(prevProficiency, 2) as ProficiencyScore;
      rubricSummary = `Scored ${scorePercent}% (60–84% targeted practice band) with applied questions. Proficiency set to ${recommendedProficiency}/5; targeted practice recommended.`;
    } else {
      recommendedEvidenceState = prevState === 'Validated' ? 'Validated' : 'Declared';
      recommendedProficiency = prevProficiency;
      rubricSummary = `Scored ${scorePercent}% on MCQ items only. Complete applied debugging or practical tasks to verify Demonstrated proficiency.`;
    }
  } else {
    if (hasNonMcqEvidence || hasPracticalNotes || totalCount >= 3) {
      recommendedEvidenceState = prevState === 'Validated' ? 'Validated' : 'Demonstrated';
      const targetLevel = scorePercent === 100 && hasPracticalNotes ? 4 : 3;
      recommendedProficiency = Math.max(prevProficiency, targetLevel) as ProficiencyScore;
      rubricSummary = `Scored ${scorePercent}% (>= 85% progression threshold) across ${totalCount} diagnostic items. Evidence state updated to ${recommendedEvidenceState} (${recommendedProficiency}/5).`;
    } else {
      recommendedEvidenceState = prevState === 'Validated' ? 'Validated' : 'Declared';
      recommendedProficiency = prevProficiency;
      rubricSummary =
        'High score on a single MCQ check is not sufficient alone for Demonstrated status; submit a multi-format assessment or practical artifact.';
    }
  }

  return {
    scorePercent,
    correctCount,
    totalCount,
    weakConcepts: Array.from(weakConceptSet),
    adaptiveDecision,
    questionResults,
    recommendedEvidenceState,
    recommendedProficiency,
    rubricSummary,
  };
}
