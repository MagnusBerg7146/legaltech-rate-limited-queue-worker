import { infrai } from './infrai';
import type { LegalJob } from './legal_job';

async function main(): Promise<void> {
  await infrai.queue.create('legal-tech-jobs');

  const jobs: LegalJob[] = [
    {
      kind: 'matter_intake',
      jobId: 'job-intake-001',
      matterId: 'MAT-1001',
      idempotencyKey: 'matter-intake-MAT-1001-v1',
      priority: 'urgent',
      clientName: 'Acme Holdings',
      conflictCheckPassed: true,
      retainerSigned: true
    },
    {
      kind: 'signed_document_delivery',
      jobId: 'job-signed-001',
      matterId: 'MAT-1001',
      idempotencyKey: 'signed-packet-MAT-1001-v1',
      priority: 'normal',
      signerEmail: 'ops@acme.test',
      documentName: 'Settlement Agreement',
      signedDownloadUrl: 'https://example.com/signed/settlement-agreement.pdf'
    },
    {
      kind: 'deadline_follow_up',
      jobId: 'job-deadline-001',
      matterId: 'MAT-1002',
      idempotencyKey: 'deadline-follow-up-MAT-1002-v1',
      priority: 'urgent',
      dueAt: '2026-01-12T15:00:00.000Z',
      now: '2026-01-11T03:00:00.000Z',
      responsibleAttorney: 'Jordan Lee'
    }
  ];

  for (const job of jobs) {
    await infrai.queue.publish(job);
    console.log('published', job.kind, job.matterId, job.idempotencyKey);
  }
}

void main();
