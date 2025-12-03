/**
 * useChatSessions Hook
 *
 * React hook for managing chat sessions.
 */

import { useState, useCallback, useEffect } from 'react';
import { chatStorageService } from '../services/chat-storage-service';
import { CHAT_CONSTANTS } from '../constants/CHAT_CONSTANTS';
import type { ChatSession, UseChatSessionsReturn } from '../types/chat.types';

export function useChatSessions(): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      try {
        const loadedSessions = await chatStorageService.getAllSessions();
        setSessions(loadedSessions);

        // Load drawer state to get active session
        const drawerState = chatStorageService.getDrawerState();
        if (drawerState.activeSessionId) {
          const active = loadedSessions.find(
            (s) => s.id === drawerState.activeSessionId
          );
          if (active) {
            setActiveSession(active);
          } else if (loadedSessions.length > 0) {
            setActiveSession(loadedSessions[0]);
          }
        } else if (loadedSessions.length > 0) {
          setActiveSession(loadedSessions[0]);
        }
      } catch (error) {
        console.error('[useChatSessions] Failed to load sessions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, []);

  // Create a new session
  const createSession = useCallback(async (): Promise<ChatSession> => {
    const newSession = await chatStorageService.createSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSession(newSession);

    // Update drawer state
    chatStorageService.setDrawerState({ activeSessionId: newSession.id });

    // Prune old sessions if exceeding limit
    if (sessions.length >= CHAT_CONSTANTS.MAX_SESSIONS) {
      await chatStorageService.pruneOldSessions(CHAT_CONSTANTS.MAX_SESSIONS);
      const updatedSessions = await chatStorageService.getAllSessions();
      setSessions(updatedSessions);
    }

    return newSession;
  }, [sessions.length]);

  // Select a session
  const selectSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        setActiveSession(session);
        chatStorageService.setDrawerState({ activeSessionId: sessionId });
      }
    },
    [sessions]
  );

  // Delete a session
  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await chatStorageService.deleteSession(sessionId);

      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId);

        // If deleting active session, select another
        if (activeSession?.id === sessionId) {
          const newActive = updated[0] || null;
          setActiveSession(newActive);
          chatStorageService.setDrawerState({
            activeSessionId: newActive?.id || null,
          });
        }

        return updated;
      });
    },
    [activeSession]
  );

  // Update session title
  const updateSessionTitle = useCallback(
    async (sessionId: string, title: string): Promise<void> => {
      await chatStorageService.updateSession(sessionId, { title });

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );

      if (activeSession?.id === sessionId) {
        setActiveSession((prev) => (prev ? { ...prev, title } : null));
      }
    },
    [activeSession]
  );

  return {
    sessions,
    activeSession,
    isLoading,
    createSession,
    selectSession,
    deleteSession,
    updateSessionTitle,
  };
}
