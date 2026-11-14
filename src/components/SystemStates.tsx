import React from 'react';
import { Compass, Home, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { BrandMark } from './BrandMark';

export function BrandedLoader({
  message = 'Preparing your learning experience...',
  submessage,
}: {
  message?: string;
  submessage?: string;
}) {
  return (
    <div className="min-h-screen bg-[#F8F6EF] text-[#24231F] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-8 text-center shadow-sm">
        <div className="flex justify-center mb-5">
          <BrandMark size={38} variant="icon" />
        </div>
        <div className="font-serif text-2xl text-[#24231F]">NEXORA</div>
        <p className="mt-2 text-sm font-medium text-[#24231F]">{message}</p>
        {submessage && <p className="mt-1 text-xs text-[#89877F]">{submessage}</p>}
        <div className="mt-6 h-1.5 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-[#E8B52E] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function AiContextualLoader({
  title = 'Analyzing your profile and assessment',
  steps = [
    'Evaluating topic accuracy across core subjects',
    'Calibrating your personalized difficulty level',
    'Synchronizing your adaptive learning roadmap',
  ],
  activeIndex = 0,
}: {
  title?: string;
  steps?: string[];
  activeIndex?: number;
}) {
  return (
    <div className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BrandMark size={26} variant="icon" />
        <div>
          <div className="text-sm font-semibold text-[#24231F]">{title}</div>
          <div className="text-xs text-[#89877F]">NEXORA Adaptive Engine</div>
        </div>
      </div>
      <div className="space-y-2.5">
        {steps.map((step, idx) => (
          <div
            key={step}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
              idx === activeIndex
                ? 'border-[#E8B52E] bg-[#F4E3B2]/50 font-semibold text-[#24231F]'
                : idx < activeIndex
                  ? 'border-[#77764B]/30 bg-[#77764B]/10 text-[#24231F]'
                  : 'border-[#E8E3D8] bg-white text-[#89877F]'
            }`}
          >
            <span className="font-mono text-[11px] tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-[#E8E3D8]" />
      <div className="h-44 w-full rounded-2xl bg-[#E8E3D8]/70" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-[#E8E3D8]/70" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 h-64 rounded-2xl bg-[#E8E3D8]/60" />
        <div className="lg:col-span-5 h-64 rounded-2xl bg-[#E8E3D8]/60" />
      </div>
    </div>
  );
}

export type SystemErrorKind = '404' | '401' | '403' | '500' | 'network';

export function BrandedErrorPage({
  kind,
  detail,
  onReturnDashboard,
  onExploreCourses,
  onRetry,
}: {
  kind: SystemErrorKind;
  detail?: string;
  onReturnDashboard: () => void;
  onExploreCourses?: () => void;
  onRetry?: () => void;
}) {
  const copy: Record<
    SystemErrorKind,
    { code: string; headline: string; body: string; Icon: typeof ShieldAlert }
  > = {
    '404': {
      code: '404 · Page Not Found',
      headline: "Looks like you've lost your direction.",
      body: 'The route you entered does not match a NEXORA workspace module. Return to your personalized dashboard or explore academic courses.',
      Icon: Compass,
    },
    '401': {
      code: '401 · Session Expired',
      headline: 'Please sign in to continue your learning.',
      body: detail || 'Your session has expired or requires fresh authentication.',
      Icon: ShieldAlert,
    },
    '403': {
      code: '403 · Access Restricted',
      headline: 'You do not have permission for this resource.',
      body: detail || 'Switch back to your personal learner workspace or verify your account.',
      Icon: ShieldAlert,
    },
    '500': {
      code: '500 · Server Issue',
      headline: 'Something unexpected interrupted NEXORA.',
      body: detail || 'Your saved progress and evidence records remain safe. Please retry in a moment.',
      Icon: ShieldAlert,
    },
    network: {
      code: 'Network Error',
      headline: 'Connection interrupted.',
      body: detail || 'Unable to reach NEXORA right now. Verify your internet connection and retry.',
      Icon: WifiOff,
    },
  };

  const meta = copy[kind];
  const Icon = meta.Icon;

  return (
    <div className="min-h-screen bg-[#F8F6EF] text-[#24231F] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-8 sm:p-10 shadow-sm text-center">
        <div className="flex justify-center mb-6">
          <BrandMark size={30} variant="light" />
        </div>

        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#E8E3D8] bg-white text-[#D77B43]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="text-xs font-mono uppercase tracking-wider text-[#77764B]">{meta.code}</div>
        <h1 className="mt-2 font-serif text-3xl text-[#24231F]">{meta.headline}</h1>
        <p className="mt-3 text-sm text-[#89877F] leading-relaxed">{meta.body}</p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onReturnDashboard}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8B52E] px-5 py-2.5 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] transition-colors cursor-pointer"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Return to Dashboard</span>
          </button>

          {onExploreCourses && (
            <button
              type="button"
              onClick={onExploreCourses}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#24231F] hover:border-[#24231F] transition-colors cursor-pointer"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              <span>Explore Courses</span>
            </button>
          )}

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#24231F] hover:border-[#24231F] transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <BrandedErrorPage
          kind="500"
          detail={this.state.errorMessage}
          onReturnDashboard={() => {
            this.setState({ hasError: false, errorMessage: '' });
            this.props.onReset?.();
          }}
          onRetry={() => {
            this.setState({ hasError: false, errorMessage: '' });
          }}
        />
      );
    }
    return this.props.children;
  }
}
