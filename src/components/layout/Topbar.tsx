import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, HelpCircle, Keyboard, Mail, Menu, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth/useAuth';
import { NAV_SECTIONS, canAccessPath } from './nav-items';
import { initials } from '@/lib/utils';
import { UploadInvoiceModal } from '@/components/invoices/UploadInvoiceModal';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsMenu } from './NotificationsMenu';
import { RolePill } from '@/components/auth/RolePill';
import { profileFor } from '@/lib/permissions';

function useBreadcrumb(): string[] {
  const { pathname } = useLocation();
  return useMemo(() => {
    const trail: string[] = ['Workspace'];
    for (const sec of NAV_SECTIONS) {
      const match = sec.items.find((i) => pathname.startsWith(i.to));
      if (match) {
        trail[0] = sec.heading;
        trail.push(match.label);
        break;
      }
    }
    return trail;
  }, [pathname]);
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const trail = useBreadcrumb();
  const [uploadOpen, setUploadOpen] = useState(false);

  const profile = profileFor(user?.role);
  const canCreate = profile?.canCreate ?? false;

  // ⌘K / Ctrl-K focuses the search box; ⌘U / Ctrl-U opens "Upload Invoice" if allowed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u' && canCreate) {
        e.preventDefault();
        setUploadOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canCreate]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="-ml-1 rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        {trail.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" />}
            <span
              className={
                i === trail.length - 1
                  ? 'font-semibold text-ink'
                  : 'font-medium'
              }
            >
              {seg}
            </span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <GlobalSearch />

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2">
        {canCreate && (
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <UploadCloud className="h-4 w-4" />
            <span className="hidden sm:inline">Upload Invoice</span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Help">
              <HelpCircle className="h-[18px] w-[18px] text-ink-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Keyboard className="h-3.5 w-3.5" />
              Keyboard shortcuts
            </DropdownMenuLabel>
            <div className="space-y-1.5 px-2 py-1.5 text-[12.5px] text-ink-muted">
              <ShortcutRow label="Focus search" keys="⌘K" />
              {canCreate && <ShortcutRow label="Upload invoice" keys="⌘U" />}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                window.open('mailto:ap-platform@martinrea.com', '_blank')
              }
            >
              <Mail className="h-4 w-4" />
              Contact AP administrator
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationsMenu />

        <div className="mx-1 h-7 w-px bg-line" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full p-0.5 pl-2 pr-1 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-semibold text-ink">
                  {user?.fullName ?? 'Guest'}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {profile?.label ?? user?.role}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white">
                {initials(user?.fullName ?? 'G U')}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Signed in</DropdownMenuLabel>
            <div className="px-2 pb-2 pt-1">
              <p className="text-sm font-medium text-ink">{user?.fullName}</p>
              <p className="text-xs text-ink-muted">{user?.email}</p>
              {user && (
                <div className="mt-2.5">
                  <RolePill role={user.role} showCap size="md" />
                </div>
              )}
              {profile && (
                <>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    What you can do
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {profile.capabilities.map((cap) => (
                      <li
                        key={cap}
                        className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-muted"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
              Go to Dashboard
            </DropdownMenuItem>
            {canAccessPath('/admin', user?.role) && (
              <DropdownMenuItem onSelect={() => navigate('/admin')}>
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={logout}
              className="text-red-600 focus:text-red-700"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {canCreate && (
        <UploadInvoiceModal open={uploadOpen} onOpenChange={setUploadOpen} />
      )}
    </header>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <kbd className="select-none rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
        {keys}
      </kbd>
    </div>
  );
}
