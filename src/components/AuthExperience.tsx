import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { ApiError, api, type DashboardPayload, type OAuthProvidersPayload } from '../lib/api';
import { BrandMark } from './BrandMark';
import { NEXORA_ASSETS } from '../lib/assets';

type AuthMode = 'login' | 'register' | 'verify-email' | 'forgot' | 'reset';

interface AuthExperienceProps {
  onSuccess: (dashboard: DashboardPayload) => void;
  onStartDemo: () => Promise<void>;
  demoLoading: boolean;
  initialMode?: AuthMode;
  pendingVerifyDashboard?: DashboardPayload | null;
}

const BENEFITS = [
  {
    icon: Compass,
    title: 'Course and Career Guidance',
    detail: 'Structured pathways across 8 academic & industry domains',
  },
  {
    icon: ClipboardCheck,
    title: 'Skill and Knowledge Assessment',
    detail: 'Diagnostic verification separating claims from real mastery',
  },
  {
    icon: MapIcon,
    title: 'Personalized Learning Roadmap',
    detail: 'Prerequisite-ordered steps adapted to your pace & results',
  },
  {
    icon: Sparkles,
    title: 'AI Learning Mentor',
    detail: 'Multi-turn adaptive tutoring with progressive Socratic hints',
  },
];

function GoogleGlyph() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.25-.96 2.31-2.05 3.02l3.31 2.57c1.93-1.78 3.04-4.4 3.04-7.5 0-.72-.06-1.41-.19-2.09H12z"
      />
      <path
        fill="#4285F4"
        d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.31-2.57c-.91.61-2.08.97-3.44.97-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64C4.57 19.72 8.02 22 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.3 13.73A5.97 5.97 0 0 1 6 12c0-.6.11-1.18.3-1.73V7.63H2.89A9.96 9.96 0 0 0 2 12c0 1.61.39 3.14 1.09 4.37l3.21-2.64z"
      />
      <path
        fill="#34A853"
        d="M12 6.07c1.5 0 2.84.51 3.9 1.52l2.92-2.92C17.05 3.02 14.74 2 12 2 8.02 2 4.57 4.28 2.89 7.63l3.41 2.64c.8-2.41 3.05-4.2 5.7-4.2z"
      />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="9.2" height="9.2" fill="#F25022" />
      <rect x="12.8" y="2" width="9.2" height="9.2" fill="#7FBA00" />
      <rect x="2" y="12.8" width="9.2" height="9.2" fill="#00A4EF" />
      <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFB900" />
    </svg>
  );
}

export function AuthExperience({
  onSuccess,
  onStartDemo,
  demoLoading,
  initialMode = 'login',
  pendingVerifyDashboard = null,
}: AuthExperienceProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [verifyCode, setVerifyCode] = useState('');
  const [verifyPreviewCode, setVerifyPreviewCode] = useState<string | null>(null);
  const [pendingDash, setPendingDash] = useState<DashboardPayload | null>(pendingVerifyDashboard);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'microsoft' | null>(null);
  const [activeOauthFlow, setActiveOauthFlow] = useState<{
    provider: 'google' | 'microsoft';
    url: string;
    handoffId: string;
  } | null>(null);
  const [showTabFallback, setShowTabFallback] = useState(false);
  const [openedInTab, setOpenedInTab] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oauthSetupInfo, setOauthSetupInfo] = useState<{
    provider: 'Google' | 'Microsoft';
    missingEnvVars: string[];
    callbackUrl: string;
    providerKey: 'google' | 'microsoft';
  } | null>(null);

  const [providersInfo, setProvidersInfo] = useState<OAuthProvidersPayload | null>(null);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const preloadedOAuthRef = useRef<
    Partial<Record<'google' | 'microsoft', { url: string; handoffId: string; fetchedAt: number }>>
  >({});
  const completingRef = useRef(false);
  const popupRef = useRef<Window | null>(null);

  const preloadProviderUrl = useCallback(async (provider: 'google' | 'microsoft') => {
    try {
      const res = await api.getOAuthUrl(provider, window.location.origin);
      if (res.url && res.handoffId) {
        preloadedOAuthRef.current[provider] = {
          url: res.url,
          handoffId: res.handoffId,
          fetchedAt: Date.now(),
        };
      }
    } catch {
      delete preloadedOAuthRef.current[provider];
    }
  }, []);

  useEffect(() => {
    if (!legalModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLegalModal(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [legalModal]);

  useEffect(() => {
    let active = true;
    api
      .getOAuthProviders()
      .then((info) => {
        if (!active) return;
        setProvidersInfo(info);
        if (info.google.configured) void preloadProviderUrl('google');
        if (info.microsoft.configured) void preloadProviderUrl('microsoft');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [preloadProviderUrl]);

  const finishOAuthWithToken = useCallback(
    (token: string | null | undefined) => {
      if (completingRef.current) return;
      completingRef.current = true;
      setOauthLoading(null);
      setActiveOauthFlow(null);
      setShowTabFallback(false);
      setOpenedInTab(false);
      setError(null);

      try {
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
      } catch {
        // Ignore cross-origin close restrictions
      }
      popupRef.current = null;

      if (token) {
        api.setToken(token, true);
      }
      api
        .me()
        .then((res) => {
          if (res.authenticated && res.dashboard) {
            onSuccess(res.dashboard);
          } else {
            completingRef.current = false;
            setError('Signed in via OAuth, but session verification failed. Please retry.');
          }
        })
        .catch(() => {
          completingRef.current = false;
          setError('Signed in via OAuth, but could not load your workspace. Please refresh.');
        });
    },
    [onSuccess]
  );

  const handleOAuthFailure = useCallback((message: string) => {
    completingRef.current = false;
    setOauthLoading(null);
    setActiveOauthFlow(null);
    setShowTabFallback(false);
    setOpenedInTab(false);
    popupRef.current = null;
    setError(message || 'OAuth authentication was cancelled or failed.');
  }, []);

  useEffect(() => {
    function handlePayload(payload: {
      type?: string;
      token?: string | null;
      error?: string;
    } | null) {
      if (!payload || !payload.type) return;
      if (payload.type === 'OAUTH_AUTH_SUCCESS') {
        finishOAuthWithToken(payload.token);
      } else if (payload.type === 'OAUTH_AUTH_ERROR') {
        handleOAuthFailure(payload.error || 'OAuth authentication was cancelled or failed.');
      }
    }

    function handleOAuthMessage(event: MessageEvent) {
      const origin = event.origin || '';
      if (
        origin &&
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      handlePayload(event.data as { type?: string; token?: string | null; error?: string } | null);
    }

    window.addEventListener('message', handleOAuthMessage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('nexora_oauth_channel');
        channel.onmessage = (ev) => {
          handlePayload(ev.data as { type?: string; token?: string | null; error?: string } | null);
        };
      }
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // Ignore close errors
        }
      }
    };
  }, [finishOAuthWithToken, handleOAuthFailure]);

  // Stall watchdog, popup-close watcher, and server handoff polling (survives COOP & new-tab flow)
  useEffect(() => {
    if (!activeOauthFlow) return;
    let cancelled = false;

    const stallTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowTabFallback(true);
      }
    }, 3500);

    const pollTimer = window.setInterval(async () => {
      if (cancelled || completingRef.current) return;
      try {
        const statusRes = await api.pollOAuthHandoff(activeOauthFlow.handoffId);
        if (cancelled) return;
        if (statusRes.status === 'SUCCESS') {
          finishOAuthWithToken(statusRes.token);
        } else if (statusRes.status === 'ERROR') {
          handleOAuthFailure(statusRes.error || 'OAuth authentication failed.');
        }
      } catch {
        // Ignore transient poll errors while user completes OAuth
      }
    }, 1500);

    const closeWatcher = window.setInterval(() => {
      if (cancelled || openedInTab) return;
      const win = popupRef.current;
      if (win && win.closed) {
        window.clearInterval(closeWatcher);
        // Give postMessage / handoff poll 500ms to settle before treating close as cancellation
        window.setTimeout(() => {
          if (!cancelled && !completingRef.current) {
            setShowTabFallback(true);
            setOauthLoading(null);
          }
        }, 500);
      }
    }, 600);

    const expiryTimer = window.setTimeout(() => {
      if (!cancelled && !completingRef.current) {
        handleOAuthFailure('OAuth sign-in timed out. Please try again or use Open Sign-In in New Tab.');
      }
    }, 180_000);

    return () => {
      cancelled = true;
      window.clearTimeout(stallTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(closeWatcher);
      window.clearTimeout(expiryTimer);
    };
  }, [activeOauthFlow, openedInTab, finishOAuthWithToken, handleOAuthFailure]);

  function resetMessages() {
    setError(null);
    setNotice(null);
    setOauthSetupInfo(null);
  }

  function cancelActiveOAuth() {
    completingRef.current = false;
    setOauthLoading(null);
    setActiveOauthFlow(null);
    setShowTabFallback(false);
    setOpenedInTab(false);
    try {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    } catch {
      // Ignore
    }
    popupRef.current = null;
  }

  function showUnconfiguredSetup(provider: 'google' | 'microsoft', message?: string, callbackUrl?: string, missingEnvVars?: string[]) {
    const providerLabel = provider === 'google' ? 'Google' : 'Microsoft';
    const fallbackCallback =
      callbackUrl ||
      (provider === 'google' ? providersInfo?.google.callbackUrl : providersInfo?.microsoft.callbackUrl) ||
      `${window.location.origin}/api/auth/oauth/${provider}/callback`;
    const vars =
      missingEnvVars && missingEnvVars.length > 0
        ? missingEnvVars
        : provider === 'google'
          ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
          : ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'];

    setOauthSetupInfo({
      provider: providerLabel,
      providerKey: provider,
      missingEnvVars: vars,
      callbackUrl: fallbackCallback,
    });
    setError(
      message ||
        `${providerLabel} OAuth is not configured on this server. Add ${vars.join(' and ')} in AI Studio Settings > Secrets and register the callback URL below.`
    );
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000);
    } catch {
      // Ignore clipboard failures
    }
  }

  async function handleOAuthClick(provider: 'google' | 'microsoft') {
    resetMessages();
    completingRef.current = false;
    setShowTabFallback(false);
    setOpenedInTab(false);

    // Fast path: if server already told us this provider is not configured, show setup immediately (never open about:blank)
    const providerMeta = provider === 'google' ? providersInfo?.google : providersInfo?.microsoft;
    if (providerMeta && !providerMeta.configured) {
      showUnconfiguredSetup(provider, undefined, providerMeta.callbackUrl, providerMeta.requiredEnvVars);
      return;
    }

    // Synchronous launch path: use pre-fetched provider URL so window.open executes inside user gesture (prevents about:blank stall)
    const cached = preloadedOAuthRef.current[provider];
    const isFresh = cached && Date.now() - cached.fetchedAt < 4 * 60 * 1000;
    if (isFresh && cached) {
      delete preloadedOAuthRef.current[provider];
      const popup = window.open(
        cached.url,
        `nexora_${provider}_oauth`,
        'width=520,height=640,menubar=no,toolbar=no,status=no'
      );
      popupRef.current = popup;
      setActiveOauthFlow({ provider, url: cached.url, handoffId: cached.handoffId });
      setOauthLoading(provider);
      if (!popup || popup.closed) {
        setShowTabFallback(true);
      }
      window.setTimeout(() => {
        void preloadProviderUrl(provider);
      }, 300);
      return;
    }

    // Async fallback if preload wasn't ready yet: fetch URL first, then open or present direct New Tab anchor
    setOauthLoading(provider);
    try {
      const res = await api.getOAuthUrl(provider, window.location.origin);
      if (!res.url) {
        throw new Error('Server did not return a valid OAuth URL.');
      }
      setActiveOauthFlow({ provider, url: res.url, handoffId: res.handoffId });
      const popup = window.open(
        res.url,
        `nexora_${provider}_oauth`,
        'width=520,height=640,menubar=no,toolbar=no,status=no'
      );
      popupRef.current = popup;
      if (!popup || popup.closed) {
        setShowTabFallback(true);
      }
      window.setTimeout(() => {
        void preloadProviderUrl(provider);
      }, 300);
    } catch (err) {
      setOauthLoading(null);
      setActiveOauthFlow(null);
      if (err instanceof ApiError && err.status === 503) {
        showUnconfiguredSetup(
          provider,
          err.message,
          typeof err.details.callbackUrl === 'string' ? err.details.callbackUrl : undefined,
          Array.isArray(err.details.missingEnvVars) ? (err.details.missingEnvVars as string[]) : undefined
        );
      } else {
        setError(err instanceof Error ? err.message : 'Unable to start OAuth sign-in.');
      }
    }
  }

  async function handleLoginOrRegister(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await api.login(email, password, rememberMe);
        onSuccess(res.dashboard);
      } else if (mode === 'register') {
        const res = await api.register(email, password, displayName, rememberMe);
        setPendingDash(res.dashboard);
        setVerifyPreviewCode(res.verificationPreviewCode || null);
        setNotice(
          res.verificationPreviewCode
            ? 'Account created! Enter the 6-digit verification code shown below (non-SMTP mode) to confirm your email before onboarding.'
            : 'Account created! Check your email for the 6-digit verification code.'
        );
        setMode('verify-email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await api.verifyEmail(verifyCode.trim());
      onSuccess(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendVerification() {
    resetMessages();
    try {
      const res = await api.resendVerification();
      setVerifyPreviewCode(res.verificationPreviewCode || null);
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a new verification code.');
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await api.forgotPassword(email);
      setNotice(res.message);
      if (res.resetPreviewToken) {
        setResetToken(res.resetPreviewToken);
        setMode('reset');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initiate password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await api.resetPassword(resetToken.trim(), newPassword);
      onSuccess(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F6EF] text-[#24231F] relative overflow-hidden">
      {/* Subtle warm radial corner washes matching reference */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[#E8B52E]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 right-0 h-80 w-80 rounded-full bg-[#E8B52E]/12 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-8 lg:py-12 min-h-screen flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* LEFT BRANDING & VALUE PANEL */}
          <section className="lg:col-span-6 space-y-6">
            <div>
              <BrandMark size={28} variant="light" />
            </div>

            <div className="space-y-3">
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[42px] leading-[1.15] text-[#24231F] tracking-tight">
                Your Personal Career &amp; Learning Intelligence Platform
              </h1>
              <p className="text-sm sm:text-base text-[#77764B] leading-relaxed max-w-xl">
                Understand your strengths, identify learning gaps and build a personalized path for
                your future.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 pt-1">
              {BENEFITS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3.5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] text-[#D77B43]">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-[#24231F]">{item.title}</div>
                      <div className="text-xs text-[#636159]">{item.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Editorial learner visual card */}
            <div className="hidden sm:flex items-center gap-4 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-3.5 max-w-lg">
              <img
                src={NEXORA_ASSETS.heroStudent}
                alt="Learner building a multi-domain career roadmap"
                className="h-20 w-28 rounded-xl object-cover shrink-0 border border-[#E8E3D8]"
              />
              <div className="min-w-0 space-y-1.5">
                <div className="text-xs font-semibold text-[#24231F]">
                  Explore with seeded demo learner (Aabid Rahman)
                </div>
                <p className="text-xs text-[#636159]">
                  Preview verified skills, SkillProof audit history, and multi-turn AI Mentor immediately.
                </p>
                <button
                  type="button"
                  onClick={onStartDemo}
                  disabled={demoLoading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#24231F] hover:text-[#61603B] underline underline-offset-4 cursor-pointer"
                >
                  <span>{demoLoading ? 'Preparing Demo Workspace…' : 'Launch Demo Learner'}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT LOGIN / ACCOUNT CARD */}
          <section className="lg:col-span-6 flex justify-center lg:justify-end">
            <div className="w-full max-w-[440px] rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 sm:p-8 shadow-sm">
              <div className="text-center mb-6">
                <h2 className="font-serif text-2xl sm:text-[28px] text-[#24231F]">
                  {mode === 'login' && 'Welcome to NEXORA'}
                  {mode === 'register' && 'Create Your NEXORA Account'}
                  {mode === 'verify-email' && 'Verify Your Email'}
                  {mode === 'forgot' && 'Recover Your Password'}
                  {mode === 'reset' && 'Set a New Password'}
                </h2>
                <p className="text-xs sm:text-sm text-[#636159] mt-1">
                  {mode === 'login' && 'Sign in to continue your learning journey'}
                  {mode === 'register' && 'Start your domain-adaptive career & study roadmap'}
                  {mode === 'verify-email' && 'Confirm your 6-digit verification code to secure your account'}
                  {mode === 'forgot' && 'Enter your registered email to receive a reset token'}
                  {mode === 'reset' && 'Enter your reset token and choose an 8+ character password'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-3.5 py-2.5 text-xs text-[#24231F] space-y-2"
                >
                  <div className="font-medium">{error}</div>
                  {oauthSetupInfo && (
                    <div className="pt-2 border-t border-[#D77B43]/30 text-[11px] space-y-2">
                      <div>
                        <strong>Required secrets:</strong>{' '}
                        <code className="font-mono">{oauthSetupInfo.missingEnvVars.join(', ')}</code>
                      </div>
                      <div className="space-y-1">
                        <div className="font-semibold">Authorized Callback URL:</div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] px-2.5 py-1.5">
                          <code className="font-mono text-[10px] break-all text-[#24231F]">
                            {oauthSetupInfo.callbackUrl}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyText('cb-active', oauthSetupInfo.callbackUrl)}
                            className="inline-flex items-center gap-1 shrink-0 rounded-md border border-[#E8E3D8] bg-white px-2 py-1 text-[10px] font-medium text-[#24231F] hover:bg-[#F8F6EF] cursor-pointer"
                          >
                            {copiedKey === 'cb-active' ? (
                              <>
                                <Check className="h-3 w-3 text-[#61603B]" aria-hidden="true" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" aria-hidden="true" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {notice && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 px-3.5 py-2.5 text-xs text-[#24231F]"
                >
                  {notice}
                </div>
              )}

              {(mode === 'login' || mode === 'register') && (
                <>
                  {/* Real Social OAuth Buttons */}
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => handleOAuthClick('google')}
                      disabled={oauthLoading !== null}
                      className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-[#E8E3D8] bg-white px-4 py-2.5 text-sm font-medium text-[#24231F] hover:border-[#24231F]/40 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <GoogleGlyph />
                      <span>
                        {oauthLoading === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOAuthClick('microsoft')}
                      disabled={oauthLoading !== null}
                      className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-[#E8E3D8] bg-white px-4 py-2.5 text-sm font-medium text-[#24231F] hover:border-[#24231F]/40 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <MicrosoftGlyph />
                      <span>
                        {oauthLoading === 'microsoft'
                          ? 'Connecting to Microsoft…'
                          : 'Continue with Microsoft'}
                      </span>
                    </button>

                    {activeOauthFlow && (showTabFallback || oauthLoading !== null) && (
                      <div className="rounded-xl border border-[#E8E3D8] bg-[#F8F6EF] p-3 text-xs text-[#24231F] space-y-2">
                        <div className="font-medium">
                          {showTabFallback
                            ? `Popup stalled or blocked for ${activeOauthFlow.provider === 'google' ? 'Google' : 'Microsoft'} sign-in.`
                            : `Waiting for ${activeOauthFlow.provider === 'google' ? 'Google' : 'Microsoft'} sign-in to finish…`}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={activeOauthFlow.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              setOpenedInTab(true);
                              setOauthLoading(activeOauthFlow.provider);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8B52E] px-3 py-1.5 text-xs font-semibold text-[#24231F] hover:bg-[#dca920] transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>Open Sign-In in New Tab</span>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            onClick={cancelActiveOAuth}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-medium text-[#77764B] hover:text-[#24231F] cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#E8E3D8]" />
                    <span className="text-xs text-[#636159]">
                      {mode === 'login' ? 'or sign in with email' : 'or register with email'}
                    </span>
                    <div className="h-px flex-1 bg-[#E8E3D8]" />
                  </div>

                  <form onSubmit={handleLoginOrRegister} className="space-y-3.5">
                    {mode === 'register' && (
                      <div>
                        <label htmlFor="auth-name" className="sr-only">
                          Full Name
                        </label>
                        <div className="relative">
                          <User
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636159]"
                            aria-hidden="true"
                          />
                          <input
                            id="auth-name"
                            type="text"
                            required
                            minLength={2}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Full name"
                            className="w-full rounded-xl border border-[#E8E3D8] bg-white pl-10 pr-3.5 py-2.5 text-sm text-[#24231F] focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="auth-email" className="sr-only">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636159]"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email address"
                          className="w-full rounded-xl border border-[#E8E3D8] bg-white pl-10 pr-3.5 py-2.5 text-sm text-[#24231F] focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="auth-pass" className="sr-only">
                        Password
                      </label>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636159]"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-pass"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={mode === 'register' ? 8 : 1}
                          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'}
                          className="w-full rounded-xl border border-[#E8E3D8] bg-white pl-10 pr-10 py-2.5 text-sm text-[#24231F] focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#636159] hover:text-[#24231F] cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <label className="inline-flex items-center gap-2 text-[#24231F] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded border-[#E8E3D8] accent-[#24231F]"
                        />
                        <span>Remember me</span>
                      </label>

                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            resetMessages();
                            setMode('forgot');
                          }}
                          className="font-medium text-[#A34E1D] hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B52E] py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      <span>
                        {submitting
                          ? 'Please wait…'
                          : mode === 'login'
                            ? 'Sign In'
                            : 'Create Account'}
                      </span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>

                  <div className="mt-5 text-center text-xs text-[#636159]">
                    {mode === 'login' ? (
                      <>
                        Don&apos;t have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            resetMessages();
                            setMode('register');
                          }}
                          className="font-semibold text-[#A34E1D] hover:underline cursor-pointer"
                        >
                          Create account
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            resetMessages();
                            setMode('login');
                          }}
                          className="font-semibold text-[#A34E1D] hover:underline cursor-pointer"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </div>

                  {/* Mobile demo launcher */}
                  <div className="mt-4 pt-4 border-t border-[#E8E3D8] sm:hidden text-center">
                    <button
                      type="button"
                      onClick={onStartDemo}
                      disabled={demoLoading}
                      className="text-xs font-semibold text-[#77764B] hover:text-[#24231F] underline underline-offset-4 cursor-pointer"
                    >
                      {demoLoading ? 'Loading Demo…' : 'Try Demo Learner (Aabid Rahman)'}
                    </button>
                  </div>
                </>
              )}

              {mode === 'verify-email' && (
                <form onSubmit={handleVerifyEmail} className="space-y-4">
                  {verifyPreviewCode && (
                    <div className="rounded-xl border border-[#E8B52E] bg-[#F4E3B2]/50 p-3.5 text-center">
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-[#77764B]">
                        Verification Code (No Email Server Configured)
                      </div>
                      <div className="mt-1 font-mono text-xl font-bold tracking-widest text-[#24231F]">
                        {verifyPreviewCode}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="verify-code" className="block text-xs font-semibold mb-1.5">
                      6-Digit Verification Code
                    </label>
                    <input
                      id="verify-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="123456"
                      className="w-full rounded-xl border border-[#E8E3D8] bg-white px-4 py-2.5 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B52E] py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>{submitting ? 'Verifying…' : 'Verify & Start Onboarding'}</span>
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className="font-semibold text-[#77764B] hover:text-[#24231F] cursor-pointer"
                    >
                      Resend Code
                    </button>
                    {pendingDash && (
                      <button
                        type="button"
                        onClick={() => onSuccess(pendingDash)}
                        className="font-medium text-[#636159] hover:text-[#24231F] cursor-pointer"
                      >
                        Verify later &amp; continue →
                      </button>
                    )}
                  </div>
                </form>
              )}

              {mode === 'forgot' && (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-semibold mb-1.5">
                      Registered Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      className="w-full rounded-xl border border-[#E8E3D8] bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B52E] py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                  >
                    <span>{submitting ? 'Generating Token…' : 'Send Reset Token'}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setMode('login');
                      }}
                      className="font-semibold text-[#61603B] hover:text-[#24231F] cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setMode('reset');
                      }}
                      className="font-medium text-[#A34E1D] hover:underline cursor-pointer"
                    >
                      Already have a token?
                    </button>
                  </div>
                </form>
              )}

              {mode === 'reset' && (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="reset-tok" className="block text-xs font-semibold mb-1.5">
                      Reset Token
                    </label>
                    <input
                      id="reset-tok"
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste reset token"
                      className="w-full rounded-xl border border-[#E8E3D8] bg-white px-3.5 py-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                    />
                  </div>

                  <div>
                    <label htmlFor="reset-pass" className="block text-xs font-semibold mb-1.5">
                      New Password (8+ characters)
                    </label>
                    <input
                      id="reset-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full rounded-xl border border-[#E8E3D8] bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8B52E] py-3 text-sm font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                  >
                    <span>{submitting ? 'Updating Password…' : 'Reset Password & Sign In'}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="text-center text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setMode('login');
                      }}
                      className="font-semibold text-[#61603B] hover:text-[#24231F] cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              )}

              {/* Terms & Privacy footer links */}
              <div className="mt-6 pt-4 border-t border-[#E8E3D8] flex items-center justify-center gap-4 text-[11px] text-[#636159]">
                <button
                  type="button"
                  onClick={() => setLegalModal('terms')}
                  className="hover:text-[#24231F] underline underline-offset-2 cursor-pointer"
                >
                  Terms of Use
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setLegalModal('privacy')}
                  className="hover:text-[#24231F] underline underline-offset-2 cursor-pointer"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Terms / Privacy Modal */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-modal-title"
          className="fixed inset-0 z-50 bg-[#24231F]/50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-[#24231F]">
                <ShieldCheck className="h-4 w-4 text-[#61603B]" aria-hidden="true" />
                <h3 id="legal-modal-title">
                  {legalModal === 'terms' ? 'NEXORA Terms of Use' : 'NEXORA Privacy Policy'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                aria-label="Close modal"
                className="text-[#636159] hover:text-[#24231F] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="text-xs text-[#24231F]/80 space-y-2 leading-relaxed">
              {legalModal === 'terms' ? (
                <>
                  <p>
                    NEXORA provides adaptive skill diagnostics, study roadmaps, and AI mentoring for
                    educational planning. Assessments reflect internal baseline readiness and do not
                    represent formal academic degrees or professional licensure.
                  </p>
                  <p>
                    Self-declared skills remain marked as Declared until substantiated by diagnostic
                    evidence or practical artifacts.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Your learning profile, entry assessment scores, and AI Mentor conversations are
                    stored privately in your learner workspace. OAuth tokens and passwords are never
                    exposed in client code.
                  </p>
                  <p>
                    Leaderboard participation is strictly opt-in and exposes only your display name
                    and engagement XP—never your grades or weak areas.
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="rounded-lg bg-[#24231F] px-4 py-2 text-xs font-semibold text-[#F8F6EF] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
