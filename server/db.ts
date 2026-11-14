import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {
  CAREERS_CATALOG,
  DEFAULT_ACADEMIC_MAPPINGS,
  findResourceForSkill,
} from '../src/data/catalog';
import {
  determineRoadmapStepStatus,
  validateDependencyGraph,
} from '../src/core/dependencies';
import type {
  AcademicDomainId,
  AcademicMapping,
  AgentRunLog,
  AssessmentAttempt,
  EntryAssessmentResult,
  EntrySkillLevel,
  LearnerProfile,
  LearnerSkill,
  RoadmapStep,
  SkillEvidence,
} from '../src/core/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'nexora.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learner_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      institution TEXT NOT NULL DEFAULT '',
      degree TEXT NOT NULL DEFAULT '',
      academic_year TEXT NOT NULL DEFAULT '',
      field_of_study TEXT NOT NULL DEFAULT '',
      subjects_json TEXT NOT NULL DEFAULT '[]',
      academic_topics_json TEXT NOT NULL DEFAULT '[]',
      certifications_json TEXT NOT NULL DEFAULT '[]',
      academic_projects_json TEXT NOT NULL DEFAULT '[]',
      technical_interests_json TEXT NOT NULL DEFAULT '[]',
      target_career_id TEXT NOT NULL DEFAULT 'full-stack-developer',
      secondary_career_ids_json TEXT NOT NULL DEFAULT '[]',
      career_objectives TEXT NOT NULL DEFAULT '',
      weekly_hours INTEGER NOT NULL DEFAULT 8,
      preferred_format TEXT NOT NULL DEFAULT 'Interactive & Practice',
      preferred_language TEXT NOT NULL DEFAULT 'English',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      privacy_leaderboard_opt_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learner_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      category TEXT NOT NULL,
      evidence_state TEXT NOT NULL DEFAULT 'Unassessed',
      proficiency INTEGER NOT NULL DEFAULT 0,
      declared_level TEXT NOT NULL DEFAULT 'Not Listed',
      last_assessed_at TEXT,
      needs_reassessment INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, skill_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skill_evidence (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      artifact_url TEXT,
      score_percent INTEGER,
      verified_by TEXT NOT NULL,
      resulting_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS competency_mappings (
      id TEXT PRIMARY KEY,
      subject_name TEXT NOT NULL,
      learning_outcomes_json TEXT NOT NULL,
      technical_competencies_json TEXT NOT NULL,
      industry_skill_ids_json TEXT NOT NULL,
      career_ids_json TEXT NOT NULL,
      source TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'Pending Review',
      created_by_user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roadmaps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      career_id TEXT NOT NULL,
      title TEXT NOT NULL,
      weekly_hours INTEGER NOT NULL DEFAULT 8,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, career_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roadmap_steps (
      id TEXT PRIMARY KEY,
      roadmap_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      phase_number INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      learning_objective TEXT NOT NULL,
      prerequisites_json TEXT NOT NULL,
      resource_id TEXT,
      resource_title TEXT NOT NULL,
      resource_url TEXT NOT NULL,
      practice_exercise TEXT NOT NULL,
      assessment_id TEXT,
      estimated_minutes INTEGER NOT NULL,
      completion_criteria TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      is_remedial INTEGER NOT NULL DEFAULT 0,
      learn_completed INTEGER NOT NULL DEFAULT 0,
      practice_completed INTEGER NOT NULL DEFAULT 0,
      assess_completed INTEGER NOT NULL DEFAULT 0,
      demonstrate_completed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      score_percent INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      weak_concepts_json TEXT NOT NULL,
      adaptive_decision TEXT NOT NULL,
      practical_notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      agents_invoked_json TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_interactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      hint_level INTEGER NOT NULL DEFAULT 1,
      context_skill_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      event_key TEXT NOT NULL,
      xp_amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, event_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS challenge_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      category TEXT NOT NULL,
      passed INTEGER NOT NULL,
      submitted_answer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quest_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      career_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      completed_at TEXT NOT NULL,
      UNIQUE (user_id, quest_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learner_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      awarded_at TEXT NOT NULL,
      UNIQUE (user_id, achievement_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_streaks (
      user_id TEXT PRIMARY KEY,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      activity_dates_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      repo_url TEXT,
      description TEXT NOT NULL,
      detected_stack_json TEXT NOT NULL DEFAULT '[]',
      review_status TEXT NOT NULL DEFAULT 'Pending Review',
      reviewer_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS readiness_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      career_id TEXT NOT NULL,
      readiness_score INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      redirect_origin TEXT NOT NULL,
      handoff_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_handoffs (
      handoff_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      session_token TEXT,
      error_message TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entry_assessment_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      course_name TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topic_performance (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      subject_tag TEXT NOT NULL,
      score_percent INTEGER NOT NULL,
      level TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, domain_id, subject_tag),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_skills_user ON learner_skills(user_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_user ON skill_evidence(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON assessment_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_entry_sessions_user ON entry_assessment_sessions(user_id);
  `);

  // Idempotent column migrations for existing databases
  ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'auth_provider', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn('users', 'provider_subject', 'TEXT');

  ensureColumn('learner_profiles', 'onboarding_step', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('learner_profiles', 'domain_id', "TEXT NOT NULL DEFAULT 'engineering'");
  ensureColumn('learner_profiles', 'course_id', "TEXT NOT NULL DEFAULT 'eng-cse'");
  ensureColumn('learner_profiles', 'course_name', "TEXT NOT NULL DEFAULT 'Computer Science Engineering'");
  ensureColumn('learner_profiles', 'specialization', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('learner_profiles', 'education_level', "TEXT NOT NULL DEFAULT 'Undergraduate'");
  ensureColumn('learner_profiles', 'semester_stage', "TEXT NOT NULL DEFAULT 'Year 3'");
  ensureColumn('learner_profiles', 'previous_background', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('learner_profiles', 'graduation_year', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('learner_profiles', 'learning_goals_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('learner_profiles', 'primary_goal', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('oauth_states', 'handoff_id', 'TEXT');
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function getLearnerProfile(userId: string): LearnerProfile | null {
  const row = db
    .prepare(
      `SELECT u.id as user_id, u.email, u.email_verified, u.auth_provider, u.role, u.is_demo, p.*
       FROM users u
       JOIN learner_profiles p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    email: String(row.email),
    emailVerified: Boolean(row.email_verified),
    authProvider: (row.auth_provider as LearnerProfile['authProvider']) || 'local',
    role: row.role === 'admin' ? 'admin' : 'student',
    isDemo: Boolean(row.is_demo),
    onboardingCompleted: Boolean(row.onboarding_completed),
    onboardingStep: Number(row.onboarding_step || 1),
    domainId: (row.domain_id as AcademicDomainId) || 'engineering',
    courseId: String(row.course_id || 'eng-cse'),
    courseName: String(row.course_name || 'Computer Science Engineering'),
    specialization: String(row.specialization || ''),
    educationLevel: String(row.education_level || 'Undergraduate'),
    semesterStage: String(row.semester_stage || row.academic_year || 'Year 3'),
    previousBackground: String(row.previous_background || ''),
    graduationYear: String(row.graduation_year || ''),
    learningGoals: JSON.parse(String(row.learning_goals_json || '[]')),
    primaryGoal: String(row.primary_goal || ''),
    institution: String(row.institution),
    degree: String(row.degree),
    academicYear: String(row.academic_year),
    fieldOfStudy: String(row.field_of_study),
    subjects: JSON.parse(String(row.subjects_json || '[]')),
    academicTopics: JSON.parse(String(row.academic_topics_json || '[]')),
    certifications: JSON.parse(String(row.certifications_json || '[]')),
    academicProjects: JSON.parse(String(row.academic_projects_json || '[]')),
    technicalInterests: JSON.parse(String(row.technical_interests_json || '[]')),
    targetCareerId: String(row.target_career_id),
    secondaryCareerIds: JSON.parse(String(row.secondary_career_ids_json || '[]')),
    careerObjectives: String(row.career_objectives),
    weeklyHours: Number(row.weekly_hours || 8),
    preferredFormat: (row.preferred_format as LearnerProfile['preferredFormat']) || 'Interactive & Practice',
    preferredLanguage: String(row.preferred_language || 'English'),
    timezone: String(row.timezone || 'UTC'),
    privacyLeaderboardOptIn: Boolean(row.privacy_leaderboard_opt_in),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function getLatestEntryAssessment(userId: string): EntryAssessmentResult | null {
  const row = db
    .prepare(
      `SELECT result_json FROM entry_assessment_sessions
       WHERE user_id = ? AND status = 'COMPLETED' AND result_json IS NOT NULL
       ORDER BY completed_at DESC LIMIT 1`
    )
    .get(userId) as { result_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.result_json) as EntryAssessmentResult;
  } catch {
    return null;
  }
}

export function upsertTopicPerformance(
  userId: string,
  domainId: AcademicDomainId,
  subjectTag: string,
  scorePercent: number,
  level: EntrySkillLevel
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO topic_performance (id, user_id, domain_id, subject_tag, score_percent, level, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, domain_id, subject_tag) DO UPDATE SET
       score_percent = excluded.score_percent,
       level = excluded.level,
       updated_at = excluded.updated_at`
  ).run(`tp-${crypto.randomUUID()}`, userId, domainId, subjectTag, scorePercent, level, now);
}

export function getLearnerSkills(userId: string): LearnerSkill[] {
  const rows = db
    .prepare(`SELECT * FROM learner_skills WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    skillId: String(r.skill_id),
    skillName: String(r.skill_name),
    category: r.category as LearnerSkill['category'],
    evidenceState: r.evidence_state as LearnerSkill['evidenceState'],
    proficiency: Number(r.proficiency) as LearnerSkill['proficiency'],
    declaredLevel: r.declared_level as LearnerSkill['declaredLevel'],
    lastAssessedAt: r.last_assessed_at ? String(r.last_assessed_at) : null,
    needsReassessment: Boolean(r.needs_reassessment),
    updatedAt: String(r.updated_at),
  }));
}

export function getSkillEvidence(userId: string): SkillEvidence[] {
  const rows = db
    .prepare(`SELECT * FROM skill_evidence WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    skillId: String(r.skill_id),
    evidenceType: r.evidence_type as SkillEvidence['evidenceType'],
    title: String(r.title),
    description: String(r.description),
    artifactUrl: r.artifact_url ? String(r.artifact_url) : null,
    scorePercent: r.score_percent !== null && r.score_percent !== undefined ? Number(r.score_percent) : null,
    verifiedBy: String(r.verified_by),
    resultingState: r.resulting_state as SkillEvidence['resultingState'],
    createdAt: String(r.created_at),
  }));
}

export function getAssessmentAttempts(userId: string): AssessmentAttempt[] {
  const rows = db
    .prepare(`SELECT * FROM assessment_attempts WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    skillId: String(r.skill_id),
    skillName: String(r.skill_name),
    scorePercent: Number(r.score_percent),
    correctCount: Number(r.correct_count),
    totalCount: Number(r.total_count),
    weakConcepts: JSON.parse(String(r.weak_concepts_json || '[]')),
    adaptiveDecision: r.adaptive_decision as AssessmentAttempt['adaptiveDecision'],
    practicalNotes: r.practical_notes ? String(r.practical_notes) : undefined,
    createdAt: String(r.created_at),
  }));
}

export function getAgentRuns(userId: string): AgentRunLog[] {
  const rows = db
    .prepare(`SELECT * FROM agent_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`)
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    triggerEvent: String(r.trigger_event),
    agentsInvoked: JSON.parse(String(r.agents_invoked_json || '[]')),
    status: r.status as AgentRunLog['status'],
    summary: String(r.summary),
    payloadJson: String(r.payload_json),
    errorMessage: r.error_message ? String(r.error_message) : null,
    durationMs: Number(r.duration_ms || 0),
    createdAt: String(r.created_at),
  }));
}

export function getAcademicMappings(): AcademicMapping[] {
  const rows = db
    .prepare(`SELECT * FROM competency_mappings ORDER BY review_status ASC, subject_name ASC`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    subjectName: String(r.subject_name),
    learningOutcomes: JSON.parse(String(r.learning_outcomes_json)),
    technicalCompetencies: JSON.parse(String(r.technical_competencies_json)),
    industrySkillIds: JSON.parse(String(r.industry_skill_ids_json)),
    careerIds: JSON.parse(String(r.career_ids_json)),
    source: String(r.source),
    reviewStatus: r.review_status as AcademicMapping['reviewStatus'],
    createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
  }));
}

export function generateOrSyncRoadmapForUser(
  userId: string,
  careerId: string,
  remedialInsert?: { skillId: string; weakConcepts: string[] }
): { roadmapId: string; steps: RoadmapStep[] } {
  const career = CAREERS_CATALOG.find((c) => c.id === careerId) ?? CAREERS_CATALOG[0];
  const profile = getLearnerProfile(userId);
  const learnerSkills = getLearnerSkills(userId);
  const now = new Date().toISOString();

  const existingRoadmap = db
    .prepare(`SELECT * FROM roadmaps WHERE user_id = ? AND career_id = ?`)
    .get(userId, career.id) as Record<string, unknown> | undefined;

  const roadmapId = existingRoadmap ? String(existingRoadmap.id) : `rm-${crypto.randomUUID()}`;
  const weeklyHours = profile?.weeklyHours ?? 8;

  if (!existingRoadmap) {
    db.prepare(
      `INSERT INTO roadmaps (id, user_id, career_id, title, weekly_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(roadmapId, userId, career.id, `${career.title} Adaptive Roadmap`, weeklyHours, now, now);
  } else {
    db.prepare(`UPDATE roadmaps SET weekly_hours = ?, updated_at = ? WHERE id = ?`).run(
      weeklyHours,
      now,
      roadmapId
    );
  }

  const existingStepsRaw = db
    .prepare(`SELECT * FROM roadmap_steps WHERE roadmap_id = ? ORDER BY order_index ASC`)
    .all(roadmapId) as Record<string, unknown>[];

  const existingBySkill = new Map<string, Record<string, unknown>>();
  for (const st of existingStepsRaw) {
    if (!Number(st.is_remedial)) {
      existingBySkill.set(String(st.skill_id), st);
    }
  }

  // Validate prerequisite DAG and derive topological ordering
  const dag = validateDependencyGraph(
    career.requirements.map((r) => ({ skillId: r.skillId, prerequisites: r.prerequisites }))
  );
  const orderedIds = dag.valid
    ? dag.orderedSkillIds
    : career.requirements.map((r) => r.skillId);

  const reqMap = new Map(career.requirements.map((r) => [r.skillId, r]));
  const orderedReqs = orderedIds
    .map((id) => reqMap.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  // Track completed skills from existing steps or demonstrated proficiency
  const completedSkillIds = new Set<string>();
  for (const sk of learnerSkills) {
    const req = reqMap.get(sk.skillId);
    if (
      req &&
      (sk.evidenceState === 'Demonstrated' || sk.evidenceState === 'Validated') &&
      sk.proficiency >= req.requiredProficiency
    ) {
      completedSkillIds.add(sk.skillId);
    }
  }
  for (const st of existingStepsRaw) {
    if (st.status === 'COMPLETED') {
      completedSkillIds.add(String(st.skill_id));
    }
  }

  // Preserve remedial steps if any, and optionally insert a new remedial step
  const existingRemedials = existingStepsRaw.filter((st) => Number(st.is_remedial) === 1);

  db.prepare(`DELETE FROM roadmap_steps WHERE roadmap_id = ?`).run(roadmapId);

  let orderIdx = 1;
  for (let i = 0; i < orderedReqs.length; i += 1) {
    const req = orderedReqs[i];
    const prev = existingBySkill.get(req.skillId);
    const resource = findResourceForSkill(req.skillId);
    const phaseNumber = Math.min(4, Math.floor((i * 4) / Math.max(1, orderedReqs.length)) + 1);

    let status = determineRoadmapStepStatus(
      req,
      learnerSkills,
      completedSkillIds,
      prev?.status as RoadmapStep['status'] | undefined
    );

    if (remedialInsert && remedialInsert.skillId === req.skillId) {
      status = 'NEEDS_REVISION';
    }

    // Insert any active remedial revision steps immediately BEFORE their target skill
    for (const rem of existingRemedials) {
      if (String(rem.skill_id) === req.skillId) {
        if (remedialInsert && remedialInsert.skillId === req.skillId) {
          continue; // replace with updated remedial
        }
        db.prepare(
          `INSERT INTO roadmap_steps (
            id, roadmap_id, skill_id, skill_name, phase_number, order_index,
            learning_objective, prerequisites_json, resource_id, resource_title, resource_url,
            practice_exercise, assessment_id, estimated_minutes, completion_criteria, status,
            is_remedial, learn_completed, practice_completed, assess_completed, demonstrate_completed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
        ).run(
          String(rem.id),
          roadmapId,
          String(rem.skill_id),
          String(rem.skill_name),
          phaseNumber,
          orderIdx++,
          String(rem.learning_objective),
          String(rem.prerequisites_json),
          rem.resource_id ? String(rem.resource_id) : null,
          String(rem.resource_title),
          String(rem.resource_url),
          String(rem.practice_exercise),
          rem.assessment_id ? String(rem.assessment_id) : null,
          Number(rem.estimated_minutes),
          String(rem.completion_criteria),
          String(rem.status),
          Number(rem.learn_completed),
          Number(rem.practice_completed),
          Number(rem.assess_completed),
          Number(rem.demonstrate_completed)
        );
      }
    }

    if (remedialInsert && remedialInsert.skillId === req.skillId) {
      const conceptsLabel = remedialInsert.weakConcepts.join(', ') || 'Core Fundamentals';
      db.prepare(
        `INSERT INTO roadmap_steps (
          id, roadmap_id, skill_id, skill_name, phase_number, order_index,
          learning_objective, prerequisites_json, resource_id, resource_title, resource_url,
          practice_exercise, assessment_id, estimated_minutes, completion_criteria, status,
          is_remedial, learn_completed, practice_completed, assess_completed, demonstrate_completed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_STARTED', 1, 0, 0, 0, 0)`
      ).run(
        `rem-${crypto.randomUUID()}`,
        roadmapId,
        req.skillId,
        `${req.skillName} Remedial Revision`,
        phaseNumber,
        orderIdx++,
        `Targeted revision on weak concepts: ${conceptsLabel}`,
        JSON.stringify([]),
        resource.id,
        resource.title,
        resource.url,
        `Review ${conceptsLabel} with AI Mentor progressive hints, then complete 3 targeted drills.`,
        `assess-${req.skillId}`,
        60,
        `Score >= 60% on reassessment to clear ${req.skillName} revision block.`,
      );
    }

    const stepId = prev ? String(prev.id) : `step-${crypto.randomUUID()}`;
    const learnCompleted = prev ? Number(prev.learn_completed) : status === 'COMPLETED' ? 1 : 0;
    const practiceCompleted = prev ? Number(prev.practice_completed) : status === 'COMPLETED' ? 1 : 0;
    const assessCompleted = prev ? Number(prev.assess_completed) : status === 'COMPLETED' ? 1 : 0;
    const demonstrateCompleted = prev ? Number(prev.demonstrate_completed) : status === 'COMPLETED' ? 1 : 0;

    db.prepare(
      `INSERT INTO roadmap_steps (
        id, roadmap_id, skill_id, skill_name, phase_number, order_index,
        learning_objective, prerequisites_json, resource_id, resource_title, resource_url,
        practice_exercise, assessment_id, estimated_minutes, completion_criteria, status,
        is_remedial, learn_completed, practice_completed, assess_completed, demonstrate_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).run(
      stepId,
      roadmapId,
      req.skillId,
      req.skillName,
      phaseNumber,
      orderIdx++,
      req.practicalExpectation,
      JSON.stringify(req.prerequisites),
      resource.id,
      resource.title,
      resource.url,
      `Apply ${req.skillName} in a focused exercise: ${req.practicalExpectation}`,
      `assess-${req.skillId}`,
      resource.estimatedMinutes,
      `Demonstrate ${req.skillName} to level ${req.requiredProficiency}/5 via assessment (>= 85%) or practical evidence.`,
      status,
      learnCompleted,
      practiceCompleted,
      assessCompleted,
      demonstrateCompleted
    );
  }

  return getRoadmapForUser(userId, career.id);
}

export function getRoadmapForUser(
  userId: string,
  careerId: string
): { roadmapId: string; steps: RoadmapStep[] } {
  const rm = db
    .prepare(`SELECT * FROM roadmaps WHERE user_id = ? AND career_id = ?`)
    .get(userId, careerId) as Record<string, unknown> | undefined;
  if (!rm) {
    return generateOrSyncRoadmapForUser(userId, careerId);
  }
  const rows = db
    .prepare(`SELECT * FROM roadmap_steps WHERE roadmap_id = ? ORDER BY order_index ASC`)
    .all(String(rm.id)) as Record<string, unknown>[];

  return {
    roadmapId: String(rm.id),
    steps: rows.map((r) => ({
      id: String(r.id),
      roadmapId: String(r.roadmap_id),
      skillId: String(r.skill_id),
      skillName: String(r.skill_name),
      phaseNumber: Number(r.phase_number),
      orderIndex: Number(r.order_index),
      learningObjective: String(r.learning_objective),
      prerequisites: JSON.parse(String(r.prerequisites_json || '[]')),
      resourceId: r.resource_id ? String(r.resource_id) : null,
      resourceTitle: String(r.resource_title),
      resourceUrl: String(r.resource_url),
      practiceExercise: String(r.practice_exercise),
      assessmentId: r.assessment_id ? String(r.assessment_id) : null,
      estimatedMinutes: Number(r.estimated_minutes),
      completionCriteria: String(r.completion_criteria),
      status: r.status as RoadmapStep['status'],
      isRemedial: Boolean(r.is_remedial),
      learnCompleted: Boolean(r.learn_completed),
      practiceCompleted: Boolean(r.practice_completed),
      assessCompleted: Boolean(r.assess_completed),
      demonstrateCompleted: Boolean(r.demonstrate_completed),
    })),
  };
}

export function seedInitialData() {
  const now = new Date().toISOString();

  // Seed default verified academic mappings if empty
  const mappingCount = (db.prepare(`SELECT COUNT(*) as c FROM competency_mappings`).get() as { c: number }).c;
  if (mappingCount === 0) {
    const insertMapping = db.prepare(
      `INSERT INTO competency_mappings (
        id, subject_name, learning_outcomes_json, technical_competencies_json,
        industry_skill_ids_json, career_ids_json, source, review_status, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const m of DEFAULT_ACADEMIC_MAPPINGS) {
      insertMapping.run(
        m.id,
        m.subjectName,
        JSON.stringify(m.learningOutcomes),
        JSON.stringify(m.technicalCompetencies),
        JSON.stringify(m.industrySkillIds),
        JSON.stringify(m.careerIds),
        m.source,
        m.reviewStatus,
        m.createdByUserId,
        now
      );
    }
  }

  // Seed clearly labeled demo learner (Section 27 Scenario)
  const demoUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get('demo@nexora.edu') as
    | { id: string }
    | undefined;
  if (!demoUser) {
    const demoId = 'user-demo-aabid';
    const { hash, salt } = hashPassword('DemoPass123!');
    db.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, role, is_demo, created_at)
       VALUES (?, ?, ?, ?, 'student', 1, ?)`
    ).run(demoId, 'demo@nexora.edu', hash, salt, now);

    db.prepare(
      `INSERT INTO learner_profiles (
        user_id, display_name, onboarding_completed, institution, degree, academic_year,
        field_of_study, subjects_json, academic_topics_json, certifications_json,
        academic_projects_json, technical_interests_json, target_career_id,
        secondary_career_ids_json, career_objectives, weekly_hours, preferred_format,
        preferred_language, timezone, privacy_leaderboard_opt_in, created_at, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 8, 'Interactive & Practice', 'English', 'UTC', 1, ?, ?)`
    ).run(
      demoId,
      'Aabid Rahman',
      'National Institute of Engineering',
      'B.Tech Computer Science',
      'Year 3',
      'Computer Science & Engineering',
      JSON.stringify(['Database Management Systems (DBMS)', 'Object-Oriented Programming (OOP)', 'Web Technologies']),
      JSON.stringify(['Relational Normalization', 'RESTful Design', 'Async JavaScript']),
      JSON.stringify(['Foundational Python Scripting']),
      JSON.stringify(['Python Student Gradebook CLI']),
      JSON.stringify(['Full Stack Web Systems', 'Analytical Dashboards']),
      'full-stack-developer',
      JSON.stringify(['data-analyst']),
      'Build production-ready web systems and prove core full-stack competencies before internship interviews.',
      now,
      now
    );

    // Seed Section 27 Demo Learner Skills:
    // - Declared skills: SQL and HTML (must remain Declared with D=0 until assessed)
    // - Demonstrated skill: Python, supported by a practical project
    const insertSkill = db.prepare(
      `INSERT INTO learner_skills (
        id, user_id, skill_id, skill_name, category, evidence_state, proficiency,
        declared_level, last_assessed_at, needs_reassessment, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );

    insertSkill.run('sk-demo-py', demoId, 'python', 'Python', 'Language', 'Demonstrated', 3, 'Intermediate', now, now);
    insertSkill.run('sk-demo-sql', demoId, 'sql', 'SQL', 'Database', 'Declared', 0, 'Intermediate', null, now);
    insertSkill.run('sk-demo-html', demoId, 'html', 'HTML', 'Frontend', 'Declared', 0, 'Beginner', null, now);

    db.prepare(
      `INSERT INTO skill_evidence (
        id, user_id, skill_id, evidence_type, title, description, artifact_url,
        score_percent, verified_by, resulting_state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'ev-demo-py-proj',
      demoId,
      'python',
      'PROJECT',
      'Python Student Gradebook & CSV Analytics CLI',
      'Seeded demo artifact: Modular Python CLI with automated unit tests parsing CSV transcripts and computing GPA distributions.',
      'https://github.com/nexora-demo/python-gradebook-cli',
      92,
      'Skill Auditor Rubric',
      'Demonstrated',
      now
    );

    db.prepare(
      `INSERT INTO project_submissions (
        id, user_id, title, skill_id, repo_url, description, detected_stack_json,
        review_status, reviewer_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?)`
    ).run(
      'proj-demo-py',
      demoId,
      'Python Student Gradebook & CSV Analytics CLI',
      'python',
      'https://github.com/nexora-demo/python-gradebook-cli',
      'Seeded practical project supporting Demonstrated Python (3/5) evidence.',
      JSON.stringify(['Python 3.12', 'pytest', 'csv', 'argparse']),
      'Verified modular error handling and test coverage.',
      now
    );

    db.prepare(
      `INSERT INTO xp_transactions (id, user_id, activity_type, event_key, xp_amount, description, created_at)
       VALUES (?, ?, 'PROJECT_SUBMITTED', 'seed:demo:py-proj', 140, 'Seeded Demo: Python Practical Project Submitted', ?)`
    ).run('xp-demo-1', demoId, now);

    db.prepare(
      `INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date, activity_dates_json)
       VALUES (?, 1, 1, ?, ?)`
    ).run(demoId, now.slice(0, 10), JSON.stringify([now.slice(0, 10)]));

    db.prepare(
      `INSERT INTO agent_runs (id, user_id, trigger_event, agents_invoked_json, status, summary, payload_json, error_message, duration_ms, created_at)
       VALUES (?, ?, 'SEED_DEMO_PROFILE', ?, 'COMPLETED', ?, ?, NULL, 120, ?)`
    ).run(
      'run-demo-seed',
      demoId,
      JSON.stringify(['SKILL_AUDITOR', 'CAREER_ARCHITECT', 'LEARNING_STRATEGIST']),
      'Seeded demo learner audited: Python is Demonstrated (3/5 via practical project); SQL & HTML are Declared and awaiting diagnostic evidence.',
      JSON.stringify({ demoSeeded: true }),
      now
    );

    generateOrSyncRoadmapForUser(demoId, 'full-stack-developer');
  }

  // Ensure demo user has verified email and completed onboarding metadata on existing DBs
  db.prepare(`UPDATE users SET email_verified = 1 WHERE email = 'demo@nexora.edu'`).run();
  db.prepare(
    `UPDATE learner_profiles
     SET onboarding_step = 5, domain_id = 'engineering', course_id = 'eng-cse', course_name = 'Computer Science Engineering',
         education_level = COALESCE(NULLIF(education_level, ''), 'Undergraduate'),
         semester_stage = COALESCE(NULLIF(semester_stage, ''), 'Year 3'),
         primary_goal = COALESCE(NULLIF(primary_goal, ''), 'Career Switch / Job Preparation')
     WHERE user_id = 'user-demo-aabid'`
  ).run();

  // Seed anonymized cohort learner (used ONLY for aggregate institutional metrics)
  const cohortUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get('cohort-agg@nexora.edu') as
    | { id: string }
    | undefined;
  if (!cohortUser) {
    const cid = 'user-cohort-sample-2';
    const { hash, salt } = hashPassword(crypto.randomBytes(16).toString('hex'));
    db.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, role, is_demo, created_at)
       VALUES (?, ?, ?, ?, 'admin', 1, ?)`
    ).run(cid, 'cohort-agg@nexora.edu', hash, salt, now);
    db.prepare(
      `INSERT INTO learner_profiles (
        user_id, display_name, onboarding_completed, institution, degree, academic_year,
        field_of_study, target_career_id, weekly_hours, privacy_leaderboard_opt_in, created_at, updated_at
      ) VALUES (?, 'Maya Lin (Cohort Sample)', 1, 'National Institute of Engineering', 'B.S. Data Science', 'Year 4', 'Data Science', 'data-analyst', 10, 1, ?, ?)`
    ).run(cid, now, now);
    db.prepare(
      `INSERT INTO learner_skills (id, user_id, skill_id, skill_name, category, evidence_state, proficiency, declared_level, updated_at)
       VALUES ('sk-coh-sql', ?, 'sql', 'SQL', 'Database', 'Validated', 4, 'Advanced', ?),
              ('sk-coh-py', ?, 'python', 'Python', 'Language', 'Demonstrated', 3, 'Intermediate', ?)`
    ).run(cid, now, cid, now);
    db.prepare(
      `INSERT INTO xp_transactions (id, user_id, activity_type, event_key, xp_amount, description, created_at)
       VALUES ('xp-coh-1', ?, 'MISSION_COMPLETE', 'seed:coh:1', 320, 'Cohort sample engagement', ?)`
    ).run(cid, now);
  }
}

runMigrations();
seedInitialData();
