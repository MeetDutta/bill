import { useEffect, useRef, useState, useCallback } from "react";
import api, { getApiBaseUrl } from "@/lib/api";

export interface RealtimeEventPayload {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  store_id: string | null;
  payload: Record<string, any>;
}

export const realtimeApi = {
  getStreamTicket: async () => {
    try {
      const res = await api.post<{ ticket: string; expires_in: number }>("/pos/realtime/ticket/");
      return res.data.ticket;
    } catch {
      return null;
    }
  },
  getRecentEvents: async (limit = 20) => {
    const res = await api.get<{ events: RealtimeEventPayload[] }>("/pos/realtime/recent/", {
      params: { limit },
    });
    return res.data.events;
  },
};

/**
 * React hook to subscribe to live Server-Sent Events (SSE) from BillMeet backend.
 * Uses secure short-lived stream tickets to prevent exposing long-lived access tokens in URLs.
 */
export function useRealtimeSubscription(
  onEvent?: (event: RealtimeEventPayload) => void,
  eventFilter?: string[]
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEventPayload | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const onEventCallback = useRef(onEvent);
  useEffect(() => {
    onEventCallback.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsConnected(false);
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Require short-lived single-use ticket; fail safely without exposing JWT in URLs
    const ticket = await realtimeApi.getStreamTicket();
    if (!ticket) {
      setIsConnected(false);
      setConnectionError("Failed to obtain real-time stream ticket. Retrying in 5s...");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
      return;
    }

    const baseUrl = getApiBaseUrl();
    let url = `${baseUrl}/pos/realtime/stream/?ticket=${encodeURIComponent(ticket)}`;

    if (lastEventIdRef.current) {
      url += `&last_event_id=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
      };

      es.onmessage = (e) => {
        try {
          if (e.lastEventId) {
            lastEventIdRef.current = e.lastEventId;
          }
          const parsed: RealtimeEventPayload = JSON.parse(e.data);
          if (parsed && parsed.id) {
            lastEventIdRef.current = parsed.id;
          }

          if (
            !eventFilter ||
            eventFilter.length === 0 ||
            eventFilter.includes(parsed.event_type)
          ) {
            setLastEvent(parsed);
            if (onEventCallback.current) {
              onEventCallback.current(parsed);
            }
          }
        } catch {
          // Ignore keepalive comments or non-JSON pings
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        setConnectionError("Real-time stream disconnected. Retrying...");
        es.close();
        eventSourceRef.current = null;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (err: any) {
      setIsConnected(false);
      setConnectionError(err?.message || "Failed to initialize EventSource");
    }
  }, [eventFilter]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, lastEvent, connectionError, reconnect: connect };
}
