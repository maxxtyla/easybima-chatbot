'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ChatState } from '@/types/chat';
import { generateId } from '@/lib/utils';
import { sendMessage, keepAliveSession, endSession, getConversationHistory, getTicketStatus, closeTicket as closeTicketApi } from '@/lib/api';

const STORAGE_KEY = 'cic-chat-session';

// How long to wait after the last message before nudging toward a close.
// The backend session times out after 5 min of inactivity, but our own
// keep-alive ping (below) refreshes it every 4 min — so a reactive
// `response.warning` from the backend would almost never actually reach
// the browser at the right moment. Tracking idle time locally is what
// reliably surfaces the prompt.
const WRAP_UP_IDLE_MS = 3 * 60 * 1000;

const TERMINAL_TICKET_STATUSES = ['resolved', 'closed'];

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    sessionId: '',
    isOpen: false,
    ticketNumber: null,
    ticketStatus: 'open',
    ticketCreatedAt: undefined,
    assignedAgent: null,
  });

  const wrapUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Once a chat escalates (either the bot's own "let me connect you"
  // reply, or a human already having taken the session over), we start
  // polling the backend for the agent's replies — the widget has no
  // websocket, so this is the pickup mechanism.
  const [isEscalated, setIsEscalated] = useState(false);
  // How many messages we've already reconciled from the backend transcript.
  // Only rows beyond this index get rendered on each poll, and only if
  // they're role 'agent' — user/assistant rows are already shown locally
  // via addMessage() the moment they're sent/received.
  const backendMessageCountRef = useRef(0);
  // Which agent id we've already announced with the "X has joined" system
  // message — prevents re-announcing on every poll tick while the same
  // agent remains assigned.
  const announcedAgentIdRef = useRef<string | null>(null);
  // Last ticket status we've rendered a system message for, so a
  // resolved/closed transition (done from the staff side, e.g. the agent
  // closes it) only gets announced once.
  const lastKnownTicketStatusRef = useRef<string | null>(null);

  const clearWrapUpTimer = useCallback(() => {
    if (wrapUpTimerRef.current) {
      clearTimeout(wrapUpTimerRef.current);
      wrapUpTimerRef.current = null;
    }
  }, []);

  // Initialise sessionId from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const sessionId = stored || generateId();
    if (!stored) localStorage.setItem(STORAGE_KEY, sessionId);
    setState((prev) => ({ ...prev, sessionId }));
  }, []);

  // Keep-alive ping every 4 minutes
  // (session timeout is now 30 min so 4 min ping is plenty)
  useEffect(() => {
    if (!state.sessionId) return;
    const interval = setInterval(async () => {
      try {
        await keepAliveSession(state.sessionId);
      } catch {
        // Silently ignore — the next real message will handle a dead session
      }
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [state.sessionId]);

  // Restore in-flight ticket/conversation state on mount (e.g. the page was
  // refreshed while a ticket was open). Without this, reloading mid-ticket
  // would silently drop the ticket card and agent info until the customer
  // happened to send another message — this reconciles it proactively as
  // soon as we know the sessionId, and resumes polling if there's still an
  // open ticket.
  useEffect(() => {
    if (!state.sessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const [convo, ticket] = await Promise.all([
          getConversationHistory(state.sessionId).catch(() => null),
          getTicketStatus(state.sessionId).catch(() => null),
        ]);
        if (cancelled) return;

        if (convo?.messages?.length) {
          const restored: Message[] = convo.messages
            .filter((m: any) => ['user', 'assistant', 'agent'].includes(m.role))
            .map((m: any) => ({
              id: generateId(),
              role: m.role,
              content: m.content,
              timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
            }));
          backendMessageCountRef.current = convo.messages.length;
          setState((prev) => (prev.messages.length > 0 ? prev : { ...prev, messages: restored }));
        }

        if (ticket?.hasActiveTicket) {
          announcedAgentIdRef.current = ticket.assignedAgent?.id || null;
          lastKnownTicketStatusRef.current = ticket.ticketStatus;
          setIsEscalated(true);
          setState((prev) => ({
            ...prev,
            ticketNumber: ticket.ticketNumber,
            ticketStatus: (ticket.ticketStatus as ChatState['ticketStatus']) || prev.ticketStatus,
            ticketCreatedAt: ticket.ticketCreatedAt || prev.ticketCreatedAt,
            assignedAgent: ticket.assignedAgent,
          }));
        }
      } catch {
        // Best-effort restore — fine if it fails silently, normal flow continues
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only re-runs when sessionId changes (fresh session after
    // end-chat/expiry naturally no-ops since the backend has nothing for it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId]);

  const addMessage = useCallback((role: 'user' | 'assistant' | 'agent' | 'system', content: string) => {
    const message: Message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
    return message;
  }, []);

  // Every new message (either side) pushes the wrap-up prompt back out by
  // WRAP_UP_IDLE_MS. If nothing happens for that long, ask a natural
  // closing question instead of letting the session just silently time out.
  // BUG FIX: this previously fired unconditionally after WRAP_UP_IDLE_MS
  // of inactivity, with no awareness of escalation state. If a customer
  // had already been escalated (waiting on a live agent) and then just
  // went quiet for a few minutes, this timer would still fire and drop
  // the bot's "Is there anything else I can help you with?" into the
  // thread — confusing right after being told a human would take over.
  // Guarding on isEscalated here stops that from happening.
  const scheduleWrapUpPrompt = useCallback(() => {
    clearWrapUpTimer();
    if (isEscalated) return;
    wrapUpTimerRef.current = setTimeout(() => {
      if (isEscalated) return;
      addMessage('assistant', 'Is there anything else I can help you with?');
    }, WRAP_UP_IDLE_MS);
  }, [addMessage, clearWrapUpTimer, isEscalated]);

  useEffect(() => clearWrapUpTimer, [clearWrapUpTimer]);

  const pollForAgentReplies = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      const convo = await getConversationHistory(state.sessionId);
      const backendMessages: { role: string; content: string; timestamp?: string }[] = convo.messages || [];
      if (backendMessages.length > backendMessageCountRef.current) {
        const newOnes = backendMessages.slice(backendMessageCountRef.current);
        newOnes
          .filter((m) => m.role === 'agent')
          .forEach((m) => addMessage('agent', m.content));
        backendMessageCountRef.current = backendMessages.length;
      }
    } catch {
      // Best-effort — a missed poll tick just gets caught by the next one
    }

    try {
      const ticket = await getTicketStatus(state.sessionId);
      if (!ticket.hasActiveTicket && !TERMINAL_TICKET_STATUSES.includes(lastKnownTicketStatusRef.current || '')) {
        // Nothing active and we hadn't already flagged it as closed — leave
        // state as-is, the next real message will reconcile it.
        return;
      }

      // Agent just got assigned (wasn't before) — announce it with a nice
      // system message, once per agent.
      if (ticket.assignedAgent && announcedAgentIdRef.current !== ticket.assignedAgent.id) {
        announcedAgentIdRef.current = ticket.assignedAgent.id;
        addMessage('system', `🎯 ${ticket.assignedAgent.name} has joined the conversation and will be helping you today.`);
      }

      // Ticket got resolved/closed from the staff side while the customer
      // wasn't actively messaging — let them know and hand control back to
      // the bot for anything further.
      const wasTerminal = TERMINAL_TICKET_STATUSES.includes(lastKnownTicketStatusRef.current || '');
      const isTerminal = TERMINAL_TICKET_STATUSES.includes(ticket.ticketStatus || '');
      if (isTerminal && !wasTerminal && lastKnownTicketStatusRef.current !== null) {
        addMessage('system', `✅ Your ticket ${ticket.ticketNumber ? `#${ticket.ticketNumber} ` : ''}has been marked as ${ticket.ticketStatus}. Thank you for chatting with us!`);
        setIsEscalated(false);
      }
      lastKnownTicketStatusRef.current = ticket.ticketStatus;

      setState((prev) => ({
        ...prev,
        ticketNumber: ticket.ticketNumber,
        ticketStatus: (ticket.ticketStatus as ChatState['ticketStatus']) || prev.ticketStatus,
        ticketCreatedAt: ticket.ticketCreatedAt || prev.ticketCreatedAt,
        assignedAgent: ticket.assignedAgent,
      }));
    } catch {
      // Best-effort — next tick retries
    }
  }, [state.sessionId, addMessage]);

  // Poll every 4s for as long as the conversation is escalated/handed off.
  // We fetch a fresh baseline count right when escalation starts (rather
  // than trusting local state.messages.length) so the first poll doesn't
  // re-render anything we've already shown.
  useEffect(() => {
    if (!isEscalated || !state.sessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const convo = await getConversationHistory(state.sessionId);
        if (!cancelled) backendMessageCountRef.current = (convo.messages || []).length;
      } catch {
        // If this fails, the interval below will still catch up eventually
      }
    })();

    const interval = setInterval(pollForAgentReplies, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isEscalated, state.sessionId, pollForAgentReplies]);

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || state.isLoading) return;

      addMessage('user', userMessage);
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const response = await sendMessage(state.sessionId, userMessage);

        // FIX — backend may assign a new sessionId when the old one expired.
        // The response always carries the current sessionId; if it changed,
        // persist it so the next message uses the correct one.
        if (response.sessionId && response.sessionId !== state.sessionId) {
          console.log(`🔄 Session updated: ${state.sessionId} → ${response.sessionId}`);
          localStorage.setItem(STORAGE_KEY, response.sessionId);
          setState((prev) => ({ ...prev, sessionId: response.sessionId }));
        }

        // If the session is winding down, nudge toward a natural close
        // rather than a technical "your session is expiring" alert.
        if (response.warning) {
          addMessage('assistant', response.warning.message);
        }

        // Store ticket and agent info if available
        if (response.ticketNumber || response.assignedAgent || response.ticketStatus || response.ticketCreatedAt) {
          setState((prev) => ({
            ...prev,
            ticketNumber: response.ticketNumber || prev.ticketNumber,
            ticketStatus: response.ticketStatus || prev.ticketStatus,
            ticketCreatedAt: response.ticketCreatedAt || prev.ticketCreatedAt,
            assignedAgent: response.assignedAgent || prev.assignedAgent,
          }));
        }

        // Render the AI response
        if (response.humanHandled) {
          // An agent has already taken this session over — the bot stays
          // silent (no response.response to show). The poll effect above
          // will pick up the agent's reply once they send one.
          clearWrapUpTimer();
          if (response.assignedAgent?.name) {
            addMessage(
              'system',
              `🎯 Connecting you to ${response.assignedAgent.name}... Please hold on.`
            );
          }
          setIsEscalated(true);
        } else if (response.escalation) {
          addMessage('assistant', response.response || "I'd like to connect you with a specialist.");
          
          // Add handoff message with ticket info if available
          if (response.ticketNumber) {
            addMessage(
              'system',
              `📋 Ticket #${response.ticketNumber}\n\n⏳ Please hold on as we connect you to a customer care agent...`
            );
          }
          
          // Add agent name if already assigned
          if (response.assignedAgent?.name) {
            addMessage(
              'system',
              `🎯 You're being connected to ${response.assignedAgent.name}...`
            );
          }
          
          clearWrapUpTimer();
          setIsEscalated(true);
          // Don't schedule wrap-up prompt when escalating — let the human handle it
        } else {
          addMessage('assistant', response.response);
          scheduleWrapUpPrompt();
        }

      } catch (error: any) {
        if (error.status === 410) {
          // True session expiry (backend returned 410 explicitly). Reset
          // silently — no "your session expired" framing, just greet them
          // like the start of any new conversation.
          const newSessionId = generateId();
          localStorage.setItem(STORAGE_KEY, newSessionId);
          setState((prev) => ({ ...prev, sessionId: newSessionId }));
          addMessage('assistant', "Hi! I'm Bima, your CIC Insurance assistant. How can I help you today?");
        } else {
          addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        }
        console.error('Chat error:', error);
        scheduleWrapUpPrompt();
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [state.sessionId, state.isLoading, addMessage, scheduleWrapUpPrompt, clearWrapUpTimer]
  );

  const clearMessages = useCallback(() => {
    clearWrapUpTimer();
    const newSessionId = generateId();
    localStorage.setItem(STORAGE_KEY, newSessionId);
    backendMessageCountRef.current = 0;
    setIsEscalated(false);
    setState((prev) => ({
      ...prev,
      messages: [],
      sessionId: newSessionId,
      ticketNumber: null,
      ticketStatus: 'open',
      ticketCreatedAt: undefined,
      assignedAgent: null,
    }));
  }, [clearWrapUpTimer]);

  // Explicit, user-confirmed end of the conversation: tells the backend to
  // close the session and wipe its stored messages, then resets local
  // state so the widget is ready for a brand-new conversation next time
  // it's opened. Best-effort on the backend call — local state is always
  // reset even if the network request fails, so the user never gets stuck.
  const endChatSession = useCallback(async () => {
    clearWrapUpTimer();
    const sessionToEnd = state.sessionId;
    try {
      if (sessionToEnd) {
        await endSession(sessionToEnd);
      }
    } catch (error) {
      console.error('Failed to end session on backend:', error);
    } finally {
      const newSessionId = generateId();
      localStorage.setItem(STORAGE_KEY, newSessionId);
      backendMessageCountRef.current = 0;
      setIsEscalated(false);
      setState((prev) => ({
        ...prev,
        messages: [],
        sessionId: newSessionId,
        ticketNumber: null,
        ticketStatus: 'open',
        ticketCreatedAt: undefined,
        assignedAgent: null,
      }));
    }
  }, [state.sessionId, clearWrapUpTimer]);

  // Customer closes their own open ticket from the ticket card's "Close
  // ticket" button. Permanent, per the requested UX — once closed it stays
  // closed. Doesn't end the chat session/widget itself (that's
  // endChatSession, below) — the customer can keep chatting with the bot
  // afterwards, they just no longer have a pending support ticket.
  const [isClosingTicket, setIsClosingTicket] = useState(false);
  const closeTicket = useCallback(async () => {
    if (!state.sessionId || !state.ticketNumber) return;
    setIsClosingTicket(true);
    try {
      const result = await closeTicketApi(state.sessionId);
      setIsEscalated(false);
      lastKnownTicketStatusRef.current = 'closed';
      setState((prev) => ({ ...prev, ticketStatus: 'closed' }));
      addMessage('system', `✅ Ticket ${result.ticketNumber ? `#${result.ticketNumber} ` : ''}closed. Thanks for chatting with us — let us know if there's anything else!`);
    } catch (error) {
      console.error('Failed to close ticket:', error);
      addMessage('system', "Sorry, we couldn't close your ticket right now. Please try again in a moment.");
    } finally {
      setIsClosingTicket(false);
    }
  }, [state.sessionId, state.ticketNumber, addMessage]);

  const toggleChat = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  return {
    ...state,
    addMessage,
    handleSendMessage,
    clearMessages,
    endChatSession,
    closeTicket,
    isClosingTicket,
    toggleChat,
  };
}