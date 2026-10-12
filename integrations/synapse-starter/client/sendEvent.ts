import { useState } from 'react';

export interface SendEventResult {
  ok: boolean;
  status?: 'accepted' | 'queued';
  eventId?: number;
  error?: string;
}

// The events-OUT primitive. Report something to Noon from anywhere in the app — a button click, a
// completed level, a submitted answer. The call goes to your server (which holds the app secret) and
// on to Citadel; the result says whether it was accepted or queued for retry. The event `type` must
// already exist — a built-in, or one the agent declared at build time. Reference Noon entities by ID
// in the payload (e.g. { studentId: 123 }), never whole records.
export async function sendEvent(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<SendEventResult> {
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `request failed (${res.status})`,
      };
    }
    return {
      ok: true,
      status: data.status as SendEventResult['status'],
      eventId: typeof data.eventId === 'number' ? data.eventId : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed to send' };
  }
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

// Hook flavour for buttons that want to reflect progress: `send` fires the event, `status` and
// `error` drive the UI (disable while sending, show a tick or a message afterward).
export function useSendEvent(): {
  send: (type: string, payload?: Record<string, unknown>) => Promise<SendEventResult>;
  status: SendStatus;
  error: string | null;
} {
  const [status, setStatus] = useState<SendStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async (type: string, payload: Record<string, unknown> = {}) => {
    setStatus('sending');
    setError(null);
    const result = await sendEvent(type, payload);
    setStatus(result.ok ? 'sent' : 'error');
    if (!result.ok) {
      setError(result.error ?? 'failed to send');
    }
    return result;
  };

  return { send, status, error };
}
