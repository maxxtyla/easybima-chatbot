'use client';

import { useState, useCallback, useEffect } from 'react';
import { Message, ChatState } from '@/types/chat';
import { generateId } from '@/lib/utils';
import { sendMessage, keepAliveSession, endSession } from '@/lib/api';

const STORAGE_KEY = 'cic-chat-session';

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    sessionId: '',
    isOpen: false,
  });

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

        // Show session-expiry warning if the backend flagged one
        if (response.warning) {
          addMessage('assistant', `⚠️ ${response.warning.message}`);
        }

        // Render the AI response
        if (response.escalation) {
          addMessage('assistant', response.response || "I'd like to connect you with a specialist.");
        } else {
          addMessage('assistant', response.response);
        }

      } catch (error: any) {
        if (error.status === 410) {
          // True session expiry (backend returned 410 explicitly)
          const newSessionId = generateId();
          localStorage.setItem(STORAGE_KEY, newSessionId);
          setState((prev) => ({ ...prev, sessionId: newSessionId }));
          addMessage('assistant', "Your session expired. I've started a fresh conversation — how can I help?");
        } else {
          addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        }
        console.error('Chat error:', error);
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [state.sessionId, state.isLoading, addMessage]
  );

  const clearMessages = useCallback(() => {
    const newSessionId = generateId();
    localStorage.setItem(STORAGE_KEY, newSessionId);
    setState((prev) => ({ ...prev, messages: [], sessionId: newSessionId }));
  }, []);

  // Explicit, user-confirmed end of the conversation: tells the backend to
  // close the session and wipe its stored messages, then resets local
  // state so the widget is ready for a brand-new conversation next time
  // it's opened. Best-effort on the backend call — local state is always
  // reset even if the network request fails, so the user never gets stuck.
  const endChatSession = useCallback(async () => {
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
  }, [state.sessionId]);

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