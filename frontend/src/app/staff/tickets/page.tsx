'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listTickets, getMe, logout, type Ticket, type TicketStatus, type TicketPriority, type Agent } from '@/lib/staffApi';
import { playNotificationSound, startTitleFlash } from '@/lib/notificationSound';

const STATUS_OPTIONS: TicketStatus[] = ['open', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  urgent: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

function formatSlaCountdown(slaDueAt: string | null): { text: string; overdue: boolean } | null {
  if (!slaDueAt) return null;
  const diffMs = new Date(slaDueAt).getTime() - Date.now();
  const overdue = diffMs <= 0;
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { text: overdue ? `${label} overdue` : `${label} left`, overdue };
}

export default function TicketQueuePage() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  // Default to open tickets — the backend queue query already sorts
  // urgent > high > medium > low within a status, so this surfaces the
  // most urgent open tickets first without any extra client-side logic.
  const [status, setStatus] = useState<TicketStatus | ''>('open');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks each ticket's updated_at as of the last poll so we can spot
  // ones that changed since (typically a new customer message landing) —
  // a lightweight, backend-agnostic proxy for "new activity" without
  // needing a dedicated unread-count field.
  const lastSeenUpdatedAtRef = useRef<Map<string, string>>(new Map());
  const isFirstLoadRef = useRef(true);
  // Persistent "new message" flag per ticket — unlike a brief highlight,
  // this stays set until the agent actually opens that ticket, so it
  // can't be missed by glancing at the queue right after it fires.
  const [unreadTicketIds, setUnreadTicketIds] = useState<Set<string>>(new Set());
  const stopTitleFlashRef = useRef<(() => void) | null>(null);

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listTickets({
        status: status || undefined,
        priority: priority || undefined,
        pageSize: 50,
      });
      setTickets(result.tickets);
      setTotal(result.total);

      const previouslySeen = lastSeenUpdatedAtRef.current;
      const nextSeen = new Map<string, string>();
      const changedIds: string[] = [];

      for (const ticket of result.tickets) {
        nextSeen.set(ticket.id, ticket.updated_at);
        const prevUpdatedAt = previouslySeen.get(ticket.id);
        if (!isFirstLoadRef.current && prevUpdatedAt && prevUpdatedAt !== ticket.updated_at) {
          changedIds.push(ticket.id);
        }
      }
      lastSeenUpdatedAtRef.current = nextSeen;

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      } else if (changedIds.length > 0) {
        playNotificationSound();
        // Add to (not replace) the unread set — a ticket already flagged
        // unread from an earlier poll stays flagged, and newly-changed
        // ones join it, until each is individually opened.
        setUnreadTicketIds((prev) => {
          const next = new Set(prev);
          changedIds.forEach((id) => next.add(id));
          return next;
        });

        if (document.visibilityState !== 'visible') {
          stopTitleFlashRef.current?.();
          stopTitleFlashRef.current = startTitleFlash(
            changedIds.length === 1 ? '💬 New message' : `💬 ${changedIds.length} tickets updated`
          );
        }
      }
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        router.push('/staff/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load tickets.');
    } finally {
      setIsLoading(false);
    }
  }, [status, priority, router]);

  useEffect(() => {
    getMe()
      .then(({ agent }) => setAgent(agent))
      .catch(() => router.push('/staff/login'));
  }, [router]);

  useEffect(() => {
    return () => {
      stopTitleFlashRef.current?.();
    };
  }, []);

  useEffect(() => {
    loadTickets();
    // Simple polling backstop — swap for websockets later if the queue
    // needs true real-time updates across multiple agents.
    const interval = setInterval(loadTickets, 30000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  async function handleLogout() {
    await logout();
    router.push('/staff/login');
  }

  function openTicket(ticketId: string) {
    if (unreadTicketIds.has(ticketId)) {
      setUnreadTicketIds((prev) => {
        const next = new Set(prev);
        next.delete(ticketId);
        return next;
      });
    }
    router.push(`/staff/tickets/${ticketId}`);
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-cic-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-cic-gray flex items-center gap-2">
            Customer Care Tickets
            {unreadTicketIds.size > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-cic-red text-white text-xs font-semibold animate-pulse"
                aria-label={`${unreadTicketIds.size} ticket${unreadTicketIds.size === 1 ? '' : 's'} with new messages`}
              >
                {unreadTicketIds.size}
              </span>
            )}
          </h1>
          {agent && <p className="text-sm text-neutral-500">Signed in as {agent.fullName} · {agent.role}</p>}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/staff/profile')} className="text-sm text-neutral-500 hover:text-cic-red">
            My profile
          </button>
          <button onClick={handleLogout} className="text-sm text-neutral-500 hover:text-cic-red">Sign out</button>
        </div>
      </header>

      <div className="px-6 py-4 flex flex-wrap gap-3 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-cic-white"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority | '')}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-cic-white"
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>

        <span className="text-sm text-neutral-500 ml-auto">{total} ticket{total === 1 ? '' : 's'}</span>
      </div>

      <div className="px-6 pb-8">
        {error && <p className="text-sm text-cic-red-dark bg-red-50 rounded-md px-3 py-2 mb-4">{error}</p>}

        {isLoading && tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">Loading tickets…</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">No tickets match these filters.</p>
        ) : (
          <div className="bg-cic-white rounded-xl border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Ticket</th>
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Subject</th>
                  <th className="text-left px-4 py-3 font-medium">Priority</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Assigned</th>
                  <th className="text-left px-4 py-3 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tickets.map((ticket) => {
                  const sla = formatSlaCountdown(ticket.sla_due_at);
                  const isUnread = unreadTicketIds.has(ticket.id);
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicket(ticket.id)}
                      className={`cursor-pointer hover:bg-neutral-50 transition-colors ${isUnread ? 'bg-emerald-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-cic-gray whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {isUnread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" aria-label="New message" />
                          )}
                          {ticket.ticket_number}
                          {isUnread && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                              New
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                        {ticket.customer_name || ticket.customer_phone || ticket.customer_email || '—'}
                        <span className="block text-xs text-neutral-400">
                          {ticket.channel}
                          {(ticket.customer_email || ticket.customer_phone) && ' · '}
                          {ticket.customer_email || ticket.customer_phone || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 max-w-xs truncate">{ticket.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{STATUS_LABELS[ticket.status]}</td>
                      <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{ticket.assigned_agent_name || '— unassigned —'}</td>
                      <td className={`px-4 py-3 whitespace-nowrap text-xs ${sla?.overdue ? 'text-cic-red-dark font-medium' : 'text-neutral-500'}`}>
                        {sla ? sla.text : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}