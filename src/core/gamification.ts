export interface LevelTier {
  level: number;
  name: string;
  minXp: number;
  nextXp: number | null;
}

export const LEVEL_TIERS: LevelTier[] = [
  { level: 1, name: 'Explorer', minXp: 0, nextXp: 250 },
  { level: 2, name: 'Apprentice', minXp: 250, nextXp: 600 },
  { level: 3, name: 'Builder', minXp: 600, nextXp: 1100 },
  { level: 4, name: 'Problem Solver', minXp: 1100, nextXp: 1800 },
  { level: 5, name: 'Specialist', minXp: 1800, nextXp: 2700 },
  { level: 6, name: 'Innovator', minXp: 2700, nextXp: 3800 },
  { level: 7, name: 'Career Engineer', minXp: 3800, nextXp: null },
];

export type XpActivityType =
  | 'DAILY_CHALLENGE'
  | 'ASSESSMENT_COMPLETE'
  | 'MISSION_COMPLETE'
  | 'BOSS_CHALLENGE'
  | 'PROJECT_SUBMITTED';

export const SERVER_XP_REWARDS: Record<XpActivityType, number> = {
  DAILY_CHALLENGE: 60,
  ASSESSMENT_COMPLETE: 80,
  MISSION_COMPLETE: 100,
  BOSS_CHALLENGE: 220,
  PROJECT_SUBMITTED: 140,
};

export function computeLevelFromXp(totalXp: number): {
  current: LevelTier;
  progressPercent: number;
  xpToNext: number;
} {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let current = LEVEL_TIERS[0];
  for (const tier of LEVEL_TIERS) {
    if (safeXp >= tier.minXp) {
      current = tier;
    }
  }
  if (current.nextXp === null) {
    return { current, progressPercent: 100, xpToNext: 0 };
  }
  const span = current.nextXp - current.minXp;
  const earnedInTier = safeXp - current.minXp;
  const progressPercent = Math.max(0, Math.min(100, Math.round((earnedInTier / span) * 100)));
  return {
    current,
    progressPercent,
    xpToNext: Math.max(0, current.nextXp - safeXp),
  };
}

/**
 * Formats a timestamp into YYYY-MM-DD in the learner's configured timezone.
 */
export function getLocalDateString(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function computeUpdatedStreak(
  lastActiveDate: string | null,
  currentStreak: number,
  longestStreak: number,
  todayDate: string
): { currentStreak: number; longestStreak: number; lastActiveDate: string } {
  if (!lastActiveDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, longestStreak),
      lastActiveDate: todayDate,
    };
  }
  if (lastActiveDate === todayDate) {
    return {
      currentStreak: Math.max(1, currentStreak),
      longestStreak: Math.max(1, longestStreak, currentStreak),
      lastActiveDate: todayDate,
    };
  }
  const prev = new Date(`${lastActiveDate}T00:00:00Z`);
  const curr = new Date(`${todayDate}T00:00:00Z`);
  const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    const next = currentStreak + 1;
    return {
      currentStreak: next,
      longestStreak: Math.max(longestStreak, next),
      lastActiveDate: todayDate,
    };
  }
  return {
    currentStreak: 1,
    longestStreak: Math.max(1, longestStreak),
    lastActiveDate: todayDate,
  };
}
