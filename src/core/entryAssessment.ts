import { normalizeAnswer } from './assessment';
import type {
  AcademicDomainId,
  EntryAiProfileSummary,
  EntryAssessmentResult,
  EntryQuestionItem,
  EntrySkillLevel,
  SubjectBreakdownItem,
} from './types';

export function classifyEntrySkillLevel(scorePercent: number): EntrySkillLevel {
  if (scorePercent < 45) return 'Beginner';
  if (scorePercent < 65) return 'Basic';
  if (scorePercent < 85) return 'Intermediate';
  return 'Advanced';
}

export function gradeEntryAssessment(params: {
  sessionId: string;
  domainId: AcademicDomainId;
  courseId: string;
  courseName: string;
  questions: EntryQuestionItem[];
  answers: Record<string, string>;
  aiProfile?: EntryAiProfileSummary;
}): EntryAssessmentResult {
  const { sessionId, domainId, courseId, courseName, questions, answers } = params;

  const subjectStats = new Map<string, { correct: number; total: number }>();
  const strongTopicsSet = new Set<string>();
  const weakTopicsSet = new Set<string>();
  let correctCount = 0;

  const questionReviews = questions.map((q) => {
    const submitted = answers[q.id] ?? '';
    const isCorrect =
      submitted.trim().length > 0 &&
      normalizeAnswer(submitted) === normalizeAnswer(q.correctAnswer);

    const prev = subjectStats.get(q.subjectTag) ?? { correct: 0, total: 0 };
    prev.total += 1;
    if (isCorrect) {
      prev.correct += 1;
      correctCount += 1;
      strongTopicsSet.add(q.topicTag);
    } else {
      weakTopicsSet.add(q.topicTag);
    }
    subjectStats.set(q.subjectTag, prev);

    return {
      questionId: q.id,
      subjectTag: q.subjectTag,
      topicTag: q.topicTag,
      prompt: q.prompt,
      submittedAnswer: submitted,
      correctAnswer: q.correctAnswer,
      correct: isCorrect,
      explanation: q.explanation,
    };
  });

  const totalCount = questions.length;
  const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const skillLevel = classifyEntrySkillLevel(scorePercent);

  const subjectBreakdown: SubjectBreakdownItem[] = Array.from(subjectStats.entries()).map(
    ([subject, stat]) => {
      const pct = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      return {
        subject,
        correct: stat.correct,
        total: stat.total,
        scorePercent: pct,
        level: classifyEntrySkillLevel(pct),
      };
    }
  );

  const weakTopics = Array.from(weakTopicsSet);
  const strongTopics = Array.from(strongTopicsSet).filter((t) => !weakTopicsSet.has(t));

  const sortedSubjects = [...subjectBreakdown].sort((a, b) => a.scorePercent - b.scorePercent);
  const weakestSubject = sortedSubjects[0];
  const strongestSubject = sortedSubjects[sortedSubjects.length - 1];

  const defaultAiProfile: EntryAiProfileSummary = params.aiProfile ?? {
    strengthsSummary:
      strongTopics.length > 0
        ? `Strongest baseline in ${strongestSubject?.subject ?? courseName} (${strongestSubject?.scorePercent ?? scorePercent}%), particularly ${strongTopics.slice(0, 3).join(', ')}.`
        : `You have established an initial baseline in ${courseName}.`,
    weakAreasSummary:
      weakTopics.length > 0
        ? `Priority focus areas identified: ${weakestSubject?.subject ?? 'Core Foundations'} (${weakestSubject?.scorePercent ?? 0}%), especially ${weakTopics.slice(0, 3).join(', ')}.`
        : `Strong cross-subject accuracy across your entry diagnostic.`,
    recommendedPace:
      skillLevel === 'Beginner'
        ? 'Start with core foundational modules and 20-minute daily retrieval drills before timed practice.'
        : skillLevel === 'Basic'
          ? 'Reinforce foundational gaps first, then move into applied case and problem drills.'
          : skillLevel === 'Intermediate'
            ? 'You have a solid foundation; target your lowest-scoring subject modules to move to Advanced.'
            : 'Accelerate directly into applied projects, case synthesis, and peer-level diagnostics.',
    nextSteps: [
      weakestSubject
        ? `Review ${weakestSubject.subject} (${weakTopics[0] ?? 'core principles'})`
        : `Open your ${courseName} Learning Roadmap`,
      'Use AI Mentor Stage 1–2 hints to clarify incorrect entry test concepts',
      'Complete your first verified topic diagnostic in SkillProof',
    ],
    usedAi: false,
  };

  return {
    sessionId,
    domainId,
    courseId,
    courseName,
    scorePercent,
    correctCount,
    totalCount,
    skillLevel,
    subjectBreakdown,
    strongTopics,
    weakTopics,
    questionReviews,
    aiProfile: defaultAiProfile,
    disclaimer:
      'This diagnostic entry result estimates your starting baseline for this course; it is not an official academic credential or certification.',
    completedAt: new Date().toISOString(),
  };
}
