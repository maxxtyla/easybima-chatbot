'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, getMyStats, logout, type Agent, type AgentStats } from '@/lib/staffApi';

const STAT_CARDS: { key: keyof AgentStats; label: string; hint: string; accent: string }[] = [
  { key: 'open', label: 'Open', hint: 'Open, assigned, or in progress', accent: 'text-cic-red-light' },
  { key: 'pending', label: 'Pending customer', hint: 'Waiting on a customer reply', accent: 'text-orange-400' },
  { key: 'closed', label: 'Closed', hint: 'Resolved or closed', accent: 'text-emerald-400' },
  { key: 'total', label: 'Total handled', hint: 'All tickets assigned to you', accent: 'text-white' },
];

export default function AgentProfilePage() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [{ agent }, { stats }] = await Promise.all([getMe(), getMyStats()]);
        setAgent(agent);
        setStats(stats);
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          router.push('/staff/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load profile.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router]);

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

  async function handleLogout() {
    await logout();
    router.push('/staff/login');
  }

  return (
    <div className="min-h-screen bg-black overscroll-none">
      <header className="bg-black border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-neutral-400 hover:text-cic-red-light mb-1">
            ← Back to tickets
          </button>
          <h1 className="text-lg font-semibold text-white">My profile</h1>
        </div>
        <button onClick={handleLogout} className="text-sm text-neutral-400 hover:text-cic-red-light">Sign out</button>
      </header>

      <div className="px-6 py-6 max-w-3xl">
        {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            {agent && (
              <div className="bg-white/[0.04] rounded-xl border border-white/10 p-4 mb-6">
                <p className="text-sm text-neutral-400">Signed in as</p>
                <p className="text-lg font-medium text-white">{agent.fullName}</p>
                <p className="text-sm text-neutral-400">{agent.email} · {agent.role}</p>
              </div>
            )}

            <h2 className="text-sm font-medium text-white mb-3">Tickets you&apos;ve handled</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats && STAT_CARDS.map((card) => (
                <div key={card.key} className="bg-white/[0.04] rounded-xl border border-white/10 p-4">
                  <p className={`text-3xl font-semibold ${card.accent}`}>{stats[card.key]}</p>
                  <p className="text-sm font-medium text-white mt-1">{card.label}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{card.hint}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
