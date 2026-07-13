'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getTicket,
  getTicketMessages,
  getTicketEvents,
  updateTicketStatus,
  updateTicketPriority,
  acceptTicket,
  addTicketNote,
  sendTicketMessage,
  getMe,
  type Ticket,
  type TicketMessage,
  type TicketEvent,
  type TicketStatus,
  type TicketPriority,
  type Agent,
  type ReplySnippet,
} from '@/lib/staffApi';

const TERMINAL_STATUSES: TicketStatus[] = ['resolved', 'closed'];

const STATUS_OPTIONS: TicketStatus[] = ['open', 'assigned', 'in_progress', 'pending_customer', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  urgent: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageSource, setMessageSource] = useState<'live' | 'snapshot' | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplySnippet | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    try {
      const [{ ticket }, { messages, source }, { events }] = await Promise.all([
        getTicket(ticketId),
        getTicketMessages(ticketId),
        getTicketEvents(ticketId),
      ]);
      setTicket(ticket);
      setMessages(messages);
      setMessageSource(source);
      setEvents(events);
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        router.push('/staff/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load ticket.');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId, router]);

  useEffect(() => {
    getMe()
      .then(({ agent }) => setAgent(agent))
      .catch(() => router.push('/staff/login'));
  }, [router]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // Live transcript + status polling — picks up both the customer's
  // incoming messages and this agent's own sent replies (echoed back once
  // persisted). Stops once the ticket is resolved/closed since nothing
  // more will arrive on a dead conversation.
  //
  // BUG FIX: this used to only re-fetch messages, never the ticket itself.
  // That meant a ticket the customer closed (or that another agent
  // resolved) from outside this page never updated here — the reply box
  // and status dropdown kept showing as if it were still open until the
  // agent manually refreshed, which is exactly the kind of "closed from
  // the other side but nobody here found out" gap being fixed. Now the
  // ticket record is refetched on every tick too, so the terminal-state
  // banner (and the stop condition above) actually kicks in on its own.
  useEffect(() => {
    if (!ticket || TERMINAL_STATUSES.includes(ticket.status)) return;
    const interval = setInterval(() => {
      Promise.all([getTicket(ticketId), getTicketMessages(ticketId)])
        .then(([{ ticket: freshTicket }, { messages, source }]) => {
          setTicket(freshTicket);
          setMessages(messages);
          setMessageSource(source);
        })
        .catch(() => {
          // Best-effort — next tick retries, no need to surface transient poll errors
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [ticket?.status, ticketId]);

  async function handleSendReply() {
    if (!ticket || !replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setDeliveryWarning(null);
    try {
      const result = await sendTicketMessage(ticket.id, replyText.trim(), replyTo?.id);
      setReplyText('');
      setReplyTo(null);
      if (result.deliveryWarning) setDeliveryWarning(result.deliveryWarning);
      await loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setIsSendingReply(false);
    }
  }

  async function handleAcceptTicket() {
    if (!ticket || isAccepting) return;
    setIsAccepting(true);
    setError(null);
    try {
      const { ticket: updated } = await acceptTicket(ticket.id);
      setTicket(updated);
      loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept ticket.');
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleCloseTicket() {
    await handleStatusChange('closed');
  }

  async function handleStatusChange(status: TicketStatus) {
    if (!ticket) return;
    try {
      const { ticket: updated } = await updateTicketStatus(ticket.id, status);
      setTicket(updated);
      loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  async function handlePriorityChange(priority: TicketPriority) {
    if (!ticket) return;
    try {
      const { ticket: updated } = await updateTicketPriority(ticket.id, priority);
      setTicket(updated);
      loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update priority.');
    }
  }

  async function handleAddNote() {
    if (!ticket || !note.trim()) return;
    setIsSavingNote(true);
    try {
      await addTicketNote(ticket.id, note.trim());
      setNote('');
      loadTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note.');
    } finally {
      setIsSavingNote(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-sm text-neutral-500">Loading ticket…</p>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-cic-red-dark bg-red-50 rounded-md px-3 py-2 mb-4">{error}</p>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-cic-red hover:underline">
            ← Back to tickets
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-cic-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-neutral-500 hover:text-cic-red mb-1">
            ← Back to tickets
          </button>
          <h1 className="text-lg font-semibold text-cic-gray">{ticket.ticket_number} — {ticket.subject}</h1>
          {agent && <p className="text-sm text-neutral-500">Signed in as {agent.fullName} · {agent.role}</p>}
        </div>
      </header>

      {error && <p className="text-sm text-cic-red-dark bg-red-50 rounded-md px-3 py-2 mx-6 mt-4">{error}</p>}

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: transcript */}
        <div className="lg:col-span-2 bg-cic-white rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-cic-gray">Conversation transcript</h2>
            {messageSource && (
              <span className="text-xs text-neutral-400">
                {messageSource === 'live' ? 'Live session' : 'Snapshot at ticket creation'}
              </span>
            )}
          </div>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {messages.length === 0 && <p className="text-sm text-neutral-400">No messages available.</p>}
            {messages.map((m, i) => {
              const isUser = m.role === 'user';
              const isAgent = m.role === 'agent';
              const replySnippet = m.metadata?.replyTo;
              // Only user/customer messages have a real DB id we can
              // reliably reply to in this transcript view (bot/system rows
              // may come from the pre-ticket snapshot without one) — that
              // mirrors the customer widget, which only offers the reply
              // affordance on messages it can meaningfully quote.
              const canReplyTo = !!m.id;
              return (
                <div
                  key={m.id || i}
                  className={`group flex items-end gap-1 ${isUser ? 'justify-start' : 'justify-end'}`}
                >
                  {!isUser && canReplyTo && (
                    <button
                      type="button"
                      onClick={() => setReplyTo({ id: m.id!, role: m.role, content: m.content })}
                      aria-label="Reply to this message"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500 hover:text-cic-red hover:border-cic-red flex items-center justify-center shadow-sm"
                    >
                      ↩
                    </button>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isUser ? 'bg-neutral-100 text-cic-gray' : isAgent ? 'bg-emerald-600 text-white' : 'bg-cic-red text-white'
                    }`}
                  >
                    {isAgent && <p className="text-[10px] uppercase tracking-wide opacity-80 mb-0.5">Agent reply</p>}
                    {replySnippet && (
                      <div className="mb-1.5 pl-2 border-l-2 border-white/40 bg-black/10 rounded-r text-xs py-1 pr-2">
                        <p className="font-semibold opacity-90">
                          {replySnippet.role === 'user' ? 'Replying to customer' : replySnippet.role === 'agent' ? 'Replying to agent' : 'Replying to Bima'}
                        </p>
                        <p className="truncate opacity-80">{replySnippet.content}</p>
                      </div>
                    )}
                    <p>{m.content}</p>
                    <p className={`text-[10px] mt-1 ${isUser ? 'text-neutral-400' : isAgent ? 'text-emerald-100' : 'text-red-100'}`}>
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                  {isUser && canReplyTo && (
                    <button
                      type="button"
                      onClick={() => setReplyTo({ id: m.id!, role: m.role, content: m.content })}
                      aria-label="Reply to this message"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white border border-neutral-200 text-neutral-500 hover:text-cic-red hover:border-cic-red flex items-center justify-center shadow-sm"
                    >
                      ↩
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {(() => {
            if (!ticket) return null;

            if (TERMINAL_STATUSES.includes(ticket.status)) {
              return (
                <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
                  This ticket is {ticket.status} — reopen it to reply again.
                </p>
              );
            }

            const acceptedByOther = !!ticket.assigned_to && ticket.assigned_to !== agent?.sub;
            const hasAccepted = ticket.assigned_to === agent?.sub && ticket.status !== 'open';

            if (acceptedByOther) {
              return (
                <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                  This ticket has already been accepted by {ticket.assigned_agent_name || 'another agent'}.
                </p>
              );
            }

            if (!hasAccepted) {
              return (
                <div className="mt-4 border-t border-neutral-100 pt-3">
                  <p className="text-xs text-neutral-500 mb-2">
                    Accept this ticket to start replying to the customer.
                  </p>
                  <button
                    onClick={handleAcceptTicket}
                    disabled={isAccepting}
                    className="w-full rounded-lg bg-cic-red text-white text-sm py-2 font-medium disabled:opacity-50"
                  >
                    {isAccepting ? 'Accepting…' : 'Accept ticket'}
                  </button>
                </div>
              );
            }

            return (
              <div className="mt-4 border-t border-neutral-100 pt-3">
                {deliveryWarning && (
                  <p className="text-xs text-orange-700 bg-orange-50 rounded-md px-3 py-2 mb-2">{deliveryWarning}</p>
                )}
                {replyTo && (
                  <div className="flex items-center gap-2 mb-2 pl-3 pr-2 py-1.5 rounded-md bg-red-50 border-l-2 border-cic-red">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-cic-red">
                        Replying to {replyTo.role === 'user' ? 'customer' : replyTo.role === 'agent' ? 'agent' : 'Bima'}
                      </p>
                      <p className="text-xs text-neutral-600 truncate">{replyTo.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      aria-label="Cancel reply"
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-neutral-400 hover:text-cic-red hover:bg-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                      if (e.key === 'Escape' && replyTo) {
                        e.preventDefault();
                        setReplyTo(null);
                      }
                    }}
                    rows={2}
                    placeholder={replyTo ? 'Type your reply…' : 'Reply to the customer…'}
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm resize-none"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={isSendingReply || !replyText.trim()}
                    className="self-end rounded-lg bg-cic-red text-white text-sm px-4 py-2 disabled:opacity-50"
                  >
                    {isSendingReply ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right: details + actions */}
        <div className="space-y-6">
          <div className="bg-cic-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h2 className="text-sm font-medium text-cic-gray mb-2">Ticket details</h2>

            <div>
              <label className="text-xs text-neutral-500">Status</label>
              {TERMINAL_STATUSES.includes(ticket.status) ? (
                // Resolved/closed tickets are permanent — no dropdown here,
                // so there's no UI path to reopen one. The backend also
                // rejects a status change away from resolved/closed, but
                // not offering the option at all is the clearer signal.
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium w-full ${
                    ticket.status === 'resolved' ? 'bg-green-50 text-green-800' : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <p className="mt-1.5 text-xs text-neutral-400">
                    This ticket is {ticket.status} and can&apos;t be reopened.
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    className="w-full mt-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-cic-white"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <button
                    onClick={handleCloseTicket}
                    className="mt-2 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-1.5 font-medium"
                  >
                    Close ticket
                  </button>
                </>
              )}
            </div>

            <div>
              <label className="text-xs text-neutral-500">Priority</label>
              <select
                value={ticket.priority}
                onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                className="w-full mt-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-cic-white"
              >
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
              <span className={`inline-block mt-2 rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[ticket.priority]}`}>
                {ticket.priority}
              </span>
            </div>

            <dl className="text-sm text-neutral-600 space-y-1 pt-2 border-t border-neutral-100">
              <div className="flex justify-between"><dt className="text-neutral-400">Customer</dt><dd>{ticket.customer_name || ticket.customer_phone || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Channel</dt><dd>{ticket.channel}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Category</dt><dd>{ticket.category || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Source</dt><dd>{ticket.source}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Assigned to</dt><dd>{ticket.assigned_agent_name || '— unassigned —'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Branch</dt><dd>{ticket.branch_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-400">Created</dt><dd>{new Date(ticket.created_at).toLocaleString()}</dd></div>
              {ticket.sla_due_at && (
                <div className="flex justify-between"><dt className="text-neutral-400">SLA due</dt><dd>{new Date(ticket.sla_due_at).toLocaleString()}</dd></div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between"><dt className="text-neutral-400">Resolved</dt><dd>{new Date(ticket.resolved_at).toLocaleString()}</dd></div>
              )}
            </dl>
          </div>

          <div className="bg-cic-white rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-medium text-cic-gray mb-2">Add note</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Internal note for other agents…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddNote}
              disabled={isSavingNote || !note.trim()}
              className="mt-2 w-full rounded-lg bg-cic-red text-white text-sm py-1.5 disabled:opacity-50"
            >
              {isSavingNote ? 'Saving…' : 'Add note'}
            </button>
          </div>

          <div className="bg-cic-white rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-medium text-cic-gray mb-2">Activity</h2>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {events.length === 0 && <p className="text-sm text-neutral-400">No activity yet.</p>}
              {events.map((e) => (
                <li key={e.id} className="text-xs text-neutral-600 border-b border-neutral-50 pb-2 last:border-0">
                  <span className="font-medium text-cic-gray">{e.actor_name || (e.actor_type === 'system' ? 'System' : e.actor_type)}</span>
                  {' '}— {e.event_type.replace(/_/g, ' ')}
                  {e.event_type === 'note_added' && typeof e.event_data.note === 'string' && (
                    <p className="mt-1 text-neutral-500 italic">&ldquo;{e.event_data.note}&rdquo;</p>
                  )}
                  <p className="text-[10px] text-neutral-400 mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}