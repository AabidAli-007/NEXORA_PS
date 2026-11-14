import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE_URL = 'http://localhost:3000';

async function apiReq(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: resp.status, data };
}

test('unauthenticated requests to protected endpoints fail with 401', async () => {
  const dash = await apiReq('/api/dashboard');
  assert.equal(dash.status, 401);
  const inst = await apiReq('/api/institutional/analytics');
  assert.equal(inst.status, 401);
});

test('full end-to-end learner journey, isolation, readiness, assessments, play, and security', async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const emailA = `learner.a.${suffix}@nexora.test`;
  const emailB = `learner.b.${suffix}@nexora.test`;

  // 1. Register Learner A
  const regA = await apiReq('/api/auth/register', {
    method: 'POST',
    body: {
      email: emailA,
      password: 'Password123!',
      displayName: 'Test Learner A',
    },
  });
  assert.equal(regA.status, 201);
  const tokenA = regA.data.token as string;
  assert.ok(tokenA);

  // 2. Onboarding with Declared skills (must stay Declared with proficiency 0 -> readiness 0)
  const onboardA = await apiReq('/api/profile/onboarding', {
    method: 'PUT',
    token: tokenA,
    body: {
      displayName: 'Test Learner A',
      institution: 'State Tech University',
      degree: 'B.S. Computer Science',
      academicYear: 'Junior',
      fieldOfStudy: 'Software Engineering',
      subjects: ['Database Management Systems', 'Web Development'],
      declaredSkills: [
        { skillId: 'sql', skillName: 'SQL', category: 'Database', declaredLevel: 'Intermediate' },
        { skillId: 'html', skillName: 'HTML', category: 'Frontend', declaredLevel: 'Beginner' },
      ],
      targetCareerId: 'full-stack-developer',
      weeklyHours: 8,
      preferredFormat: 'Interactive & Practice',
      timezone: 'UTC',
    },
  });
  assert.equal(onboardA.status, 200);
  const dashAfterOnboard = onboardA.data.dashboard;
  assert.equal(dashAfterOnboard.readiness.readinessScore, 0);
  const sqlSkill = dashAfterOnboard.skills.find((s: any) => s.skillId === 'sql');
  assert.equal(sqlSkill.evidenceState, 'Declared');
  assert.equal(sqlSkill.proficiency, 0);

  // 3. Register Learner B and verify row-level isolation on Learner A's roadmap step
  const regB = await apiReq('/api/auth/register', {
    method: 'POST',
    body: {
      email: emailB,
      password: 'Password123!',
      displayName: 'Test Learner B',
    },
  });
  assert.equal(regB.status, 201);
  const tokenB = regB.data.token as string;

  const firstStepIdA = dashAfterOnboard.roadmap.steps[0].id as string;
  const crossAccess = await apiReq(`/api/roadmap/steps/${firstStepIdA}`, {
    method: 'PATCH',
    token: tokenB,
    body: { learnCompleted: true },
  });
  assert.equal(crossAccess.status, 404);

  // 4. Circular dependency rejection (422)
  const cycleRes = await apiReq('/api/dependencies/validate', {
    method: 'POST',
    token: tokenA,
    body: {
      edges: [
        { skillId: 'javascript', prerequisites: ['react'] },
        { skillId: 'react', prerequisites: ['javascript'] },
      ],
    },
  });
  assert.equal(cycleRes.status, 422);
  assert.equal(cycleRes.data.valid, false);

  // 5. Poor SQL Assessment (<60%) -> REMEDIAL_REQUIRED & remedial roadmap step inserted
  const sqlQuiz = await apiReq('/api/assessments/sql', { token: tokenA });
  assert.equal(sqlQuiz.status, 200);
  assert.ok(sqlQuiz.data.questions.length >= 3);
  assert.equal(sqlQuiz.data.questions[0].correctAnswer, undefined);

  const wrongAnswers = sqlQuiz.data.questions.map((q: any) => ({
    questionId: q.id,
    answer: 'DEFINITELY_WRONG_ANSWER_XYZ',
  }));
  const poorSubmit = await apiReq('/api/assessments/sql/submit', {
    method: 'POST',
    token: tokenA,
    body: { answers: wrongAnswers },
  });
  assert.equal(poorSubmit.status, 200);
  assert.equal(poorSubmit.data.evaluation.scorePercent, 0);
  assert.equal(poorSubmit.data.evaluation.adaptiveDecision, 'REMEDIAL_REQUIRED');
  const remedialSteps = poorSubmit.data.dashboard.roadmap.steps.filter(
    (s: any) => s.skillId === 'sql' && s.isRemedial
  );
  assert.ok(remedialSteps.length >= 1, 'Remedial step should be inserted on poor assessment');
  const mainSqlStep = poorSubmit.data.dashboard.roadmap.steps.find(
    (s: any) => s.skillId === 'sql' && !s.isRemedial
  );
  assert.ok(mainSqlStep && remedialSteps[0].orderIndex < mainSqlStep.orderIndex);

  // 6. AI Mentor chat (either live 200 Gemini reply or honest 502/503/504/429 error with no fake fallback stored)
  const historyBefore = await apiReq('/api/mentor/history', { token: tokenA });
  assert.equal(historyBefore.status, 200);
  const mentorRes = await apiReq('/api/mentor/chat', {
    method: 'POST',
    token: tokenA,
    body: {
      message: 'I scored 0% on SQL joins and aggregation. What should I study first?',
      hintLevel: 4,
      contextSkillId: 'sql',
    },
  });
  assert.ok([200, 429, 502, 503, 504].includes(mentorRes.status));
  const historyRes = await apiReq('/api/mentor/history', { token: tokenA });
  assert.equal(historyRes.status, 200);
  if (mentorRes.status === 200) {
    assert.equal(mentorRes.data.usedAi, true);
    assert.ok(typeof mentorRes.data.reply === 'string' && mentorRes.data.reply.length > 20);
    assert.equal(historyRes.data.messages.length, historyBefore.data.messages.length + 2);
  } else {
    assert.ok(typeof mentorRes.data.error === 'string' && mentorRes.data.error.length > 10);
    assert.equal(historyRes.data.messages.length, historyBefore.data.messages.length);
  }

  // 7. Reassess SQL with 100% correct answers (>= 85% PROGRESSION_ELIGIBLE) -> clears remedial & raises readiness > 0
  const sqlPass = await apiReq('/api/assessments/sql/submit', {
    method: 'POST',
    token: tokenA,
    body: {
      answers: [
        {
          questionId: 'sql-q1',
          answer:
            'SELECT l.name, COUNT(s.id) FROM learners l LEFT JOIN learner_skills s ON l.id = s.user_id GROUP BY l.id, l.name;',
        },
        {
          questionId: 'sql-q2',
          answer: 'To separate SQL syntax from user-supplied data values and prevent SQL injection',
        },
        {
          questionId: 'sql-q3',
          answer: 'HAVING',
        },
      ],
    },
  });
  assert.equal(sqlPass.status, 200);
  assert.equal(sqlPass.data.evaluation.scorePercent, 100);
  assert.equal(sqlPass.data.evaluation.adaptiveDecision, 'PROGRESSION_ELIGIBLE');
  assert.ok(sqlPass.data.dashboard.readiness.readinessScore > 0);
  const updatedSql = sqlPass.data.dashboard.skills.find((s: any) => s.skillId === 'sql');
  assert.equal(updatedSql.evidenceState, 'Demonstrated');
  assert.equal(updatedSql.needsReassessment, false);

  // 8. Career switch to Data Analyst preserves Demonstrated SQL skill
  const switchRes = await apiReq('/api/careers/select', {
    method: 'POST',
    token: tokenA,
    body: { careerId: 'data-analyst' },
  });
  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.data.dashboard.career.id, 'data-analyst');
  assert.ok(switchRes.data.dashboard.readiness.readinessScore > 0);
  assert.ok(
    switchRes.data.dashboard.readiness.transferableSkills.some((s: any) => s.skillId === 'sql')
  );

  // 9. NEXORA PLAY: Daily challenge XP once, duplicate prevented, SkillProof unchanged, Quest lock check
  const playBefore = await apiReq('/api/play/state', { token: tokenA });
  assert.equal(playBefore.status, 200);
  const firstDaily = playBefore.data.dailyChallenges[0];
  assert.equal(firstDaily.question.correctAnswer, undefined);

  // Fetch current skill proficiency before daily challenge
  const dashBeforePlay = await apiReq('/api/dashboard', { token: tokenA });
  const sqlProfBefore = dashBeforePlay.data.skills.find((s: any) => s.skillId === 'sql').proficiency;

  // Submit correct answer for daily-js-output ('6,12')
  const daily1 = await apiReq('/api/play/daily/daily-js-output/submit', {
    method: 'POST',
    token: tokenA,
    body: { answer: '6,12' },
  });
  assert.equal(daily1.status, 200);
  assert.equal(daily1.data.passed, true);
  assert.equal(daily1.data.xpResult.awarded, true);
  assert.equal(daily1.data.xpResult.xpAmount, 60);

  // Duplicate submission must NOT award XP again
  const daily1Dup = await apiReq('/api/play/daily/daily-js-output/submit', {
    method: 'POST',
    token: tokenA,
    body: { answer: '6,12' },
  });
  assert.equal(daily1Dup.status, 200);
  assert.equal(daily1Dup.data.xpResult.awarded, false);
  assert.equal(daily1Dup.data.xpResult.xpAmount, 0);

  // SkillProof proficiency must remain unchanged by daily challenge
  const sqlProfAfter = daily1Dup.data.dashboard.skills.find((s: any) => s.skillId === 'sql').proficiency;
  assert.equal(sqlProfAfter, sqlProfBefore);

  // Prerequisite-locked quest must return 409
  const lockedQuest = playBefore.data.quests.find((q: any) => !q.unlocked);
  if (lockedQuest) {
    const questErr = await apiReq(`/api/play/quests/${lockedQuest.id}/complete`, {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(questErr.status, 409);
  }

  // Boss challenge records rubric without claiming execution
  const bossRes = await apiReq('/api/play/boss/boss-js-calc/submit', {
    method: 'POST',
    token: tokenA,
    body: {
      summary: 'Implemented decoupled shunting-yard parser, divide-by-zero checks, and keyboard navigation.',
      checkedCriteriaIds: ['c1', 'c2'],
    },
  });
  assert.equal(bossRes.status, 200);
  assert.match(bossRes.data.executionDisclaimer, /without claiming remote code execution/i);

  // 10. GitHub Repo Analyzer SSRF checks
  for (const badUrl of [
    'http://127.0.0.1:8080/internal/repo',
    'http://localhost:3000/owner/repo',
    'https://evil.example.com/owner/repo',
  ]) {
    const ssrfRes = await apiReq('/api/projects/analyze-github', {
      method: 'POST',
      token: tokenA,
      body: { repoUrl: badUrl, targetSkillId: 'javascript' },
    });
    assert.equal(ssrfRes.status, 400, `Expected 400 for unsafe URL ${badUrl}`);
  }

  const goodRepo = await apiReq('/api/projects/analyze-github', {
    method: 'POST',
    token: tokenA,
    body: { repoUrl: 'https://github.com/vercel/next.js', targetSkillId: 'react' },
  });
  assert.equal(goodRepo.status, 201);
  assert.equal(goodRepo.data.canonicalUrl, 'https://github.com/vercel/next.js');

  // 11. Institutional analytics exposes aggregates only (no email / PII)
  const instRes = await apiReq('/api/institutional/analytics', { token: tokenA });
  assert.equal(instRes.status, 200);
  assert.ok(instRes.data.totalLearners >= 2);
  const serialized = JSON.stringify(instRes.data);
  assert.equal(serialized.includes(emailA), false);
  assert.equal(serialized.includes(emailB), false);
});

test('email verification, password reset, OAuth honest config check, resumable 5-step medical onboarding, and multi-turn mentor', async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `med.learner.${suffix}@nexora.test`;

  // 1. OAuth providers discovery + honest 503 check if unconfigured
  const providers = await apiReq('/api/auth/oauth/providers');
  assert.equal(providers.status, 200);
  assert.equal(typeof providers.data.google.configured, 'boolean');
  assert.equal(typeof providers.data.microsoft.configured, 'boolean');

  if (!providers.data.google.configured) {
    const gUrl = await apiReq('/api/auth/oauth/google/url');
    assert.equal(gUrl.status, 503);
    assert.ok(Array.isArray(gUrl.data.missingEnvVars));
    assert.ok(String(gUrl.data.callbackUrl).includes('/api/auth/oauth/google/callback'));
  }

  // 2. Register + Email Verification
  const reg = await apiReq('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'Password123!',
      displayName: 'Dr. Priya Nair',
      rememberMe: false,
    },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.emailVerified, false);
  const code = reg.data.verificationPreviewCode as string;
  assert.equal(code.length, 6);
  const token = reg.data.token as string;

  const verifyRes = await apiReq('/api/auth/verify-email', {
    method: 'POST',
    token,
    body: { code },
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.data.user.emailVerified, true);

  // 3. Forgot Password + Reset Password
  const forgot = await apiReq('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
  assert.equal(forgot.status, 200);
  const resetToken = forgot.data.resetPreviewToken as string;
  assert.ok(resetToken && resetToken.length > 10);

  const reset = await apiReq('/api/auth/reset-password', {
    method: 'POST',
    body: { token: resetToken, newPassword: 'NewPassword456!' },
  });
  assert.equal(reset.status, 200);
  const freshToken = reset.data.token as string;
  assert.ok(freshToken);

  const loginNew = await apiReq('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'NewPassword456!', rememberMe: true },
  });
  assert.equal(loginNew.status, 200);

  // 4. Resumable 5-step Onboarding in Medical & Healthcare (MBBS)
  const step1 = await apiReq('/api/onboarding/step', {
    method: 'PUT',
    token: freshToken,
    body: {
      onboardingStep: 2,
      domainId: 'medical',
      courseId: 'med-mbbs',
      courseName: 'MBBS',
      specialization: 'Internal Medicine',
    },
  });
  assert.equal(step1.status, 200);
  assert.equal(step1.data.dashboard.profile.domainId, 'medical');
  assert.equal(step1.data.dashboard.profile.onboardingStep, 2);

  const step23 = await apiReq('/api/onboarding/step', {
    method: 'PUT',
    token: freshToken,
    body: {
      onboardingStep: 3,
      educationLevel: 'Undergraduate Medical',
      semesterStage: 'Year 2',
      weeklyHours: 12,
      learningGoals: ['Master Core Coursework & Exams'],
      primaryGoal: 'Master Core Coursework & Exams',
    },
  });
  assert.equal(step23.status, 200);
  assert.equal(step23.data.dashboard.profile.onboardingStep, 3);

  // Start 15-question Entry Test + save partial answer + resume
  const started = await apiReq('/api/onboarding/entry-test/start', {
    method: 'POST',
    token: freshToken,
    body: { questionCount: 15 },
  });
  assert.equal(started.status, 200);
  assert.equal(started.data.questions.length, 15);
  assert.equal(started.data.questions[0].correctAnswer, undefined);
  const sessionId = started.data.sessionId as string;

  const saveOne = await apiReq('/api/onboarding/entry-test/answer', {
    method: 'POST',
    token: freshToken,
    body: {
      sessionId,
      questionId: started.data.questions[0].id,
      answer: started.data.questions[0].options[0],
    },
  });
  assert.equal(saveOne.status, 200);
  assert.equal(saveOne.data.answeredCount, 1);

  const resumed = await apiReq('/api/onboarding/entry-test/start', {
    method: 'POST',
    token: freshToken,
    body: { questionCount: 15 },
  });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.sessionId, sessionId);
  assert.equal(resumed.data.savedAnswers[started.data.questions[0].id], started.data.questions[0].options[0]);

  // Submit entry test -> Step 5 Assessment Result
  const submitted = await apiReq('/api/onboarding/entry-test/submit', {
    method: 'POST',
    token: freshToken,
    body: { sessionId },
  });
  assert.equal(submitted.status, 200);
  assert.ok(['Beginner', 'Basic', 'Intermediate', 'Advanced'].includes(submitted.data.result.skillLevel));
  assert.equal(submitted.data.dashboard.profile.onboardingStep, 5);
  assert.ok(submitted.data.dashboard.entryAssessment !== null);

  // Complete Onboarding -> Personalised Clinical Healthcare Roadmap
  const completed = await apiReq('/api/onboarding/complete', {
    method: 'POST',
    token: freshToken,
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.dashboard.profile.onboardingCompleted, true);
  assert.equal(completed.data.dashboard.domainMeta.id, 'medical');

  // 5. Multi-turn AI Mentor (default Direct Answer) & conversation reset
  const m1 = await apiReq('/api/mentor/chat', {
    method: 'POST',
    token: freshToken,
    body: { message: 'Explain preload vs afterload in cardiac physiology clearly.' },
  });
  assert.ok([200, 429, 502, 503, 504].includes(m1.status));
  assert.equal(typeof m1.data.aiConfigured, 'boolean');

  if (m1.status === 200) {
    assert.equal(m1.data.usedAi, true);
    assert.ok(typeof m1.data.reply === 'string' && m1.data.reply.length > 25);

    const m2 = await apiReq('/api/mentor/chat', {
      method: 'POST',
      token: freshToken,
      body: { message: 'Now give a short example of how increased afterload affects stroke volume.', hintLevel: 4 },
    });
    assert.equal(m2.status, 200);
    assert.ok(m2.data.reply.length > 25);

    const hist = await apiReq('/api/mentor/history', { token: freshToken });
    assert.equal(hist.status, 200);
    assert.equal(hist.data.messages.length, 4);
  } else {
    assert.ok(typeof m1.data.error === 'string' && m1.data.error.length > 10);
    const histErr = await apiReq('/api/mentor/history', { token: freshToken });
    assert.equal(histErr.status, 200);
    assert.equal(histErr.data.messages.length, 0);
  }

  const cleared = await apiReq('/api/mentor/history', { method: 'DELETE', token: freshToken });
  assert.equal(cleared.status, 200);

  const histAfterClear = await apiReq('/api/mentor/history', { token: freshToken });
  assert.equal(histAfterClear.data.messages.length, 0);
});
