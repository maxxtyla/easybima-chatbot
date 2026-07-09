'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ChatState } from '@/types/chat';
import { generateId } from '@/lib/utils';
import { sendMessage, keepAliveSession, endSession } from '@/lib/api';

const STORAGE_KEY = 'cic-chat-session';

// How long to wait after the last message before nudging toward a close.
// The backend session times out after 5 min of inactivity, but our own
// keep-alive ping (below) refreshes it every 4 min — so a reactive
// `response.warning` from the backend would almost never actually reach
// the browser at the right moment. Tracking idle time locally is what
// reliably surfaces the prompt.
const WRAP_UP_IDLE_MS = 3 * 60 * 1000;

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    sessionId: '',
    isOpen: false,
  });

  const wrapUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
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
  const scheduleWrapUpPrompt = useCallback(() => {
    clearWrapUpTimer();
    wrapUpTimerRef.current = setTimeout(() => {
      addMessage('assistant', 'Is there anything else I can help you with?');
    }, WRAP_UP_IDLE_MS);
  }, [addMessage, clearWrapUpTimer]);

  useEffect(() => clearWrapUpTimer, [clearWrapUpTimer]);

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

        // Render the AI response
        if (response.escalation) {
          addMessage('assistant', response.response || "I'd like to connect you with a specialist.");
        } else {
          addMessage('assistant', response.response);
        }

        scheduleWrapUpPrompt();

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
    [state.sessionId, state.isLoading, addMessage, scheduleWrapUpPrompt]
  );

  const clearMessages = useCallback(() => {
    clearWrapUpTimer();
    const newSessionId = generateId();
    localStorage.setItem(STORAGE_KEY, newSessionId);
    setState((prev) => ({ ...prev, messages: [], sessionId: newSessionId }));
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
      setState((prev) => ({ ...prev, messages: [], sessionId: newSessionId }));
    }
  }, [state.sessionId, clearWrapUpTimer]);

  const toggleChat = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  return {
    ...state,
    addMessage,
    handleSendMessage,
    clearMessages,
    endChatSession,
    toggleChat,
  };
}