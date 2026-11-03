import test from 'node:test';
import assert from 'node:assert/strict';
import { decideJobOutcome, legalJobSchema } from '../src/legal_job';
import { processMessage } from '../src/queue_worker';

test('matter intake opens a matter only when conflict check and retainer are done', () => {
  const parsed = legalJobSchema.parse({
    kind: 'matter_intake',
    jobId: 'job-1',
    matterId: 'MAT-2001',
    idempotencyKey: 'matter-intake-MAT-2001-v1',
    priority: 'urgent',
    clientName: 'Northwind LLC',
    conflictCheckPassed: true,
    retainerSigned: true
  });

  const outcome = decideJobOutcome(parsed);
  assert.equal(outcome.action, 'open_matter');
  assert.equal(outcome.nextState, 'matter_open');
});

test('deadline inside 48 hours sends a follow-up reminder', () => {
  const parsed = legalJobSchema.parse({
    kind: 'deadline_follow_up',
    jobId: 'job-2',
    matterId: 'MAT-2002',
    idempotencyKey: 'deadline-follow-up-MAT-2002-v1',
    priority: 'urgent',
    dueAt: '2026-03-02T12:00:00.000Z',
    now: '2026-03-01T10:00:00.000Z',
    responsibleAttorney: 'Priya Raman'
  });

  const outcome = decideJobOutcome(parsed);
  assert.equal(outcome.action, 'send_deadline_reminder');
  assert.equal(outcome.nextState, 'reminder_sent');
});

test('invalid payload is nacked instead of acked', async () => {
  const calls: string[] = [];

  await processMessage(
    {
      message_id: 'msg-1',
      payload: {
        kind: 'signed_document_delivery',
        matterId: 'MAT-3001'
      }
    },
    {
      ack: async () => {
        calls.push('ack');
        return {};
      },
      nack: async () => {
        calls.push('nack');
        return {};
      },
      log: () => {}
    }
  );

  assert.deepEqual(calls, ['nack']);
});
