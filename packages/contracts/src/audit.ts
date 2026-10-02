import { z } from 'zod';

import { PaginationQuerySchema, UserRefSchema } from './documents.js';

export const AUDIT_ACTIONS = [
  'auth.sign_in',
  'auth.sign_out',
  'organization.create',
  'invitation.create',
  'invitation.accept',
  'member.remove',
  'member.role_change',
  'document.upload',
  'document.delete',
  'analysis.ask',
  'analysis.compare',
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/**
 * Audit metadata holds ids, counts, flags and durations only: never document text, filenames,
 * questions, answers, emails or names.
 */
export const AuditMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);
export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;

export const AuditEventSchema = z.object({
  id: z.uuid(),
  action: AuditActionSchema,
  actor: UserRefSchema.nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  requestId: z.string().nullable(),
  metadata: AuditMetadataSchema,
  createdAt: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const ListAuditEventsQuerySchema = PaginationQuerySchema.extend({
  action: AuditActionSchema.optional(),
});
export type ListAuditEventsQuery = z.infer<typeof ListAuditEventsQuerySchema>;

export const AuditEventListResponseSchema = z.object({
  items: z.array(AuditEventSchema),
  total: z.int().nonnegative(),
});
export type AuditEventListResponse = z.infer<typeof AuditEventListResponseSchema>;
