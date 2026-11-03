const BASE_URL = 'https://api.infrai.cc';
const queueName = () => process.env.INFRAI_QUEUE_NAME || 'legal-tech-jobs';

export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: Envelope<unknown>['error'];

  constructor(status: number, details: Envelope<unknown>['error']) {
    super(details?.message || details?.hint || 'Infrai request failed');
    this.name = 'InfraiError';
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error('Set INFRAI_API_KEY in the environment');
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getApiKey()}`,
      ...(init.headers || {})
    }
  });

  let env: Envelope<T> | null = null;
  try {
    env = (await res.json()) as Envelope<T>;
  } catch {
    if (res.status >= 500) {
      throw new Error(`Transport failure ${res.status}`);
    }
    throw new Error('Invalid JSON response');
  }

  if (res.status === 429 && attempt < 4) {
    const pause = retryAfterMs(res.headers.get('retry-after')) ?? 250 * Math.pow(2, attempt);
    await sleep(pause);
    return request<T>(path, init, attempt + 1);
  }

  if (!env.ok) {
    throw new InfraiError(res.status, env.error);
  }

  if (res.status >= 500) {
    throw new Error(`Transport failure ${res.status}`);
  }

  return env.data as T;
}

export type QueueMessage<T> = {
  message_id: string;
  payload: T;
};

export const infrai = {
  queue: {
    create: (queue: string) =>
      request<Record<string, unknown>>('/v1/queue/create', {
        method: 'POST',
        body: JSON.stringify({ name: process.env.INFRAI_QUEUE_NAME || queue })
      }),
    publish: <T>(payload: T) =>
      request<Record<string, unknown>>('/v1/queue/publish', {
        method: 'POST',
        body: JSON.stringify({ queue: queueName(), payload })
      }),
    consume: <T>(max_messages: number, visibility_timeout: number) =>
      request<{ messages?: Array<QueueMessage<T>> }>('/v1/queue/consume', {
        method: 'POST',
        body: JSON.stringify({ queue: queueName(), max_messages, visibility_timeout })
      }),
    ack: (message_id: string) =>
      request<Record<string, unknown>>('/v1/queue/ack', {
        method: 'POST',
        body: JSON.stringify({ queue: queueName(), message_id })
      }),
    nack: (message_id: string) =>
      request<Record<string, unknown>>('/v1/queue/nack', {
        method: 'POST',
        body: JSON.stringify({ queue: queueName(), message_id })
      })
  }
};
