import { infrai, InfraiError, type QueueMessage } from './infrai';
import { decideJobOutcome, legalJobSchema, type LegalJob } from './legal_job';

export type WorkerDeps = {
  consume: typeof infrai.queue.consume<unknown>;
  ack: typeof infrai.queue.ack;
  nack: typeof infrai.queue.nack;
  log: (line: string) => void;
};

export async function processMessage(
  message: QueueMessage<unknown>,
  deps: Pick<WorkerDeps, 'ack' | 'nack' | 'log'>
): Promise<void> {
  const parsed = legalJobSchema.safeParse(message.payload);
  if (!parsed.success) {
    deps.log(`nack invalid payload ${message.message_id}`);
    await deps.nack(message.message_id);
    return;
  }

  const outcome = decideJobOutcome(parsed.data);
  deps.log(`${parsed.data.kind} ${parsed.data.matterId} -> ${outcome.action} (${outcome.nextState})`);
  await deps.ack(message.message_id);
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const active = new Set<Promise<void>>();

  for (const item of items) {
    const job = worker(item).finally(() => active.delete(job));
    active.add(job);
    if (active.size >= limit) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}

export async function pollOnce(deps: WorkerDeps, maxMessages: number, concurrency: number): Promise<number> {
  const batch = await deps.consume(maxMessages, 120);
  const messages = batch.messages || [];
  await runWithConcurrency(messages, concurrency, (message) => processMessage(message, deps));
  return messages.length;
}

async function main(): Promise<void> {
  const deps: WorkerDeps = {
    consume: infrai.queue.consume,
    ack: infrai.queue.ack,
    nack: infrai.queue.nack,
    log: (line) => console.log(new Date().toISOString(), line)
  };

  const maxMessages = Number(process.env.WORKER_BATCH_SIZE || '5');
  const concurrency = Number(process.env.WORKER_CONCURRENCY || '2');

  for (;;) {
    try {
      const count = await pollOnce(deps, maxMessages, concurrency);
      if (count === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      if (error instanceof InfraiError) {
        console.error('worker request failed', error.status, error.message);
      } else {
        console.error('worker stopped', error);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('queue_worker.ts')) {
  void main();
}
