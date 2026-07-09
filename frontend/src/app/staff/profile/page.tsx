'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, getMyStats, logout, type Agent, type AgentStats } from '@/lib/staffApi';

const STAT_CARDS: { key: keyof AgentStats; label: string; hint: string; accent: string }[] = [
  { key: 'open', label: 'Open', hint: 'Open, assigned, or in progress', accent: 'text-cic-red' },
  { key: 'pending', label: 'Pending customer', hint: 'Waiting on a customer reply', accent: 'text-orange-600' },
  { key: 'closed', label: 'Closed', hint: 'Resolved or closed', accent: 'text-emerald-600' },
  { key: 'total', label: 'Total handled', hint: 'All tickets assigned to you', accent: 'text-cic-gray' },
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

  async function handleLogout() {
    await logout();
    router.push('/staff/login');
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-cic-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-neutral-500 hover:text-cic-red mb-1">
            ← Back to tickets
          </button>
          <h1 className="text-lg font-semibold text-cic-gray">My profile</h1>
        </div>
        <button onClick={handleLogout} className="text-sm text-neutral-500 hover:text-cic-red">Sign out</button>
      </header>

      <div className="px-6 py-6 max-w-3xl">
        {error && <p className="text-sm text-cic-red-dark bg-red-50 rounded-md px-3 py-2 mb-4">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            {agent && (
              <div className="bg-cic-white rounded-xl border border-neutral-200 p-4 mb-6">
                <p className="text-sm text-neutral-500">Signed in as</p>
                <p className="text-lg font-medium text-cic-gray">{agent.fullName}</p>
                <p className="text-sm text-neutral-500">{agent.email} · {agent.role}</p>
              </div>
            )}

            <h2 className="text-sm font-medium text-cic-gray mb-3">Tickets you've handled</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats && STAT_CARDS.map((card) => (
                <div key={card.key} className="bg-cic-white rounded-xl border border-neutral-200 p-4">
                  <p className={`text-3xl font-semibold ${card.accent}`}>{stats[card.key]}</p>
                  <p className="text-sm font-medium text-cic-gray mt-1">{card.label}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{card.hint}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
