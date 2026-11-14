import { lazy, Suspense, useEffect, useState } from 'react';
import { ApiError, api, type DashboardPayload } from './lib/api';
import { AuthExperience } from './components/AuthExperience';
import { type NavPage, SidebarShell } from './components/SidebarShell';
import {
  AppErrorBoundary,
  BrandedErrorPage,
  BrandedLoader,
  DashboardSkeleton,
  type SystemErrorKind,
} from './components/SystemStates';

const OnboardingWizard = lazy(() =>
  import('./components/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard }))
);
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const SkillProofView = lazy(() =>
  import('./components/SkillProofView').then((m) => ({ default: m.SkillProofView }))
);
const CareerExplorerView = lazy(() =>
  import('./components/CareerExplorerView').then((m) => ({ default: m.CareerExplorerView }))
);
const LearningRoadmapView = lazy(() =>
  import('./components/LearningRoadmapView').then((m) => ({ default: m.LearningRoadmapView }))
);
const NexoraPlayView = lazy(() =>
  import('./components/NexoraPlayView').then((m) => ({ default: m.NexoraPlayView }))
);
const AiMentorView = lazy(() =>
  import('./components/AiMentorView').then((m) => ({ default: m.AiMentorView }))
);
const ProjectsView = lazy(() =>
  import('./components/ProjectsView').then((m) => ({ default: m.ProjectsView }))
);
const CareerReadinessView = lazy(() =>
  import('./components/CareerReadinessView').then((m) => ({ default: m.CareerReadinessView }))
);
const ProfileSettingsView = lazy(() =>
  import('./components/ProfileSettingsView').then((m) => ({ default: m.ProfileSettingsView }))
);
const AssessmentModal = lazy(() =>
  import('./components/AssessmentModal').then((m) => ({ default: m.AssessmentModal }))
);

const KNOWN_PATHS = new Set([
  '/',
  '/index.html',
  '/login',
  '/register',
  '/onboarding',
  '/dashboard',
  '/skillproof',
  '/careers',
  '/roadmap',
  '/play',
  '/mentor',
  '/projects',
  '/readiness',
  '/profile',
  '/settings',
]);

function pathToNavPage(pathname: string): NavPage | null {
  switch (pathname) {
    case '/dashboard':
      return 'dashboard';
    case '/skillproof':
      return 'skillproof';
    case '/careers':
      return 'careers';
    case '/roadmap':
      return 'roadmap';
    case '/play':
      return 'play';
    case '/mentor':
      return 'mentor';
    case '/projects':
      return 'projects';
    case '/readiness':
      return 'readiness';
    case '/profile':
      return 'profile';
    case '/settings':
      return 'settings';
    default:
      return null;
  }
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [activePage, setActivePage] = useState<NavPage>(() => {
    return pathToNavPage(window.location.pathname) ?? 'dashboard';
  });
  const [assessmentSkillId, setAssessmentSkillId] = useState<string | null>(null);
  const [routeNotFound, setRouteNotFound] = useState<boolean>(() => {
    const p = window.location.pathname;
    return !KNOWN_PATHS.has(p);
  });
  const [systemError, setSystemError] = useState<{ kind: SystemErrorKind; detail?: string } | null>(
    null
  );

  async function bootstrapSession() {
    setBooting(true);
    setSystemError(null);
    const params = new URLSearchParams(window.location.search);
    const autoStart = params.get('autostart') === '1';

    try {
      const res = await api.me();
      if (res.authenticated && res.dashboard) {
        setDashboard(res.dashboard);
      } else if (autoStart) {
        try {
          const demo = await api.demoLogin();
          setDashboard(demo.dashboard);
        } catch {
          // Fall back to login screen cleanly
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) {
          setSystemError({ kind: 'network', detail: err.message });
        } else if (err.status >= 500) {
          setSystemError({ kind: '500', detail: err.message });
        }
      }
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    bootstrapSession();
  }, []);

  async function handleStartDemo() {
    setDemoLoading(true);
    try {
      const res = await api.demoLogin();
      setDashboard(res.dashboard);
      setActivePage('dashboard');
      setRouteNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setSystemError({ kind: 'network', detail: err.message });
      }
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Clear local session regardless
    }
    setDashboard(null);
    setActivePage('dashboard');
    setRouteNotFound(false);
    if (window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }

  function handleNavigate(page: NavPage) {
    setActivePage(page);
    setRouteNotFound(false);
    setSystemError(null);
  }

  if (booting) {
    return (
      <BrandedLoader
        message="Preparing your learning experience..."
        submessage="Restoring your session, domain roadmap, and SkillProof ledger"
      />
    );
  }

  if (systemError) {
    return (
      <BrandedErrorPage
        kind={systemError.kind}
        detail={systemError.detail}
        onReturnDashboard={() => {
          setSystemError(null);
          if (dashboard) {
            setActivePage('dashboard');
          } else {
            bootstrapSession();
          }
        }}
        onRetry={bootstrapSession}
      />
    );
  }

  if (routeNotFound) {
    return (
      <BrandedErrorPage
        kind="404"
        onReturnDashboard={() => {
          setRouteNotFound(false);
          setActivePage('dashboard');
          window.history.replaceState({}, '', '/');
        }}
        onExploreCourses={() => {
          setRouteNotFound(false);
          setActivePage('careers');
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  if (!dashboard) {
    return (
      <AppErrorBoundary onReset={() => setDashboard(null)}>
        <AuthExperience
          onSuccess={(nextDashboard) => {
            setDashboard(nextDashboard);
            setActivePage('dashboard');
          }}
          onStartDemo={handleStartDemo}
          demoLoading={demoLoading}
        />
      </AppErrorBoundary>
    );
  }

  if (!dashboard.profile.onboardingCompleted) {
    return (
      <AppErrorBoundary onReset={() => setActivePage('dashboard')}>
        <Suspense
          fallback={
            <BrandedLoader
              message="Loading onboarding workspace..."
              submessage="Preparing academic domains and baseline assessment"
            />
          }
        >
          <OnboardingWizard
            dashboard={dashboard}
            onUpdated={setDashboard}
            onComplete={(nextDashboard) => {
              setDashboard(nextDashboard);
              setActivePage('dashboard');
            }}
            onLogout={handleLogout}
          />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary onReset={() => setActivePage('dashboard')}>
      <SidebarShell
        activePage={activePage}
        onNavigate={handleNavigate}
        profile={dashboard.profile}
        domainMeta={dashboard.domainMeta}
        totalXp={dashboard.gamification.totalXp}
        levelName={dashboard.gamification.level.name}
        onLogout={handleLogout}
      >
        <Suspense fallback={<DashboardSkeleton />}>
          {activePage === 'dashboard' && (
            <DashboardView
              dashboard={dashboard}
              onNavigate={handleNavigate}
              onStartAssessment={(skillId) => setAssessmentSkillId(skillId)}
            />
          )}
          {activePage === 'skillproof' && (
            <SkillProofView
              dashboard={dashboard}
              onUpdated={setDashboard}
              onStartAssessment={(skillId) => setAssessmentSkillId(skillId)}
            />
          )}
          {activePage === 'careers' && (
            <CareerExplorerView dashboard={dashboard} onUpdated={setDashboard} />
          )}
          {activePage === 'roadmap' && (
            <LearningRoadmapView
              dashboard={dashboard}
              onUpdated={setDashboard}
              onStartAssessment={(skillId) => setAssessmentSkillId(skillId)}
            />
          )}
          {activePage === 'play' && (
            <NexoraPlayView dashboard={dashboard} onUpdated={setDashboard} />
          )}
          {activePage === 'mentor' && <AiMentorView dashboard={dashboard} />}
          {activePage === 'projects' && (
            <ProjectsView dashboard={dashboard} onUpdated={setDashboard} />
          )}
          {activePage === 'readiness' && <CareerReadinessView dashboard={dashboard} />}
          {activePage === 'profile' && (
            <ProfileSettingsView mode="profile" dashboard={dashboard} onUpdated={setDashboard} />
          )}
          {activePage === 'settings' && (
            <ProfileSettingsView mode="settings" dashboard={dashboard} onUpdated={setDashboard} />
          )}
        </Suspense>
      </SidebarShell>

      {assessmentSkillId && (
        <Suspense fallback={null}>
          <AssessmentModal
            skillId={assessmentSkillId}
            onClose={() => setAssessmentSkillId(null)}
            onUpdated={setDashboard}
            onNavigate={handleNavigate}
          />
        </Suspense>
      )}
    </AppErrorBoundary>
  );
}
