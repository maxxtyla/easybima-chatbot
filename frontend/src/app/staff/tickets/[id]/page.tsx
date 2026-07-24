'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { playNotificationSound, startTitleFlash } from '@/lib/notificationSound';
import {
  getTicket,
  getTicketMessages,
  getTicketEvents,
  updateTicketStatus,
  updateTicketPriority,
  acceptTicket,
  addTicketNote,
  sendTicketMessage,
  setTicketTyping,
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
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  low: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
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
  // New-message alert (sound + brief banner) when the customer sends a
  // message while this ticket is open. Tracks the last message id we've
  // already alerted on so a poll that just re-confirms the same messages
  // (or echoes the agent's own reply back) doesn't re-trigger the sound.
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const isFirstMessageLoadRef = useRef(true);
  const [showNewMessageBanner, setShowNewMessageBanner] = useState(false);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTitleFlashRef = useRef<(() => void) | null>(null);
  // Transcript auto-scroll: a brand-new message never auto-scrolls — the
  // agent might be reading back through history — it just surfaces the
  // "New message" jump button below. The customer-typing indicator is the
  // one exception: since it's ephemeral and easy to miss, it always pulls
  // the view down so the agent notices it without needing to scroll
  // manually. See the two effects below plus the button UI further down.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const isTranscriptNearBottom = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    transcriptBottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    setShowJumpToBottom(false);
  }, []);
  // Live "customer is typing…" flag, sourced from the same transcript poll
  // below — no separate poll loop needed.
  const [customerTyping, setCustomerTyping] = useState(false);
  // Mirrors useChat's notifyTyping/stopTyping pattern on the widget side:
  // only pings the backend on the false→true transition, then auto-stops
  // after a short idle window so the indicator doesn't linger once the
  // agent pauses without sending.
  const isTypingRef = useRef(false);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TYPING_IDLE_MS = 3000;

  const notifyAgentTyping = useCallback(() => {
    if (!ticketId) return;
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setTicketTyping(ticketId, true);
    }
    typingIdleTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      setTicketTyping(ticketId, false);
    }, TYPING_IDLE_MS);
  }, [ticketId]);

  const stopAgentTyping = useCallback(() => {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      setTicketTyping(ticketId, false);
    }
  }, [ticketId]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    };
  }, []);

  const loadTicket = useCallback(async () => {
    try {
      const [{ ticket }, { messages, source, customerTyping }, { events }] = await Promise.all([
        getTicket(ticketId),
        getTicketMessages(ticketId),
        getTicketEvents(ticketId),
      ]);
      setTicket(ticket);
      setMessages(messages);
      setMessageSource(source);
      setEvents(events);
      setCustomerTyping(!!customerTyping);
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
        .then(([{ ticket: freshTicket }, { messages, source, customerTyping }]) => {
          setTicket(freshTicket);
          setMessages(messages);
          setMessageSource(source);
          setCustomerTyping(!!customerTyping);
        })
        .catch(() => {
          // Best-effort — next tick retries, no need to surface transient poll errors
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [ticket?.status, ticketId]);

  // Fires the new-message alert whenever the transcript grows with a
  // message from the customer (role 'user') that we haven't already
  // alerted on. Skipped on the very first load of a ticket so opening an
  // existing conversation doesn't immediately play a sound for history
  // that's already there.
  useEffect(() => {
    if (messages.length === 0) return;

    const latest = messages[messages.length - 1];
    const latestKey = latest.id || `${latest.created_at}:${latest.content}`;

    if (isFirstMessageLoadRef.current) {
      isFirstMessageLoadRef.current = false;
      lastSeenMessageIdRef.current = latestKey;
      return;
    }

    if (latestKey === lastSeenMessageIdRef.current) return;
    lastSeenMessageIdRef.current = latestKey;

    if (latest.role === 'user') {
      playNotificationSound();

      setShowNewMessageBanner(true);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = setTimeout(() => setShowNewMessageBanner(false), 4000);

      // Only flash the tab title if the agent isn't already looking at it.
      if (document.visibilityState !== 'visible') {
        stopTitleFlashRef.current?.();
        stopTitleFlashRef.current = startTitleFlash('💬 New message');
      }
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      stopTitleFlashRef.current?.();
    };
  }, []);

  // A new message landing never auto-scrolls the transcript — the agent
  // could be reading back through earlier history and an unexpected jump
  // is disorienting. Instead this just surfaces the "New message" button;
  // the agent clicks it (or scrolls down themselves) to see it.
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const newCount = messages.length;
    prevMessageCountRef.current = newCount;
    if (newCount > prevCount && !isTranscriptNearBottom()) {
      setShowJumpToBottom(true);
    }
  }, [messages, isTranscriptNearBottom]);

  // Unlike new messages, the "customer is typing…" indicator is ephemeral
  // and easy to miss entirely if the agent has to notice it AND scroll
  // down before it disappears — so this one does pull the view down on
  // the false→true transition, regardless of current scroll position.
  const wasCustomerTypingRef = useRef(false);
  useEffect(() => {
    if (customerTyping && !wasCustomerTypingRef.current) {
      scrollTranscriptToBottom();
    }
    wasCustomerTypingRef.current = customerTyping;
  }, [customerTyping, scrollTranscriptToBottom]);

  async function handleSendReply() {
    if (!ticket || !replyText.trim() || isSendingReply) return;
    setIsSendingReply(true);
    setDeliveryWarning(null);
    stopAgentTyping();
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
      <div className="min-h-screen bg-[#0B0708] flex items-center justify-center">
        <p className="text-sm text-neutral-500">Loading ticket…</p>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="min-h-screen bg-[#0B0708] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mb-4">{error}</p>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-cic-red-light hover:underline">
            ← Back to tickets
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="min-h-screen bg-[#0B0708]">
      <header className="bg-white/[0.03] border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/staff/tickets')} className="text-sm text-neutral-400 hover:text-cic-red-light mb-1">
            ← Back to tickets
          </button>
          <h1 className="text-lg font-semibold text-white">{ticket.ticket_number} — {ticket.subject}</h1>
          {agent && <p className="text-sm text-neutral-400">Signed in as {agent.fullName} · {agent.role}</p>}
        </div>
      </header>

      {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 mx-6 mt-4">{error}</p>}

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: transcript */}
        <div className="lg:col-span-2 bg-white/[0.04] rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white">Conversation transcript</h2>
            {messageSource && (
              <span className="text-xs text-neutral-500">
                {messageSource === 'live' ? 'Live session' : 'Snapshot at ticket creation'}
              </span>
            )}
          </div>
          {showNewMessageBanner && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              New message from customer
            </div>
          )}
          <div
            ref={transcriptRef}
            onScroll={() => {
              if (isTranscriptNearBottom()) setShowJumpToBottom(false);
            }}
            className="relative space-y-3 max-h-[60vh] overflow-y-auto"
          >
            {messages.length === 0 && <p className="text-sm text-neutral-500">No messages available.</p>}
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
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-cic-red-light hover:border-cic-red flex items-center justify-center shadow-sm"
                    >
                      ↩
                    </button>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isUser ? 'bg-white/10 text-white' : isAgent ? 'bg-emerald-600 text-white' : 'bg-cic-red text-white'
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
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 mb-1 w-6 h-6 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-cic-red-light hover:border-cic-red flex items-center justify-center shadow-sm"
                    >
                      ↩
                    </button>
                  )}
                </div>
              );
            })}
            {customerTyping && (
              <div className="flex justify-start">
                <div className="bg-white/10 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <span className="text-xs text-neutral-400 mr-1">Customer is typing</span>
                  <span className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse-dot" />
                  <span className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse-dot animation-delay-150" />
                  <span className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse-dot animation-delay-300" />
                </div>
              </div>
            )}
            <div ref={transcriptBottomRef} />
          </div>

          {showJumpToBottom && (
            <button
              type="button"
              onClick={() => scrollTranscriptToBottom()}
              className="mt-2 mx-auto flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full bg-cic-red text-white text-xs font-medium shadow-md hover:bg-cic-red-dark transition-colors"
            >
              New message
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {(() => {
            if (!ticket) return null;

            if (TERMINAL_STATUSES.includes(ticket.status)) {
              return (
                <p className="mt-4 border-t border-white/10 pt-3 text-xs text-neutral-500">
                  This ticket is {ticket.status} — reopen it to reply again.
                </p>
              );
            }

            const acceptedByOther = !!ticket.assigned_to && ticket.assigned_to !== agent?.sub;
            const hasAccepted = ticket.assigned_to === agent?.sub && ticket.status !== 'open';

            if (acceptedByOther) {
              return (
                <p className="mt-4 border-t border-white/10 pt-3 text-xs text-neutral-400">
                  This ticket has already been accepted by {ticket.assigned_agent_name || 'another agent'}.
                </p>
              );
            }

            if (!hasAccepted) {
              return (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-xs text-neutral-400 mb-2">
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
              <div className="mt-4 relative rounded-xl border border-cic-red/30 bg-gradient-to-br from-[#1a0f10] via-[#1c0e11] to-black p-3.5 shadow-lg shadow-black/30 overflow-hidden">
                <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-cic-red/20 blur-[70px]" />

                <div className="relative flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cic-red-light">
                    Reply to customer
                  </p>
                  {agent?.fullName && (
                    <p className="text-[11px] text-neutral-500">as {agent.fullName}</p>
                  )}
                </div>

                {deliveryWarning && (
                  <p className="relative text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-md px-3 py-2 mb-2">{deliveryWarning}</p>
                )}
                {replyTo && (
                  <div className="relative flex items-center gap-2 mb-2 pl-3 pr-2 py-1.5 rounded-md bg-cic-red/10 border-l-2 border-cic-red">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-cic-red-light">
                        Replying to {replyTo.role === 'user' ? 'customer' : replyTo.role === 'agent' ? 'agent' : 'Bima'}
                      </p>
                      <p className="text-xs text-neutral-400 truncate">{replyTo.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      aria-label="Cancel reply"
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-neutral-500 hover:text-cic-red-light hover:bg-white/10 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="relative flex flex-col gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      notifyAgentTyping();
                    }}
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
                    rows={5}
                    placeholder={replyTo ? 'Type your reply…' : 'Reply to the customer…'}
                    className="w-full min-h-[128px] max-h-72 rounded-lg border border-white/10 bg-black/40 px-3.5 py-3 text-sm text-white placeholder-neutral-500 resize-y focus:outline-none focus:ring-2 focus:ring-cic-red focus:border-cic-red/50 transition-colors"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-neutral-500">Shift + Enter for a new line</p>
                    <button
                      onClick={handleSendReply}
                      disabled={isSendingReply || !replyText.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cic-red to-cic-red-dark text-white text-sm font-medium px-5 py-2.5 shadow-md shadow-cic-red/30 hover:from-cic-red-light hover:to-cic-red hover:shadow-cic-red/40 transition-all disabled:opacity-40 disabled:hover:shadow-cic-red/30"
                    >
                      {isSendingReply ? (
                        'Sending…'
                      ) : (
                        <>
                          Send
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M2.94 2.94a.75.75 0 01.826-.166l13.5 5.5a.75.75 0 010 1.39l-13.5 5.5a.75.75 0 01-1.02-.882L4.31 10 2.746 3.822a.75.75 0 01.194-.882z" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right: details + actions */}
        <div className="space-y-6">
          <div className="bg-white/[0.04] rounded-xl border border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-medium text-white mb-2">Ticket details</h2>

            <div>
              <label className="text-xs text-neutral-500">Status</label>
              {TERMINAL_STATUSES.includes(ticket.status) ? (
                // Resolved/closed tickets are permanent — no dropdown here,
                // so there's no UI path to reopen one. The backend also
                // rejects a status change away from resolved/closed, but
                // not offering the option at all is the clearer signal.
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium w-full ${
                    ticket.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-neutral-300'
                  }`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <p className="mt-1.5 text-xs text-neutral-500">
                    This ticket is {ticket.status} and can&apos;t be reopened.
                  </p>
                </div>
              ) : (
                <>
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                    className="w-full mt-1 rounded-lg border border-white/10 px-3 py-1.5 text-sm bg-white/5 text-white [color-scheme:dark]"
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
                className="w-full mt-1 rounded-lg border border-white/10 px-3 py-1.5 text-sm bg-white/5 text-white [color-scheme:dark]"
              >
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
              <span className={`inline-block mt-2 rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[ticket.priority]}`}>
                {ticket.priority}
              </span>
            </div>

            <dl className="text-sm text-neutral-300 space-y-1 pt-2 border-t border-white/10">
              <div className="flex justify-between"><dt className="text-neutral-500">Customer</dt><dd>{ticket.customer_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Email</dt><dd>{ticket.customer_email || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Phone</dt><dd>{ticket.customer_phone || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Channel</dt><dd>{ticket.channel}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Category</dt><dd>{ticket.category || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Source</dt><dd>{ticket.source}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Assigned to</dt><dd>{ticket.assigned_agent_name || '— unassigned —'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Branch</dt><dd>{ticket.branch_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Created</dt><dd>{new Date(ticket.created_at).toLocaleString()}</dd></div>
              {ticket.sla_due_at && (
                <div className="flex justify-between"><dt className="text-neutral-500">SLA due</dt><dd>{new Date(ticket.sla_due_at).toLocaleString()}</dd></div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between"><dt className="text-neutral-500">Resolved</dt><dd>{new Date(ticket.resolved_at).toLocaleString()}</dd></div>
              )}
            </dl>
          </div>

          <div className="bg-white/[0.04] rounded-xl border border-white/10 p-4">
            <h2 className="text-sm font-medium text-white mb-2">Add note</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Internal note for other agents…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cic-red focus:border-cic-red/50 transition-colors"
            />
            <button
              onClick={handleAddNote}
              disabled={isSavingNote || !note.trim()}
              className="mt-2 w-full rounded-lg bg-cic-red text-white text-sm py-1.5 disabled:opacity-50"
            >
              {isSavingNote ? 'Saving…' : 'Add note'}
            </button>
          </div>

          <div className="bg-white/[0.04] rounded-xl border border-white/10 p-4">
            <h2 className="text-sm font-medium text-white mb-2">Activity</h2>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {events.length === 0 && <p className="text-sm text-neutral-500">No activity yet.</p>}
              {events.map((e) => (
                <li key={e.id} className="text-xs text-neutral-400 border-b border-white/5 pb-2 last:border-0">
                  <span className="font-medium text-white">{e.actor_name || (e.actor_type === 'system' ? 'System' : e.actor_type)}</span>
                  {' '}— {e.event_type.replace(/_/g, ' ')}
                  {e.event_type === 'note_added' && typeof e.event_data.note === 'string' && (
                    <p className="mt-1 text-neutral-400 italic">&ldquo;{e.event_data.note}&rdquo;</p>
                  )}
                  <p className="text-[10px] text-neutral-500 mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}