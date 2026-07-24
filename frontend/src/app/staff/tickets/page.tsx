'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listTickets, getMe, logout, type Ticket, type TicketStatus, type TicketPriority, type Agent } from '@/lib/staffApi';
import { playNotificationSound, startTitleFlash } from '@/lib/notificationSound';

const STATUS_OPTIONS: TicketStatus[] = ['open', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  low: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

const TERMINAL_STATUSES: TicketStatus[] = ['resolved', 'closed'];

// BUG FIX: this previously compared sla_due_at against Date.now()
// unconditionally, so a resolved/closed ticket's SLA kept ticking up
// ("Xh Ym overdue") forever after closure — the countdown never stopped
// just because the ticket did. Once a ticket has reached a terminal
// status, the SLA clock should freeze at the moment it was actually
// resolved: compare against resolved_at instead of "now", and report
// whether the SLA was met or missed rather than a live countdown.
function formatSlaCountdown(
  slaDueAt: string | null,
  status: TicketStatus,
  resolvedAt: string | null
): { text: string; overdue: boolean } | null {
  if (!slaDueAt) return null;

  if (TERMINAL_STATUSES.includes(status)) {
    // No resolved_at on record (shouldn't normally happen once terminal,
    // but don't show a misleading "overdue" if we can't actually tell) —
    // just indicate the SLA clock is no longer running.
    if (!resolvedAt) return { text: 'Closed', overdue: false };
    const missed = new Date(resolvedAt).getTime() > new Date(slaDueAt).getTime();
    return { text: missed ? 'SLA missed' : 'SLA met', overdue: false };
  }

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

  // Prevent the browser's rubber-band/overscroll bounce (mouse wheel past
  // the top, or touch bounce on mobile) from revealing the default white
  // <html>/<body> background behind this dark page. Scoped to just this
  // page's lifetime so the lighter customer-facing chat pages elsewhere in
  // the app are unaffected.
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
    <div className="min-h-screen bg-black overscroll-none">
      <header className="bg-black border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
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
          {agent && <p className="text-sm text-neutral-400">Signed in as {agent.fullName} · {agent.role}</p>}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/staff/profile')} className="text-sm text-neutral-400 hover:text-cic-red-light">
            My profile
          </button>
          <button onClick={handleLogout} className="text-sm text-neutral-400 hover:text-cic-red-light">Sign out</button>
        </div>
      </header>

      <div className="px-6 py-4 flex flex-wrap gap-3 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm bg-black text-white [color-scheme:dark]"
        >
          <option value="" style={{ backgroundColor: '#000000', color: '#fff' }}>All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} style={{ backgroundColor: '#000000', color: '#fff' }}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority | '')}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm bg-black text-white [color-scheme:dark]"
        >
          <option value="" style={{ backgroundColor: '#000000', color: '#fff' }}>All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p} style={{ backgroundColor: '#000000', color: '#fff' }}>{p[0].toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <span className="text-sm text-neutral-400 ml-auto">{total} ticket{total === 1 ? '' : 's'}</span>
      </div>

      <div className="px-6 pb-8">
        {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{error}</p>}

        {isLoading && tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">Loading tickets…</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">No tickets match these filters.</p>
        ) : (
          <div className="bg-black rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black text-neutral-500 text-xs uppercase tracking-wide">
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
              <tbody className="divide-y divide-white/5">
                {tickets.map((ticket) => {
                  const sla = formatSlaCountdown(ticket.sla_due_at, ticket.status, ticket.resolved_at);
                  const isUnread = unreadTicketIds.has(ticket.id);
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicket(ticket.id)}
                      className={`cursor-pointer hover:bg-white/[0.06] transition-colors ${isUnread ? 'bg-emerald-500/10' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {isUnread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" aria-label="New message" />
                          )}
                          {ticket.ticket_number}
                          {isUnread && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                              New
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">
                        {ticket.customer_name || ticket.customer_phone || ticket.customer_email || '—'}
                        <span className="block text-xs text-neutral-500">
                          {ticket.channel}
                          {(ticket.customer_email || ticket.customer_phone) && ' · '}
                          {ticket.customer_email || ticket.customer_phone || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 max-w-xs truncate">{ticket.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{STATUS_LABELS[ticket.status]}</td>
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{ticket.assigned_agent_name || '— unassigned —'}</td>
                      <td className={`px-4 py-3 whitespace-nowrap text-xs ${sla?.overdue ? 'text-cic-red-light font-medium' : 'text-neutral-500'}`}>
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