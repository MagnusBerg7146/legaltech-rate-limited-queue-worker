import { z } from 'zod';

const baseJob = z.object({
  jobId: z.string().min(1),
  matterId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  priority: z.enum(['normal', 'urgent'])
});

const matterIntake = baseJob.extend({
  kind: z.literal('matter_intake'),
  clientName: z.string().min(1),
  conflictCheckPassed: z.boolean(),
  retainerSigned: z.boolean()
});

const signedDocumentDelivery = baseJob.extend({
  kind: z.literal('signed_document_delivery'),
  signerEmail: z.string().email(),
  documentName: z.string().min(1),
  signedDownloadUrl: z.string().url()
});

const deadlineFollowUp = baseJob.extend({
  kind: z.literal('deadline_follow_up'),
  dueAt: z.string().datetime(),
  now: z.string().datetime(),
  responsibleAttorney: z.string().min(1)
});

export const legalJobSchema = z.discriminatedUnion('kind', [
  matterIntake,
  signedDocumentDelivery,
  deadlineFollowUp
]);

export type LegalJob = z.infer<typeof legalJobSchema>;

export type JobOutcome = {
  action: 'open_matter' | 'hold_intake' | 'deliver_signed_packet' | 'send_deadline_reminder' | 'no_follow_up_needed';
  nextState: string;
  note: string;
};

export function decideJobOutcome(job: LegalJob): JobOutcome {
  switch (job.kind) {
    case 'matter_intake': {
      if (job.conflictCheckPassed && job.retainerSigned) {
        return {
          action: 'open_matter',
          nextState: 'matter_open',
          note: `Matter ${job.matterId} opened for ${job.clientName}`
        };
      }
      return {
        action: 'hold_intake',
        nextState: 'pending_documents',
        note: `Matter ${job.matterId} is waiting on intake completion`
      };
    }
    case 'signed_document_delivery':
      return {
        action: 'deliver_signed_packet',
        nextState: 'signed_packet_delivered',
        note: `Delivered ${job.documentName} to ${job.signerEmail}`
      };
    case 'deadline_follow_up': {
      const dueMs = new Date(job.dueAt).getTime();
      const nowMs = new Date(job.now).getTime();
      const hoursUntilDue = (dueMs - nowMs) / (1000 * 60 * 60);
      if (hoursUntilDue <= 48) {
        return {
          action: 'send_deadline_reminder',
          nextState: 'reminder_sent',
          note: `Reminder sent to ${job.responsibleAttorney} for matter ${job.matterId}`
        };
      }
      return {
        action: 'no_follow_up_needed',
        nextState: 'watching_deadline',
        note: `Deadline for matter ${job.matterId} is not inside the reminder window`
      };
    }
  }
}
