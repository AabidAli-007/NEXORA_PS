import { useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Compass,
  FolderGit2,
  Gamepad2,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  User,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import type { LearnerProfile } from '../core/types';
import { getDomainMeta, type DomainMeta } from '../data/domainsCatalog';

export type NavPage =
  | 'dashboard'
  | 'skillproof'
  | 'careers'
  | 'roadmap'
  | 'play'
  | 'mentor'
  | 'projects'
  | 'readiness'
  | 'profile'
  | 'settings';

export const NAV_ITEMS: { id: NavPage; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'skillproof', label: 'SkillProof', icon: Award },
  { id: 'careers', label: 'Career Explorer', icon: Compass },
  { id: 'roadmap', label: 'Learning Roadmap', icon: BookOpen },
  { id: 'play', label: 'NEXORA PLAY', icon: Gamepad2 },
  { id: 'mentor', label: 'AI Mentor', icon: MessageSquare },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'readiness', label: 'Career Readiness', icon: BarChart3 },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarShellProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  profile: LearnerProfile;
  domainMeta?: DomainMeta;
  totalXp: number;
  levelName: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export function SidebarShell({
  activePage,
  onNavigate,
  profile,
  domainMeta,
  totalXp,
  levelName,
  onLogout,
  children,
}: SidebarShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolvedDomain = domainMeta ?? getDomainMeta(profile.domainId);
  const adaptedNavItems = NAV_ITEMS.map((item) =>
    item.id === 'projects' && !resolvedDomain.supportsGitHubProjects
      ? { ...item, label: resolvedDomain.artifactLabel || 'Artifacts & Cases' }
      : item
  );

  const initials = profile.displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const currentNav = adaptedNavItems.find((n) => n.id === activePage) ?? adaptedNavItems[0];

  function handleSelect(page: NavPage) {
    onNavigate(page);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#F8F6EF] text-[#24231F] flex flex-col lg:flex-row">
      {/* Mobile Top Bar (compact <= 56px) */}
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E8E3D8] bg-[#FDFBF6] px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E8E3D8] bg-white text-[#24231F] cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark size={22} />
        </div>
        <span className="text-xs font-semibold text-[#77764B] truncate max-w-[140px]">
          {currentNav.label}
        </span>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#24231F]/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-[#FDFBF6] border-r border-[#E8E3D8] p-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#E8E3D8]">
              <BrandMark size={22} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#89877F] hover:text-[#24231F] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Mobile Navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {adaptedNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activePage;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#F4E3B2] text-[#24231F] font-semibold'
                        : 'text-[#24231F]/75 hover:bg-[#F8F6EF] hover:text-[#24231F]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-[#E8E3D8] pt-3 mt-3">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#89877F] hover:text-[#24231F] cursor-pointer"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:border-r lg:border-[#E8E3D8] lg:bg-[#FDFBF6] lg:sticky lg:top-0 lg:h-screen">
        <div className="px-5 py-5 border-b border-[#E8E3D8]">
          <BrandMark size={24} />
        </div>

        <nav aria-label="Main Navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {adaptedNavItems.slice(0, 8).map((item) => {
            const Icon = item.icon;
            const active = item.id === activePage;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#F4E3B2] text-[#24231F] font-semibold'
                    : 'text-[#24231F]/75 hover:bg-[#F8F6EF] hover:text-[#24231F] font-medium'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-[#E8E3D8] space-y-1">
            {adaptedNavItems.slice(8).map((item) => {
              const Icon = item.icon;
              const active = item.id === activePage;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#F4E3B2] text-[#24231F] font-semibold'
                      : 'text-[#24231F]/75 hover:bg-[#F8F6EF] hover:text-[#24231F] font-medium'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-[#E8E3D8] p-4 space-y-3">
          <div className="rounded-lg bg-[#F8F6EF] border border-[#E8E3D8] px-3 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#24231F]">{levelName}</span>
              <span className="font-mono text-[#77764B] tabular-nums">{totalXp} XP</span>
            </div>
            {profile.isDemo && (
              <div className="mt-1 text-[11px] text-[#89877F]">Seeded Demo Learner</div>
            )}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[#89877F] hover:text-[#24231F] transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden lg:flex h-16 items-center justify-between border-b border-[#E8E3D8] bg-[#FDFBF6]/80 px-8">
          <div className="flex items-center gap-2 text-xs text-[#89877F]">
            <span>NEXORA</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#24231F]">{currentNav.label}</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#77764B] truncate max-w-[260px]">
              {resolvedDomain.name} · {profile.courseName}
            </span>
            {profile.isDemo && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#77764B] font-medium">Demo Learner</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => handleSelect('profile')}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-[#F8F6EF] transition-colors cursor-pointer"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#24231F] text-xs font-semibold text-[#F8F6EF]">
                {initials}
              </span>
              <span className="text-sm font-medium text-[#24231F] whitespace-nowrap">
                {profile.displayName}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
