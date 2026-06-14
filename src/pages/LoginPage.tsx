import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extractApiError } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { role: 'AP Clerk', email: 'clerk@martinrea.dev', password: 'Password123!' },
  { role: 'Plant Manager', email: 'pm@martinrea.dev', password: 'Password123!' },
  { role: 'Finance Director', email: 'fd@martinrea.dev', password: 'Password123!' },
] as const;

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [demoPending, setDemoPending] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const doLogin = async (email: string, password: string) => {
    await login(email, password);
    toast.success('Welcome back');
    navigate('/dashboard', { replace: true });
  };

  const onSubmit = handleSubmit(async (data) => {
    try {
      await doLogin(data.email, data.password);
    } catch (err) {
      toast.error(extractApiError(err, 'Login failed'));
    }
  });

  const handleDemoLogin = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setValue('email', account.email);
    setValue('password', account.password);
    setDemoPending(account.role);
    try {
      await doLogin(account.email, account.password);
    } catch (err) {
      toast.error(extractApiError(err, 'Login failed'));
    } finally {
      setDemoPending(null);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_520px]">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[460px] w-[460px] rounded-full bg-brand/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-[360px] w-[360px] rounded-full bg-brand-600/20 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 shadow-sm ring-1 ring-black/5">
            <img
              src="/martinrea-logo.png"
              alt="Martinrea"
              className="h-full w-full object-contain"
            />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tight">
              Martinrea
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-sidebar-muted">
              Automation Suite
            </span>
          </div>
        </div>

        <div className="relative max-w-[440px]">
          <h1 className="text-balance text-[40px] font-semibold leading-[1.1] tracking-tight">
            Accounts payable, run by software.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-300">
            Capture, match, route, and approve every supplier invoice with a
            full audit trail. Built for manufacturing finance teams that move
            thousands of invoices a month.
          </p>

          <ul className="mt-8 grid gap-3 text-[13.5px] text-slate-200">
            {[
              'Sequential approval routing by amount & plant',
              '2-way / 3-way match with SLA escalation',
              'Immutable audit log for every state transition',
              'SOX-ready segregation of duties enforced server-side',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[12px] text-sidebar-muted">
          © 2026 Martinrea. Phase 1 — Workflow & Approvals.
        </div>
      </div>

      {/* Right login form */}
      <div className="flex flex-col bg-white px-6 py-10 sm:px-10 lg:px-14">
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 ring-1 ring-black/5">
            <img
              src="/martinrea-logo.png"
              alt="Martinrea"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Martinrea
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h2 className="text-[26px] font-semibold tracking-tight text-ink">
            Sign in to your workspace
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Use your Martinrea credentials to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="pl-9"
                  placeholder="you@martinrea.dev"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-[12px] font-medium text-brand hover:underline"
                  onClick={() =>
                    toast.info(
                      'Password reset flow ships in Phase 2. Use the seeded credentials below for now.',
                    )
                  }
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pl-9 pr-9"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Demo accounts — seeded backend credentials for quick sign-in */}
          <div className="mt-7">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
                Demo accounts
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="mt-4 grid gap-2">
              {DEMO_ACCOUNTS.map((account) => {
                const pending = demoPending === account.role;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleDemoLogin(account)}
                    disabled={isSubmitting || demoPending !== null}
                    className="group flex items-center justify-between rounded-md border border-line bg-white px-3.5 py-2.5 text-left transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex flex-col">
                      <span className="text-[13px] font-medium text-ink">
                        {account.role}
                      </span>
                      <span className="text-[11.5px] text-ink-muted">
                        {account.email}
                      </span>
                    </span>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    ) : (
                      <span className="text-[11.5px] font-medium text-brand opacity-0 transition group-hover:opacity-100">
                        Sign in →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-center text-[11.5px] text-ink-muted">
              Password for all accounts:{' '}
              <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
                Password123!
              </code>
            </p>
          </div>

          <p className="mt-8 text-center text-[11.5px] text-ink-muted">
            Need access?{' '}
            <a
              href="mailto:ap-platform@martinrea.com"
              className="font-medium text-brand hover:underline"
            >
              Contact your AP administrator
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
