import { useState } from 'react';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import { ACADEMIC_DOMAINS, getDomainMeta } from '../data/domainsCatalog';
import type { AcademicDomainId } from '../core/types';

interface ProfileSettingsViewProps {
  mode: 'profile' | 'settings';
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
}

export function ProfileSettingsView({
  mode,
  dashboard,
  onUpdated,
}: ProfileSettingsViewProps) {
  const { profile } = dashboard;
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [institution, setInstitution] = useState(profile.institution);
  const [degree, setDegree] = useState(profile.degree);
  const [academicYear, setAcademicYear] = useState(profile.academicYear);
  const [fieldOfStudy, setFieldOfStudy] = useState(profile.fieldOfStudy);
  const [subjectsText, setSubjectsText] = useState(profile.subjects.join(', '));
  const [careerObjectives, setCareerObjectives] = useState(profile.careerObjectives);

  const [weeklyHours, setWeeklyHours] = useState(profile.weeklyHours);
  const [preferredFormat, setPreferredFormat] = useState(profile.preferredFormat);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(profile.privacyLeaderboardOptIn);

  const [domainId, setDomainId] = useState<AcademicDomainId>(profile.domainId || 'engineering');
  const [courseId, setCourseId] = useState(profile.courseId || 'eng-cse');
  const [specialization, setSpecialization] = useState(profile.specialization || '');
  const [switchingCourse, setSwitchingCourse] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitchCourse() {
    setSwitchingCourse(true);
    setSavedMsg(null);
    setError(null);
    try {
      const meta = getDomainMeta(domainId);
      const course = meta.courses.find((c) => c.id === courseId) ?? meta.courses[0];
      const res = await api.selectCourse({
        domainId,
        courseId: course.id,
        courseName: course.name,
        specialization,
      });
      onUpdated(res.dashboard);
      setSavedMsg(`Academic track switched to ${meta.name} (${course.name}). Existing SkillProof evidence preserved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch course');
    } finally {
      setSwitchingCourse(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setError(null);
    try {
      const res = await api.updateProfile({
        displayName,
        institution,
        degree,
        academicYear,
        fieldOfStudy,
        subjects: subjectsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        careerObjectives,
        weeklyHours,
        preferredFormat,
        timezone,
        privacyLeaderboardOptIn: leaderboardOptIn,
      });
      onUpdated(res.dashboard);
      setSavedMsg('Changes saved to persistent database.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-3xl text-[#24231F]">
          {mode === 'profile' ? 'Learner Profile' : 'Platform & Privacy Settings'}
        </h1>
        <p className="text-sm text-[#89877F] mt-1">
          {mode === 'profile'
            ? 'Manage your academic details, subjects, and career objectives.'
            : 'Configure study schedule pacing, timezone for learning streaks, and privacy controls.'}
        </p>
      </div>

      {savedMsg && (
        <div className="rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 px-4 py-3 text-sm text-[#24231F] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#77764B]" aria-hidden="true" />
          <span>{savedMsg}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F]">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-5"
      >
        {mode === 'profile' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-semibold mb-1">
                  Display Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-email" className="block text-xs font-semibold mb-1">
                  Account Email
                </label>
                <input
                  id="prof-email"
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-[#F8F6EF] px-3 py-2 text-sm text-[#89877F]"
                />
              </div>
              <div>
                <label htmlFor="prof-inst" className="block text-xs font-semibold mb-1">
                  Educational Institution
                </label>
                <input
                  id="prof-inst"
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-deg" className="block text-xs font-semibold mb-1">
                  Degree / Course
                </label>
                <input
                  id="prof-deg"
                  type="text"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-year" className="block text-xs font-semibold mb-1">
                  Academic Year
                </label>
                <input
                  id="prof-year"
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-field" className="block text-xs font-semibold mb-1">
                  Field of Study
                </label>
                <input
                  id="prof-field"
                  type="text"
                  value={fieldOfStudy}
                  onChange={(e) => setFieldOfStudy(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prof-subj" className="block text-xs font-semibold mb-1">
                Academic Subjects (comma separated)
              </label>
              <input
                id="prof-subj"
                type="text"
                value={subjectsText}
                onChange={(e) => setSubjectsText(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="prof-obj" className="block text-xs font-semibold mb-1">
                Career Objectives
              </label>
              <textarea
                id="prof-obj"
                rows={3}
                value={careerObjectives}
                onChange={(e) => setCareerObjectives(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-hours" className="block text-xs font-semibold mb-1">
                  Weekly Study Availability (hours)
                </label>
                <input
                  id="set-hours"
                  type="number"
                  min={1}
                  max={60}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value) || 8)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="set-format" className="block text-xs font-semibold mb-1">
                  Preferred Learning Format
                </label>
                <select
                  id="set-format"
                  value={preferredFormat}
                  onChange={(e) =>
                    setPreferredFormat(e.target.value as typeof preferredFormat)
                  }
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                >
                  <option value="Interactive & Practice">Interactive &amp; Practice</option>
                  <option value="Reading & Docs">Reading &amp; Docs</option>
                  <option value="Project-Based">Project-Based</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="set-tz" className="block text-xs font-semibold mb-1">
                Configured Timezone (for streak calculations)
              </label>
              <input
                id="set-tz"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[#E8E3D8] bg-white p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={leaderboardOptIn}
                onChange={(e) => setLeaderboardOptIn(e.target.checked)}
                className="mt-1 accent-[#24231F]"
              />
              <div>
                <div className="text-sm font-semibold text-[#24231F]">
                  Include my display name &amp; XP on the NEXORA PLAY Leaderboard
                </div>
                <p className="text-xs text-[#89877F] mt-0.5">
                  When enabled, only your display name, engagement level, and XP total are visible.
                  SkillProof assessments and private records always remain isolated.
                </p>
              </div>
            </label>
          </>
        )}

        <div className="flex justify-end border-t border-[#E8E3D8] pt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#24231F] px-5 py-2.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] disabled:opacity-60 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving…' : 'Save Changes'}</span>
          </button>
        </div>
      </form>

      {mode === 'profile' && (
        <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#24231F]">
              Academic Domain &amp; Course Track
            </h2>
            <p className="text-xs text-[#89877F] mt-0.5">
              Switch your academic domain or course anytime without losing verified SkillProof
              evidence.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="prof-dom" className="block text-xs font-semibold mb-1">
                Domain
              </label>
              <select
                id="prof-dom"
                value={domainId}
                onChange={(e) => {
                  const next = e.target.value as AcademicDomainId;
                  setDomainId(next);
                  setCourseId(getDomainMeta(next).courses[0].id);
                }}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              >
                {ACADEMIC_DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="prof-course" className="block text-xs font-semibold mb-1">
                Course / Program
              </label>
              <select
                id="prof-course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              >
                {getDomainMeta(domainId).courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="prof-spec" className="block text-xs font-semibold mb-1">
                Specialization
              </label>
              <input
                id="prof-spec"
                type="text"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="Optional specialization"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={switchingCourse}
              onClick={handleSwitchCourse}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E8B52E] px-4 py-2 text-xs font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{switchingCourse ? 'Switching Course…' : 'Update Course & Sync Roadmap'}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
