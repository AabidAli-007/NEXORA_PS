import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Check,
  CheckCircle2,
  Cpu,
  LayoutGrid,
  LogOut,
  RotateCcw,
  Save,
  Scale,
  Search,
  Sparkles,
  Stethoscope,
  TrendingUp,
} from 'lucide-react';
import { api, type DashboardPayload, type EntryTestStartPayload } from '../lib/api';
import {
  ACADEMIC_DOMAINS,
  LEARNING_GOAL_OPTIONS,
  getDomainMeta,
} from '../data/domainsCatalog';
import type {
  AcademicDomainId,
  EntryAssessmentResult,
  SkillCategory,
} from '../core/types';
import { BrandMark } from './BrandMark';
import { AiContextualLoader } from './SystemStates';

interface OnboardingWizardProps {
  dashboard: DashboardPayload;
  onComplete: (nextDashboard: DashboardPayload) => void;
  onUpdated: (nextDashboard: DashboardPayload) => void;
  onLogout: () => void;
}

const DOMAIN_ICONS: Record<AcademicDomainId, typeof Cpu> = {
  engineering: Cpu,
  medical: Stethoscope,
  commerce: TrendingUp,
  arts: BookOpen,
  'ai-tech': BrainCircuit,
  management: Briefcase,
  law: Scale,
  other: LayoutGrid,
};

const DOMAIN_STARTER_SKILLS: Record<
  AcademicDomainId,
  { skillId: string; skillName: string; category: SkillCategory }[]
> = {
  engineering: [
    { skillId: 'python', skillName: 'Python', category: 'Language' },
    { skillId: 'sql', skillName: 'SQL', category: 'Database' },
    { skillId: 'javascript', skillName: 'JavaScript', category: 'Language' },
    { skillId: 'engineering-math', skillName: 'Engineering Mathematics', category: 'Engineering Systems' },
  ],
  'ai-tech': [
    { skillId: 'python', skillName: 'Python', category: 'Language' },
    { skillId: 'statistics', skillName: 'Statistics & Probability', category: 'Data & AI' },
    { skillId: 'sql', skillName: 'SQL', category: 'Database' },
    { skillId: 'pandas', skillName: 'Data Cleaning & Pandas', category: 'Data & AI' },
  ],
  medical: [
    { skillId: 'anatomy-physiology', skillName: 'Human Anatomy & Physiology', category: 'Clinical & Bio' },
    { skillId: 'pharmacology', skillName: 'Pharmacology & Drug Safety', category: 'Clinical & Bio' },
    { skillId: 'clinical-reasoning', skillName: 'Clinical Case Reasoning', category: 'Clinical & Bio' },
  ],
  commerce: [
    { skillId: 'financial-accounting', skillName: 'Financial Accounting', category: 'Finance & Quant' },
    { skillId: 'corporate-finance', skillName: 'Corporate Finance & Valuation', category: 'Finance & Quant' },
    { skillId: 'statistics', skillName: 'Quantitative & Statistical Analysis', category: 'Data & AI' },
  ],
  arts: [
    { skillId: 'critical-writing', skillName: 'Critical Writing & Rhetoric', category: 'Humanities & Social' },
    { skillId: 'research-methods', skillName: 'Research Methodology', category: 'Humanities & Social' },
    { skillId: 'micro-macro-econ', skillName: 'Economic & Policy Analysis', category: 'Humanities & Social' },
  ],
  management: [
    { skillId: 'marketing-analytics', skillName: 'Marketing & Growth Strategy', category: 'Management & Strategy' },
    { skillId: 'org-operations', skillName: 'Operations & Execution', category: 'Management & Strategy' },
    { skillId: 'financial-accounting', skillName: 'Managerial Finance', category: 'Finance & Quant' },
  ],
  law: [
    { skillId: 'legal-reasoning', skillName: 'IRAC Legal Reasoning', category: 'Legal & Policy' },
    { skillId: 'constitutional-law', skillName: 'Constitutional & Statutory Analysis', category: 'Legal & Policy' },
    { skillId: 'contracts-tort', skillName: 'Contracts & Tort Doctrine', category: 'Legal & Policy' },
  ],
  other: [
    { skillId: 'critical-reasoning', skillName: 'Critical & Analytical Thinking', category: 'Foundations' },
    { skillId: 'research-methods', skillName: 'Structured Research & Synthesis', category: 'Humanities & Social' },
    { skillId: 'statistics', skillName: 'Quantitative Literacy', category: 'Data & AI' },
  ],
};

function RadialScoreGauge({ score, label }: { score: number; label: string }) {
  const radius = 58;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = Math.PI * normalizedRadius; // semi-circle arc
  const clamped = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <svg width={156} height={96} viewBox="0 0 156 96" aria-label={`Assessment score ${score}% (${label})`}>
        <path
          d="M 20 82 A 58 58 0 0 1 136 82"
          fill="none"
          stroke="#E8E3D8"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M 20 82 A 58 58 0 0 1 136 82"
          fill="none"
          stroke="#E8B52E"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="-mt-11 text-center">
        <div className="text-3xl font-bold text-[#24231F] tabular-nums">{score}%</div>
        <div className="text-sm font-semibold text-[#77764B] mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function OnboardingWizard({
  dashboard,
  onComplete,
  onUpdated,
  onLogout,
}: OnboardingWizardProps) {
  const { profile } = dashboard;
  const initialStep = Math.max(1, Math.min(5, profile.onboardingStep || 1));

  const [step, setStep] = useState<number>(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Domain & Course
  const [domainId, setDomainId] = useState<AcademicDomainId>(profile.domainId || 'engineering');
  const [courseId, setCourseId] = useState<string>(profile.courseId || 'eng-cse');
  const [customCourseName, setCustomCourseName] = useState<string>(
    profile.courseId.endsWith('-custom') ? profile.courseName : ''
  );
  const [specialization, setSpecialization] = useState<string>(profile.specialization || '');
  const [courseSearch, setCourseSearch] = useState('');

  // Step 2: Background
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [educationLevel, setEducationLevel] = useState(profile.educationLevel || 'Undergraduate');
  const [institution, setInstitution] = useState(profile.institution || '');
  const [semesterStage, setSemesterStage] = useState(profile.semesterStage || 'Semester 3 / Year 2');
  const [previousBackground, setPreviousBackground] = useState(profile.previousBackground || '');
  const [graduationYear, setGraduationYear] = useState(profile.graduationYear || '');
  const [weeklyHours, setWeeklyHours] = useState(profile.weeklyHours || 8);
  const [preferredFormat, setPreferredFormat] = useState<
    'Interactive & Practice' | 'Reading & Docs' | 'Project-Based' | 'Mixed'
  >(profile.preferredFormat || 'Interactive & Practice');
  const [timezone, setTimezone] = useState(
    profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );

  // Step 3: Goals & Declared Skills & Entry Test Length
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    profile.learningGoals?.length ? profile.learningGoals : [LEARNING_GOAL_OPTIONS[1].title]
  );
  const [primaryGoal, setPrimaryGoal] = useState<string>(
    profile.primaryGoal || LEARNING_GOAL_OPTIONS[1].title
  );
  const [declaredSkills, setDeclaredSkills] = useState<Record<string, 'Beginner' | 'Intermediate' | 'Advanced'>>({});
  const [questionCount, setQuestionCount] = useState<number>(15);

  // Step 4: Entry Assessment
  const [testSession, setTestSession] = useState<EntryTestStartPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answerSavedHint, setAnswerSavedHint] = useState<string | null>(null);
  const [gradingStage, setGradingStage] = useState<number>(0);

  // Step 5: Result
  const [entryResult, setEntryResult] = useState<EntryAssessmentResult | null>(
    dashboard.entryAssessment ?? null
  );
  const [showExplanations, setShowExplanations] = useState(false);

  const selectedDomain = getDomainMeta(domainId);
  const filteredCourses = selectedDomain.courses.filter((c) =>
    courseSearch.trim()
      ? c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
        c.defaultSubjects.some((t) => t.toLowerCase().includes(courseSearch.toLowerCase()))
      : true
  );

  const selectedCourseObj =
    selectedDomain.courses.find((c) => c.id === courseId) ?? selectedDomain.courses[0];
  const resolvedCourseName = customCourseName.trim() || selectedCourseObj?.name || profile.courseName;

  // Auto-resume Step 4 test if learner returned mid-assessment
  useEffect(() => {
    if (step === 4 && !testSession) {
      loadOrStartEntryTest(false);
    }
    if (step === 5 && !entryResult && !dashboard.entryAssessment) {
      setStep(4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function loadOrStartEntryTest(reset = false) {
    setError(null);
    setSaving(true);
    try {
      const payload = await api.startEntryTest({ questionCount, reset });
      setTestSession(payload);
      setAnswers(payload.savedAnswers || {});
      const firstUnanswered = payload.questions.findIndex((q) => !(payload.savedAnswers || {})[q.id]);
      setCurrentIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start entry assessment.');
    } finally {
      setSaving(false);
    }
  }

  function handleSelectDomain(nextDomainId: AcademicDomainId) {
    setDomainId(nextDomainId);
    const meta = getDomainMeta(nextDomainId);
    setCourseId(meta.courses[0].id);
    setCustomCourseName('');
    setCourseSearch('');
  }

  async function handleStep1Continue() {
    setError(null);
    setSaving(true);
    try {
      const res = await api.saveOnboardingStep({
        onboardingStep: 2,
        domainId,
        courseId,
        courseName: resolvedCourseName,
        specialization,
      });
      onUpdated(res.dashboard);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save course selection.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2Continue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api.saveOnboardingStep({
        onboardingStep: 3,
        displayName,
        educationLevel,
        institution,
        degree: resolvedCourseName,
        semesterStage,
        previousBackground,
        graduationYear,
        weeklyHours,
        preferredFormat,
        timezone,
      });
      onUpdated(res.dashboard);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save academic background.');
    } finally {
      setSaving(false);
    }
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) => {
      if (prev.includes(goal)) {
        const next = prev.filter((g) => g !== goal);
        if (primaryGoal === goal) {
          setPrimaryGoal(next[0] || '');
        }
        return next;
      }
      if (!primaryGoal) setPrimaryGoal(goal);
      return [...prev, goal];
    });
  }

  async function handleStep3StartTest() {
    if (selectedGoals.length === 0) {
      setError('Select at least one learning goal so NEXORA can tailor your plan.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const domainSkills = DOMAIN_STARTER_SKILLS[domainId] || DOMAIN_STARTER_SKILLS.other;
      const declaredPayload = Object.entries(declaredSkills).map(([skillId, level]) => {
        const meta = domainSkills.find((s) => s.skillId === skillId);
        return {
          skillId,
          skillName: meta?.skillName || skillId,
          category: meta?.category || 'Foundations',
          declaredLevel: level,
        };
      });

      const res = await api.saveOnboardingStep({
        onboardingStep: 4,
        learningGoals: selectedGoals,
        primaryGoal: primaryGoal || selectedGoals[0],
        careerObjectives: `${primaryGoal || selectedGoals[0]} — ${resolvedCourseName}`,
        declaredSkills: declaredPayload,
      });
      onUpdated(res.dashboard);

      const started = await api.startEntryTest({ questionCount, reset: true });
      setTestSession(started);
      setAnswers(started.savedAnswers || {});
      setCurrentIdx(0);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize entry test.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCurrentAnswer(qId: string, answerText?: string) {
    if (!testSession) return;
    const chosen = answerText ?? answers[qId];
    if (!chosen) return;
    setAnswerSavedHint(null);
    try {
      await api.saveEntryAnswer({
        sessionId: testSession.sessionId,
        questionId: qId,
        answer: chosen,
      });
      setAnswerSavedHint('Answer saved');
      window.setTimeout(() => setAnswerSavedHint(null), 1800);
    } catch {
      // Non-blocking save hint
    }
  }

  async function handleSubmitEntryTest() {
    if (!testSession) return;
    setError(null);
    setSaving(true);
    setGradingStage(0);
    const t1 = window.setTimeout(() => setGradingStage(1), 650);
    const t2 = window.setTimeout(() => setGradingStage(2), 1400);
    try {
      const res = await api.submitEntryTest({
        sessionId: testSession.sessionId,
        answers,
      });
      setEntryResult(res.result);
      onUpdated(res.dashboard);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grade entry assessment.');
    } finally {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setSaving(false);
    }
  }

  async function handleRetakeTest() {
    setStep(4);
    await loadOrStartEntryTest(true);
  }

  async function handleFinishOnboarding() {
    setError(null);
    setSaving(true);
    try {
      const res = await api.completeOnboarding();
      onComplete(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finalize onboarding.');
    } finally {
      setSaving(false);
    }
  }

  const currentQuestion = testSession?.questions[currentIdx];
  const answeredCount = testSession
    ? testSession.questions.filter((q) => Boolean(answers[q.id])).length
    : 0;

  return (
    <div className="min-h-screen bg-[#F8F6EF] text-[#24231F] relative">
      {/* Top Progress Header */}
      <header className="sticky top-0 z-20 border-b border-[#E8E3D8] bg-[#FDFBF6]/95 backdrop-blur px-5 sm:px-8 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <BrandMark size={24} variant="light" />

          <div className="hidden sm:flex items-center gap-4 flex-1 max-w-md mx-4">
            <div className="h-2 flex-1 rounded-full bg-[#E8E3D8] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#E8B52E] transition-all duration-300"
                style={{ width: `${Math.round((step / 5) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-[#77764B] whitespace-nowrap tabular-nums">
              Step {step} of 5
            </span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-medium text-[#89877F] hover:text-[#24231F] cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-8 py-8 sm:py-10">
        {error && (
          <div className="mb-6 rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F] flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            {/authentication|log in|401/i.test(error) && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg bg-[#24231F] px-3 py-1.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#3a3832] cursor-pointer shrink-0"
              >
                Sign in again
              </button>
            )}
          </div>
        )}

        {/* STEP 1: WHAT DO YOU WANT TO STUDY? */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B] sm:hidden">
                Step 1 of 5
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl text-[#24231F]">
                What do you want to study?
              </h1>
              <p className="text-sm text-[#89877F]">
                Choose your academic domain so NEXORA can build a learning experience around your
                goals.
              </p>
            </div>

            {/* 8 Domain Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ACADEMIC_DOMAINS.map((dom) => {
                const Icon = DOMAIN_ICONS[dom.id];
                const active = dom.id === domainId;
                return (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => handleSelectDomain(dom.id)}
                    className={`relative text-left rounded-2xl border p-5 transition-all cursor-pointer ${
                      active
                        ? 'border-[#E8B52E] bg-[#FDFBF6] ring-2 ring-[#E8B52E]/40'
                        : 'border-[#E8E3D8] bg-[#FDFBF6] hover:border-[#24231F]/40'
                    }`}
                  >
                    {active && (
                      <span className="absolute right-3.5 top-3.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E8B52E] text-[#24231F]">
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      </span>
                    )}
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E3D8] bg-[#F8F6EF] text-[#D77B43]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="mt-3.5 font-semibold text-base text-[#24231F]">{dom.name}</div>
                    <p className="mt-1 text-xs text-[#89877F] leading-relaxed">{dom.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {/* Course Selection inside chosen domain */}
            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg text-[#24231F]">
                    Select your course in {selectedDomain.name}
                  </h2>
                  <p className="text-xs text-[#89877F]">{selectedDomain.description}</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#89877F]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    placeholder="Search courses…"
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCourses.map((course) => {
                  const selected = course.id === courseId;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => {
                        setCourseId(course.id);
                        setCustomCourseName('');
                      }}
                      className={`text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
                        selected
                          ? 'border-[#24231F] bg-[#F4E3B2]/50'
                          : 'border-[#E8E3D8] bg-white hover:border-[#24231F]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#24231F]">{course.name}</span>
                        {selected && <CheckCircle2 className="h-4 w-4 text-[#77764B] shrink-0" />}
                      </div>
                      <div className="mt-1 text-[11px] text-[#89877F]">
                        {course.defaultSubjects.slice(0, 3).join(' · ')}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E8E3D8]">
                <div>
                  <label htmlFor="ob-custom-course" className="block text-xs font-semibold mb-1">
                    Custom Course / Program Name (optional)
                  </label>
                  <input
                    id="ob-custom-course"
                    type="text"
                    value={customCourseName}
                    onChange={(e) => setCustomCourseName(e.target.value)}
                    placeholder={`Default: ${selectedCourseObj?.name || 'Course Name'}`}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="ob-spec" className="block text-xs font-semibold mb-1">
                    Specialization / Focus Area (optional)
                  </label>
                  <input
                    id="ob-spec"
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g., AI/ML, Pediatrics, Corporate Tax, Civil Litigation"
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleStep1Continue}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E8B52E] px-7 py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] transition-colors cursor-pointer disabled:opacity-60"
              >
                <span>{saving ? 'Saving…' : 'Continue'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: ACADEMIC & PROFESSIONAL BACKGROUND */}
        {step === 2 && (
          <form onSubmit={handleStep2Continue} className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="font-serif text-3xl text-[#24231F]">Tell us about your background</h1>
              <p className="text-sm text-[#89877F]">
                NEXORA uses your stage and study availability to calibrate pacing for{' '}
                <strong>{resolvedCourseName}</strong>.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ob-name" className="block text-xs font-semibold mb-1">
                    Your Name
                  </label>
                  <input
                    id="ob-name"
                    type="text"
                    required
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ob-ed-lvl" className="block text-xs font-semibold mb-1">
                    Current Education Level
                  </label>
                  <select
                    id="ob-ed-lvl"
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  >
                    <option value="High School">High School / Pre-University</option>
                    <option value="Undergraduate">Undergraduate (Bachelor&apos;s)</option>
                    <option value="Postgraduate">Postgraduate (Master&apos;s / MD / MBA / LLM)</option>
                    <option value="Working Professional">Working Professional</option>
                    <option value="Self-Taught / Career Switcher">Self-Taught / Career Switcher</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ob-inst" className="block text-xs font-semibold mb-1">
                    Institution / University / Organization
                  </label>
                  <input
                    id="ob-inst"
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g., National Institute of Engineering"
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ob-stage" className="block text-xs font-semibold mb-1">
                    Current Semester or Year
                  </label>
                  <input
                    id="ob-stage"
                    type="text"
                    value={semesterStage}
                    onChange={(e) => setSemesterStage(e.target.value)}
                    placeholder="e.g., Semester 3 / Year 2"
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ob-grad" className="block text-xs font-semibold mb-1">
                    Expected Graduation Year (optional)
                  </label>
                  <input
                    id="ob-grad"
                    type="text"
                    value={graduationYear}
                    onChange={(e) => setGraduationYear(e.target.value)}
                    placeholder="e.g., 2028"
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ob-hours" className="block text-xs font-semibold mb-1">
                    Weekly Study Availability (hours)
                  </label>
                  <input
                    id="ob-hours"
                    type="number"
                    min={1}
                    max={60}
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(Number(e.target.value) || 8)}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ob-fmt" className="block text-xs font-semibold mb-1">
                    Preferred Learning Style
                  </label>
                  <select
                    id="ob-fmt"
                    value={preferredFormat}
                    onChange={(e) => setPreferredFormat(e.target.value as typeof preferredFormat)}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  >
                    <option value="Interactive & Practice">Interactive &amp; Practice</option>
                    <option value="Reading & Docs">Structured Reading &amp; Guides</option>
                    <option value="Project-Based">Applied Case / Project-Based</option>
                    <option value="Mixed">Mixed Approach</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ob-tz" className="block text-xs font-semibold mb-1">
                    Timezone
                  </label>
                  <input
                    id="ob-tz"
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ob-prev" className="block text-xs font-semibold mb-1">
                  Previous Academic or Practical Background (optional)
                </label>
                <textarea
                  id="ob-prev"
                  rows={2}
                  value={previousBackground}
                  onChange={(e) => setPreviousBackground(e.target.value)}
                  placeholder="Share prior coursework, labs, internships, or self-study topics…"
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#24231F] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E8B52E] px-7 py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer disabled:opacity-60"
              >
                <span>{saving ? 'Saving…' : 'Continue'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: LEARNING GOALS + OPTIONAL DECLARED SKILLS + ENTRY TEST LENGTH */}
        {step === 3 && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="font-serif text-3xl text-[#24231F]">What are your learning goals?</h1>
              <p className="text-sm text-[#89877F]">
                Select all goals that apply and mark your primary priority for{' '}
                <strong>{resolvedCourseName}</strong>.
              </p>
            </div>

            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LEARNING_GOAL_OPTIONS.map((goal) => {
                  const chosen = selectedGoals.includes(goal.title);
                  const isPrimary = primaryGoal === goal.title;
                  return (
                    <div
                      key={goal.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        chosen
                          ? 'border-[#24231F] bg-white'
                          : 'border-[#E8E3D8] bg-white/70 hover:border-[#24231F]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2.5 text-sm font-medium text-[#24231F] cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={chosen}
                            onChange={() => toggleGoal(goal.title)}
                            className="accent-[#24231F] mt-1"
                          />
                          <span>
                            <span className="block font-semibold text-[#24231F]">{goal.title}</span>
                            <span className="block text-xs text-[#89877F] mt-0.5">{goal.description}</span>
                          </span>
                        </label>
                        {chosen && (
                          <button
                            type="button"
                            onClick={() => setPrimaryGoal(goal.title)}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer shrink-0 ${
                              isPrimary
                                ? 'bg-[#E8B52E] text-[#24231F]'
                                : 'bg-[#F8F6EF] text-[#89877F] hover:text-[#24231F]'
                            }`}
                          >
                            {isPrimary ? 'Primary' : 'Set Primary'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Optional Starter Declared Skills */}
            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#24231F]">
                  Existing {selectedDomain.name} Foundations (Optional)
                </h2>
                <span className="text-[11px] text-[#89877F]">
                  Saved as Declared (0/5) until proven
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(DOMAIN_STARTER_SKILLS[domainId] || DOMAIN_STARTER_SKILLS.other).map((sk) => {
                  const checked = Boolean(declaredSkills[sk.skillId]);
                  return (
                    <div
                      key={sk.skillId}
                      className="flex items-center justify-between rounded-xl border border-[#E8E3D8] bg-white px-3.5 py-2.5"
                    >
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDeclaredSkills((prev) => ({ ...prev, [sk.skillId]: 'Beginner' }));
                            } else {
                              setDeclaredSkills((prev) => {
                                const next = { ...prev };
                                delete next[sk.skillId];
                                return next;
                              });
                            }
                          }}
                          className="accent-[#24231F]"
                        />
                        <span>{sk.skillName}</span>
                      </label>
                      {checked && (
                        <select
                          aria-label={`${sk.skillName} self-assessed level`}
                          value={declaredSkills[sk.skillId]}
                          onChange={(e) =>
                            setDeclaredSkills((prev) => ({
                              ...prev,
                              [sk.skillId]: e.target.value as 'Beginner' | 'Intermediate' | 'Advanced',
                            }))
                          }
                          className="rounded border border-[#E8E3D8] bg-[#F8F6EF] px-2 py-1 text-xs"
                        >
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Configurable Entry Test Question Count (15 default, up to 25) */}
            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#24231F]">
                  Entry Diagnostic Length ({selectedDomain.name})
                </div>
                <p className="text-xs text-[#89877F]">
                  Calibrates your baseline level and subject strengths before launching your plan.
                </p>
              </div>
              <select
                aria-label="Entry test question count"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-xs font-semibold text-[#24231F]"
              >
                <option value={15}>15 Questions (Recommended Baseline)</option>
                <option value={20}>20 Questions (Balanced Diagnostic)</option>
                <option value={25}>25 Questions (Comprehensive Diagnostic)</option>
              </select>
            </section>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#24231F] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleStep3StartTest}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E8B52E] px-7 py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer disabled:opacity-60"
              >
                <span>{saving ? 'Preparing Entry Test…' : 'Start Entry Assessment'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: COURSE-SPECIFIC ENTRY ASSESSMENT */}
        {step === 4 && (
          <div className="max-w-3xl mx-auto space-y-6">
            {saving && !testSession ? (
              <AiContextualLoader
                title={`Generating ${resolvedCourseName} entry diagnostic…`}
                steps={[
                  `Loading ${questionCount} curated ${selectedDomain.name} questions`,
                  'Restoring any previously saved responses',
                  'Preparing adaptive evaluation rubric',
                ]}
                activeIndex={1}
              />
            ) : saving && testSession ? (
              <AiContextualLoader
                title="Analyzing your entry assessment & learner profile…"
                steps={[
                  'Scoring your responses across subject areas',
                  'Identifying strong topics and priority revision areas',
                  'Synthesizing personalized study roadmap & AI profile',
                ]}
                activeIndex={gradingStage}
              />
            ) : testSession && currentQuestion ? (
              <>
                {/* Entry Test Title + Progress */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="font-serif text-2xl sm:text-3xl text-[#24231F]">
                      Entry Test: {testSession.domainMeta.name} ({testSession.courseName})
                    </h1>
                    <span className="text-xs font-semibold text-[#77764B] tabular-nums">
                      Question {currentIdx + 1} of {testSession.totalQuestions}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E8B52E] transition-all duration-300"
                      style={{
                        width: `${Math.round(((currentIdx + 1) / testSession.totalQuestions) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#89877F]">
                    <span className="tabular-nums">
                      Answered {answeredCount} of {testSession.totalQuestions}
                    </span>
                    {answerSavedHint && (
                      <span className="font-semibold text-[#77764B]">{answerSavedHint}</span>
                    )}
                  </div>
                </div>

                {/* Question Card matching reference */}
                <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 sm:p-8 space-y-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block rounded-lg bg-[#F4E3B2] px-3 py-1 text-xs font-semibold text-[#24231F]">
                      {currentQuestion.subjectTag}
                    </span>
                    <span className="text-xs font-mono text-[#89877F]">
                      {currentQuestion.topicTag} · {currentQuestion.difficulty}
                    </span>
                  </div>

                  <h2 className="text-base sm:text-lg font-semibold text-[#24231F] leading-snug">
                    {currentQuestion.prompt}
                  </h2>

                  {currentQuestion.codeSnippet && (
                    <pre className="rounded-xl bg-[#24231F] text-[#F8F6EF] p-4 text-xs sm:text-sm font-mono overflow-x-auto leading-relaxed">
                      <code>{currentQuestion.codeSnippet}</code>
                    </pre>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {currentQuestion.options.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const chosen = answers[currentQuestion.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }));
                            handleSaveCurrentAnswer(currentQuestion.id, opt);
                          }}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors cursor-pointer ${
                            chosen
                              ? 'border-[#E8B52E] bg-[#F4E3B2]/60 font-semibold text-[#24231F]'
                              : 'border-[#E8E3D8] bg-white text-[#24231F] hover:border-[#24231F]/40'
                          }`}
                        >
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                              chosen
                                ? 'bg-[#E8B52E] text-[#24231F]'
                                : 'bg-[#F8F6EF] text-[#89877F]'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="min-w-0 break-words">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Navigation Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#24231F] disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!answers[currentQuestion.id]}
                      onClick={() => handleSaveCurrentAnswer(currentQuestion.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3D8] bg-white px-4 py-2.5 text-xs font-semibold text-[#77764B] hover:border-[#24231F] disabled:opacity-40 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Save Answer</span>
                    </button>

                    {currentIdx < testSession.totalQuestions - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIdx((i) => Math.min(testSession.totalQuestions - 1, i + 1))
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[#E8B52E] px-6 py-2.5 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                      >
                        <span>Next Question</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmitEntryTest}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#24231F] px-6 py-2.5 text-sm font-semibold text-[#F8F6EF] hover:bg-[#37352f] cursor-pointer"
                      >
                        <span>Submit Assessment</span>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <button
                  type="button"
                  onClick={() => loadOrStartEntryTest(true)}
                  className="rounded-xl bg-[#E8B52E] px-6 py-3 text-sm font-semibold text-[#24231F] cursor-pointer"
                >
                  Load Entry Diagnostic
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: ASSESSMENT RESULT & AI LEARNER PROFILE */}
        {step === 5 && entryResult && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="font-serif text-3xl sm:text-4xl text-[#24231F]">
                Your Assessment Result
              </h1>
              <p className="text-sm text-[#89877F]">
                Based on your performance in <strong>{entryResult.courseName}</strong>, here&apos;s
                your current skill level.
              </p>
            </div>

            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                {/* Left: Radial Gauge */}
                <div className="md:col-span-5 flex flex-col items-center border-b md:border-b-0 md:border-r border-[#E8E3D8] pb-6 md:pb-0 md:pr-6">
                  <RadialScoreGauge
                    score={entryResult.scorePercent}
                    label={entryResult.skillLevel}
                  />
                  <div className="mt-4 text-xs text-[#89877F] font-mono tabular-nums">
                    {entryResult.correctCount} of {entryResult.totalCount} questions correct
                  </div>
                </div>

                {/* Right: Subject Breakdown Horizontal Bars */}
                <div className="md:col-span-7 space-y-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
                    Subject Breakdown
                  </div>
                  {entryResult.subjectBreakdown.map((subj) => (
                    <div key={subj.subject} className="space-y-1">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="font-medium text-[#24231F]">{subj.subject}</span>
                        <span className="font-mono font-bold tabular-nums text-[#24231F]">
                          {subj.scorePercent}%{' '}
                          <span className="font-sans font-normal text-[#89877F]">
                            ({subj.level})
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#E8B52E]"
                          style={{ width: `${Math.max(4, subj.scorePercent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Learner Profile Insights Box */}
              <div className="rounded-xl border border-[#E8B52E]/60 bg-[#F4E3B2]/30 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#24231F]">
                  <Sparkles className="h-4 w-4 text-[#D77B43]" aria-hidden="true" />
                  <span>Insights &amp; Personalized Study Profile</span>
                </div>
                <p className="text-sm text-[#24231F] leading-relaxed">
                  {entryResult.aiProfile.strengthsSummary}{' '}
                  {entryResult.aiProfile.weakAreasSummary}
                </p>
                <div className="text-xs text-[#77764B] font-medium">
                  {entryResult.aiProfile.recommendedPace}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="rounded-lg bg-white/80 border border-[#E8E3D8] p-3">
                    <div className="font-semibold text-[#77764B]">Strong Topics</div>
                    <div className="mt-1 text-[#24231F]">
                      {entryResult.strongTopics.length > 0
                        ? entryResult.strongTopics.join(', ')
                        : 'Building core baseline'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/80 border border-[#E8E3D8] p-3">
                    <div className="font-semibold text-[#D77B43]">Priority Weak Areas</div>
                    <div className="mt-1 text-[#24231F]">
                      {entryResult.weakTopics.length > 0
                        ? entryResult.weakTopics.join(', ')
                        : 'No urgent weaknesses detected'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#89877F]">
                <span>{entryResult.disclaimer}</span>
                <button
                  type="button"
                  onClick={() => setShowExplanations((v) => !v)}
                  className="font-semibold text-[#24231F] underline underline-offset-4 cursor-pointer"
                >
                  {showExplanations ? 'Hide Question Review' : 'Review Question Explanations'}
                </button>
              </div>

              {showExplanations && (
                <div className="border-t border-[#E8E3D8] pt-4 space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {entryResult.questionReviews.map((qr, idx) => (
                    <div
                      key={qr.questionId}
                      className={`rounded-xl border p-3.5 text-xs ${
                        qr.correct
                          ? 'border-[#77764B]/40 bg-[#77764B]/5'
                          : 'border-[#D77B43]/50 bg-[#D77B43]/5'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-[#24231F]">
                        <span>
                          Q{idx + 1} · {qr.subjectTag} ({qr.topicTag})
                        </span>
                        <span className={qr.correct ? 'text-[#77764B]' : 'text-[#D77B43]'}>
                          {qr.correct ? 'Correct' : 'Needs Review'}
                        </span>
                      </div>
                      <p className="mt-1 text-[#24231F]/85">{qr.prompt}</p>
                      <p className="mt-1 text-[#89877F]">
                        Your answer: <strong>{qr.submittedAnswer}</strong> · Correct:{' '}
                        <strong>{qr.correctAnswer}</strong>
                      </p>
                      <p className="mt-1 text-[#24231F]/75">{qr.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer Actions matching reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRetakeTest}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E3D8] bg-white py-3 text-sm font-semibold text-[#24231F] hover:border-[#24231F] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>Retake Test</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleFinishOnboarding}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B52E] py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                >
                  <span>{saving ? 'Building Your Plan…' : 'Continue to Your Plan'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
