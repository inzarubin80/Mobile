import { useCallback, useEffect, useRef, useState } from "react";
import type { ViolationChatMessage } from "../types/api";
import {
  getViolationChatHistory,
  sendViolationChatMessageHttp,
  updateViolationChatMessageHttp,
  deleteViolationChatMessageHttp,
} from "../lib/api";
import { getViolationChatWsUrl } from "../lib/config";

interface UseViolationChatState {
  messages: ViolationChatMessage[];
  connected: boolean;
  connecting: boolean;
  error: string | null;
  sending: boolean;
}

export function useViolationChat(violationId: string, currentUserId: number | null) {
  const [state, setState] = useState<UseViolationChatState>({
    messages: [],
    connected: false,
    connecting: false,
    error: null,
    sending: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyClosedRef = useRef(false);

  const setPartialState = useCallback((patch: Partial<UseViolationChatState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!violationId) {
      return () => {
        cancelled = true;
      };
    }
    setPartialState({ error: null });
    getViolationChatHistory(violationId, 1, 50)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...(res.items || [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setPartialState({ messages: sorted });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setPartialState({ error: err?.message || "Не удалось загрузить историю чата" });
      });
    return () => {
      cancelled = true;
    };
  }, [violationId, setPartialState]);

  const scheduleReconnect = useCallback(() => {
    if (manuallyClosedRef.current) {
      return;
    }
    const attempts = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempts;
    const delay = Math.min(30000, 1000 * Math.pow(2, attempts - 1)); // 1s,2s,4s,...,max 30s
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, delay);
  }, []);

  const handleIncomingMessage = useCallback((msg: ViolationChatMessage) => {
    setState((prev) => {
      if (prev.messages.find((m) => m.id === msg.id)) {
        return prev;
      }
      const nextMessages = [...prev.messages, msg].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return { ...prev, messages: nextMessages };
    });
  }, []);

  const handleUpdatedMessage = useCallback((msg: ViolationChatMessage) => {
    setState((prev) => {
      const nextMessages = prev.messages.map((m) => (m.id === msg.id ? msg : m));
      return { ...prev, messages: nextMessages };
    });
  }, []);

  const handleDeletedMessage = useCallback((id: string) => {
    setState((prev) => {
      const nextMessages = prev.messages.filter((m) => m.id !== id);
      return { ...prev, messages: nextMessages };
    });
  }, []);

  const connect = useCallback(() => {
    if (!currentUserId || !violationId) {
      return;
    }
    if (wsRef.current) {
      return;
    }
    const url = getViolationChatWsUrl(currentUserId);
    if (!url) {
      return;
    }
    manuallyClosedRef.current = false;
    setPartialState({ connecting: true, error: null });

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setPartialState({ connected: true, connecting: false });
      const payload = JSON.stringify({ type: "subscribe", violation_id: violationId });
      try {
        ws.send(payload);
      } catch (e) {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data) return;
        const payload = data.payload as ViolationChatMessage | { id: string } | undefined;
        switch (data.type) {
          case "message":
            if (payload) {
              handleIncomingMessage(payload as ViolationChatMessage);
            }
            break;
          case "message_updated":
            if (payload) {
              handleUpdatedMessage(payload as ViolationChatMessage);
            }
            break;
          case "message_deleted":
            if (payload && (payload as any).id) {
              handleDeletedMessage((payload as any).id as string);
            }
            break;
          default:
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setPartialState({ error: "Ошибка соединения с чатом" });
    };

    ws.onclose = () => {
      wsRef.current = null;
      setPartialState({ connected: false, connecting: false });
      if (!manuallyClosedRef.current) {
        scheduleReconnect();
      }
    };
  }, [currentUserId, violationId, setPartialState, handleIncomingMessage, scheduleReconnect]);

  // Connect / reconnect when ids change
  useEffect(() => {
    if (!currentUserId || !violationId) {
      return;
    }
    connect();
    return () => {
      manuallyClosedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [currentUserId, connect]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !violationId) return;
      setPartialState({ sending: true, error: null });
      const ws = wsRef.current;
      const wsReady = ws && ws.readyState === WebSocket.OPEN;

      if (wsReady) {
        try {
          const payload = JSON.stringify({
            type: "message",
            violation_id: violationId,
            text: trimmed,
          });
          ws!.send(payload);
          // сообщение вернётся с бэка через ws как ViolationChatMessage
          setPartialState({ sending: false });
          return;
        } catch (e: any) {
          // fallback на HTTP
        }
      }

      try {
        const msg = await sendViolationChatMessageHttp(violationId, trimmed);
        handleIncomingMessage(msg);
      } catch (err: any) {
        setPartialState({
          error: err?.message || "Не удалось отправить сообщение",
        });
      } finally {
        setPartialState({ sending: false });
      }
    },
    [violationId, handleIncomingMessage, setPartialState]
  );

  const updateMessage = useCallback(
    async (messageId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !violationId) return;
      try {
        const msg = await updateViolationChatMessageHttp(violationId, messageId, trimmed);
        handleUpdatedMessage(msg);
      } catch (err: any) {
        setPartialState({
          error: err?.message || "Не удалось изменить сообщение",
        });
      }
    },
    [violationId, handleUpdatedMessage, setPartialState]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!violationId) return;
      try {
        await deleteViolationChatMessageHttp(violationId, messageId);
        handleDeletedMessage(messageId);
      } catch (err: any) {
        setPartialState({
          error: err?.message || "Не удалось удалить сообщение",
        });
      }
    },
    [violationId, handleDeletedMessage, setPartialState]
  );

  return {
    messages: state.messages,
    connected: state.connected,
    connecting: state.connecting,
    error: state.error,
    sending: state.sending,
    send,
    updateMessage,
    deleteMessage,
  };
}


