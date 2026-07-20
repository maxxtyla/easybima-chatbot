'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { login } from '@/lib/staffApi';

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    html.style.backgroundColor = '#000000';
    body.style.backgroundColor = '#000000';
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push('/staff/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overscroll-none flex items-center justify-center overflow-hidden bg-black px-4">
      {/* ── Ambient CIC-red background — layered radial glows + a faint
          diagonal grid, all decorative and non-interactive ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-cic-red/25 blur-[120px]" />
        <div className="absolute -bottom-48 -right-24 h-[36rem] w-[36rem] rounded-full bg-cic-plum/40 blur-[130px]" />
        <div className="absolute top-1/3 right-1/4 h-64 w-64 rounded-full bg-cic-red-light/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      </div>

      {/* ── Card ── */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-cic-red via-cic-red-light to-cic-red" />

          <div className="p-8">
            <div className="inline-flex items-center justify-center rounded-lg bg-white p-2 shadow-lg shadow-black/30 mb-6">
              <Image src="/cic-logo.png" alt="CIC Insurance Group" width={96} height={28} className="h-6 w-auto" priority />
            </div>

            <h1 className="text-xl font-semibold text-white mb-1">Customer Care Platform</h1>
            <p className="text-sm text-neutral-400 mb-6">Sign in to view customer care tickets.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-neutral-300 mb-1">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cic-red focus:border-cic-red/50 transition-colors"
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-neutral-300 mb-1">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cic-red focus:border-cic-red/50 transition-colors"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-gradient-to-r from-cic-red to-cic-red-dark text-white text-sm font-medium py-2.5 shadow-lg shadow-cic-red/30 hover:from-cic-red-light hover:to-cic-red hover:shadow-cic-red/40 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] tracking-wide text-neutral-500">
          Staff access only · CIC Insurance Group
        </p>
      </div>
    </div>
  );
}