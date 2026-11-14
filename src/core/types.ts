export type EvidenceState = 'Unassessed' | 'Declared' | 'Demonstrated' | 'Validated';

export type ProficiencyScore = 0 | 1 | 2 | 3 | 4 | 5;

export type RoadmapStepStatus =
  | 'LOCKED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NEEDS_REVISION';

export type AgentName =
  | 'SKILL_AUDITOR'
  | 'CAREER_ARCHITECT'
  | 'LEARNING_STRATEGIST'
  | 'PROGRESS_EVALUATOR'
  | 'ADAPTIVE_MENTOR';

export type AgentRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING';

export type QuestionType =
  | 'MCQ'
  | 'CODE_OUTPUT'
  | 'DEBUGGING'
  | 'CODE_COMPLETION'
  | 'SQL'
  | 'CONCEPTUAL';

export type AcademicDomainId =
  | 'engineering'
  | 'medical'
  | 'commerce'
  | 'arts'
  | 'ai-tech'
  | 'management'
  | 'law'
  | 'other';

export type EntrySkillLevel = 'Beginner' | 'Basic' | 'Intermediate' | 'Advanced';

export type SkillCategory =
  | 'Language'
  | 'Frontend'
  | 'Backend'
  | 'Database'
  | 'Data & AI'
  | 'DevOps & Tools'
  | 'Security'
  | 'Foundations'
  | 'Clinical & Bio'
  | 'Finance & Quant'
  | 'Humanities & Social'
  | 'Management & Strategy'
  | 'Legal & Policy'
  | 'Engineering Systems';

export interface LearnerProfile {
  userId: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  authProvider: 'local' | 'google' | 'microsoft';
  role: 'student' | 'admin';
  isDemo: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
  domainId: AcademicDomainId;
  courseId: string;
  courseName: string;
  specialization: string;
  educationLevel: string;
  semesterStage: string;
  previousBackground: string;
  graduationYear: string;
  learningGoals: string[];
  primaryGoal: string;
  institution: string;
  degree: string;
  academicYear: string;
  fieldOfStudy: string;
  subjects: string[];
  academicTopics: string[];
  certifications: string[];
  academicProjects: string[];
  technicalInterests: string[];
  targetCareerId: string;
  secondaryCareerIds: string[];
  careerObjectives: string;
  weeklyHours: number;
  preferredFormat: 'Interactive & Practice' | 'Reading & Docs' | 'Project-Based' | 'Mixed';
  preferredLanguage: string;
  timezone: string;
  privacyLeaderboardOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LearnerSkill {
  id: string;
  userId: string;
  skillId: string;
  skillName: string;
  category: SkillCategory;
  evidenceState: EvidenceState;
  proficiency: ProficiencyScore;
  declaredLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'Not Listed';
  lastAssessedAt: string | null;
  needsReassessment: boolean;
  updatedAt: string;
}

export interface SkillEvidence {
  id: string;
  userId: string;
  skillId: string;
  evidenceType: 'DECLARATION' | 'ASSESSMENT' | 'PROJECT' | 'GITHUB_ANALYSIS' | 'CREDENTIAL' | 'MENTOR_REVIEW';
  title: string;
  description: string;
  artifactUrl: string | null;
  scorePercent: number | null;
  verifiedBy: string;
  resultingState: EvidenceState;
  createdAt: string;
}

export interface CareerRequirement {
  skillId: string;
  skillName: string;
  category: SkillCategory;
  requiredProficiency: ProficiencyScore;
  weight: number;
  isRequired: boolean; // true = required, false = preferred
  prerequisites: string[];
  practicalExpectation: string;
}

export interface LearningResource {
  id: string;
  skillId: string;
  title: string;
  provider: string;
  url: string;
  format: 'Documentation' | 'Interactive' | 'Guide' | 'Tutorial';
  estimatedMinutes: number;
  verified: boolean;
}

export interface CareerProfile {
  id: string;
  title: string;
  category:
    | 'Tech'
    | 'Data'
    | 'Security'
    | 'Cloud'
    | 'Engineering'
    | 'Medical'
    | 'Commerce'
    | 'Arts'
    | 'Management'
    | 'Law'
    | 'General';
  domainId?: AcademicDomainId;
  summary: string;
  demandLabel: string;
  isPrimaryMvp: boolean;
  thumbnailKey: 'fullstack' | 'data' | 'aiml';
  requirements: CareerRequirement[];
  projectExpectations: string[];
}

export interface SkillGapItem {
  skillId: string;
  skillName: string;
  category: SkillCategory;
  requiredProficiency: ProficiencyScore;
  demonstratedProficiency: number;
  declaredLevel: LearnerSkill['declaredLevel'];
  evidenceState: EvidenceState;
  weight: number;
  isRequired: boolean;
  gap: number;
  weightedGap: number;
  isUnassessed: boolean;
  isTransferable: boolean;
  statusLabel: 'Validated' | 'Demonstrated' | 'Needs Improvement' | 'Declared Only' | 'Missing Evidence';
  explanation: string;
}

export interface ReadinessResult {
  careerId: string;
  careerTitle: string;
  readinessScore: number;
  totalWeightedRequirements: number;
  totalWeightedGaps: number;
  requiredCount: number;
  demonstratedOrValidatedCount: number;
  declaredOnlyCount: number;
  unassessedCount: number;
  skillsNeedingImprovementCount: number;
  skillGaps: SkillGapItem[];
  priorityGaps: SkillGapItem[];
  transferableSkills: SkillGapItem[];
  methodologyNote: string;
}

export interface RoadmapStep {
  id: string;
  roadmapId: string;
  skillId: string;
  skillName: string;
  phaseNumber: number;
  orderIndex: number;
  learningObjective: string;
  prerequisites: string[];
  resourceId: string | null;
  resourceTitle: string;
  resourceUrl: string;
  practiceExercise: string;
  assessmentId: string | null;
  estimatedMinutes: number;
  completionCriteria: string;
  status: RoadmapStepStatus;
  isRemedial: boolean;
  learnCompleted: boolean;
  practiceCompleted: boolean;
  assessCompleted: boolean;
  demonstrateCompleted: boolean;
}

export interface AssessmentQuestion {
  id: string;
  skillId: string;
  type: QuestionType;
  conceptTag: string;
  difficulty: 'Foundational' | 'Intermediate' | 'Applied';
  prompt: string;
  codeSnippet?: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hintLadder: [string, string, string];
}

export interface AssessmentAttempt {
  id: string;
  userId: string;
  skillId: string;
  skillName: string;
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  weakConcepts: string[];
  adaptiveDecision: 'REMEDIAL_REQUIRED' | 'TARGETED_PRACTICE' | 'PROGRESSION_ELIGIBLE';
  practicalNotes?: string;
  createdAt: string;
}

export interface EntryQuestionItem {
  id: string;
  domainId: AcademicDomainId;
  courseTags?: string[];
  subjectTag: string;
  topicTag: string;
  type: 'MCQ' | 'CONCEPTUAL' | 'NUMERICAL' | 'CODE_OUTPUT' | 'CASE_SCENARIO';
  difficulty: 'Foundational' | 'Intermediate' | 'Applied';
  prompt: string;
  codeSnippet?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface SubjectBreakdownItem {
  subject: string;
  correct: number;
  total: number;
  scorePercent: number;
  level: EntrySkillLevel;
}

export interface EntryAiProfileSummary {
  strengthsSummary: string;
  weakAreasSummary: string;
  recommendedPace: string;
  nextSteps: string[];
  usedAi: boolean;
}

export interface EntryAssessmentResult {
  sessionId: string;
  domainId: AcademicDomainId;
  courseId: string;
  courseName: string;
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  skillLevel: EntrySkillLevel;
  subjectBreakdown: SubjectBreakdownItem[];
  strongTopics: string[];
  weakTopics: string[];
  questionReviews: {
    questionId: string;
    subjectTag: string;
    topicTag: string;
    prompt: string;
    submittedAnswer: string;
    correctAnswer: string;
    correct: boolean;
    explanation: string;
  }[];
  aiProfile: EntryAiProfileSummary;
  disclaimer: string;
  completedAt: string;
}

export interface AcademicMapping {
  id: string;
  subjectName: string;
  learningOutcomes: string[];
  technicalCompetencies: string[];
  industrySkillIds: string[];
  careerIds: string[];
  source: string;
  reviewStatus: 'Verified' | 'Pending Review';
  createdByUserId: string | null;
}

export interface AgentRunLog {
  id: string;
  userId: string;
  triggerEvent: string;
  agentsInvoked: AgentName[];
  status: AgentRunStatus;
  summary: string;
  payloadJson: string;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

export interface DailyChallenge {
  id: string;
  title: string;
  category:
    | 'Predict Code Output'
    | 'Find Bugs'
    | 'Complete Missing Code'
    | 'Solve SQL Queries'
    | 'Identify Algorithms'
    | 'Technical MCQs'
    | 'Logical Reasoning';
  skillId: string;
  estimatedMinutes: number;
  xpReward: number;
  question: AssessmentQuestion;
}

export interface BossChallenge {
  id: string;
  title: string;
  skillId: string;
  difficulty: 'Apprentice' | 'Builder' | 'Engineer';
  estimatedHours: number;
  xpReward: number;
  description: string;
  requirements: string[];
  rubricCriteria: { id: string; label: string; weight: number }[];
}

export interface CareerQuestMission {
  id: string;
  careerId: string;
  orderIndex: number;
  title: string;
  objective: string;
  targetSkillId: string;
  prerequisites: string[];
  resourceTitle: string;
  resourceUrl: string;
  practicalExercise: string;
  completionCriteria: string;
  estimatedMinutes: number;
  xpReward: number;
}
