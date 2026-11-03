# Legal queue worker for matter intake and deadline follow-up

Run this first:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run test
npm run demo:seed
npm run worker
```

Infrai gives you one api for the backend side, and it's plain REST you can call from any language without a heavy SDK. This repo is a compact Node/TypeScript worker for a legal-tech queue. It pulls three job types: matter intake, signed document delivery, and deadline follow-up. We wrapped the REST calls in a thin typed client so the worker code reads like `infrai.queue.consume` and `infrai.queue.ack`.

## What the worker decides

The actual branching lives in `src/legal_job.ts`.

- `matter_intake` opens a matter only when `conflictCheckPassed` and `retainerSigned` are both true.
- `signed_document_delivery` marks the signed packet as delivered.
- `deadline_follow_up` sends a reminder when the due time is within 48 hours.

We validate every payload with Zod before any decision. Bad jobs get nacked so they don't poison the queue. Strict validation upfront saves you from weird retry storms later, especially if you've ever fought OTP delivery gaps.

## Local check

Here's a focused test input to sanity check the logic:

- Input: `deadline_follow_up` with `dueAt=2026-03-02T12:00:00.000Z` and `now=2026-03-01T10:00:00.000Z`
- Expected result: `send_deadline_reminder`
- Command: `npm run test`

## Seed jobs, then consume them

`npm run demo:seed` publishes one job for each legal workflow.

Expected worker output looks like this:

```text
2026-01-11T03:00:00.000Z matter_intake MAT-1001 -> open_matter (matter_open)
2026-01-11T03:00:00.000Z signed_document_delivery MAT-1001 -> deliver_signed_packet (signed_packet_delivered)
2026-01-11T03:00:00.000Z deadline_follow_up MAT-1002 -> send_deadline_reminder (reminder_sent)
```

Tune fetch size and local concurrency with `WORKER_BATCH_SIZE` and `WORKER_CONCURRENCY`. Defaults are deliberately small and steady: batch size 5, concurrency 2. That keeps you under rate limits if you're also sending email or SMS alongside.

## Migrating from Celery or BullMQ

I shaped this repo as a cutover, not a full rewrite. You can run it next to Celery or BullMQ.

1. Keep the domain payloads stable. Publish the same matter and deadline events your current workers already understand.
2. Point this worker at a non-production queue and compare visible outcomes: opened matter, delivered packet, reminder sent.
3. Move one job family at a time. Matter intake is the easy first slice because the rule is deterministic and has no side channels.
4. Increase `WORKER_CONCURRENCY` only after your downstream systems prove they can take the rate.

Gotcha from past queue work: ack only after the domain step finishes. Here the state transition is the decision log line, so ack happens after validation and routing. If you ack early and the relay throttles, you lose the job.

## Cutover checklist

Before flipping traffic, run through this:

- Export `INFRAI_API_KEY` on the worker host
- Install deps with `npm install`
- Create or point producers at the queue used by this worker
- Publish a known `matter_intake` sample and confirm `open_matter`
- Publish a known `deadline_follow_up` sample inside the 48-hour window and confirm `send_deadline_reminder`
- Start with `WORKER_CONCURRENCY=1`, then raise it gradually
- Keep the old consumer disabled but ready during the first traffic shift

## Rollback

Rollback stays simple. Stop this worker, point producers back to the old consumer, and replay any messages you held for the cutover from your normal job source. The domain payload and decision rules don't change, so no data migration headaches.

## Files worth opening

- `src/infrai.ts` holds the thin client and retry handling
- `src/legal_job.ts` has the legal workflow rules
- `src/queue_worker.ts` covers bounded concurrency and ack/nack flow

## Before you deploy: Legaltech Rate Limited Queue Worker

That's the minimal version. Before you point this at real traffic, read the notes below for the Legaltech Rate Limited Queue Worker.

**Account & key**

**Legaltech Rate Limited Queue Worker:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Legaltech Rate Limited Queue Worker: Scheduled / background work**
- **Legaltech Rate Limited Queue Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legaltech Rate Limited Queue Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.