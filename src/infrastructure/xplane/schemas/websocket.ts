import { z } from 'zod';

import { dataRefValueSchema } from '@/infrastructure/xplane/schemas/rest';

export const incomingEnvelopeSchema = z.object({ type: z.string() });

export const resultMessageSchema = z.object({
  req_id: z.number().int(),
  type: z.literal('result'),
  success: z.boolean(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});
export type ResultMessage = z.infer<typeof resultMessageSchema>;

export const dataRefUpdateMessageSchema = z.object({
  type: z.literal('dataref_update_values'),
  data: z.record(z.string(), dataRefValueSchema),
});
export type DataRefUpdateMessage = z.infer<typeof dataRefUpdateMessageSchema>;

export const commandUpdateMessageSchema = z.object({
  type: z.literal('command_update_is_active'),
  data: z.record(z.string(), z.boolean()),
});
export type CommandUpdateMessage = z.infer<typeof commandUpdateMessageSchema>;

export type OutgoingMessageType =
  | 'dataref_subscribe_values'
  | 'dataref_unsubscribe_values'
  | 'dataref_set_values'
  | 'command_subscribe_is_active'
  | 'command_unsubscribe_is_active'
  | 'command_set_is_active';

export interface OutgoingMessage {
  req_id: number;
  type: OutgoingMessageType;
  params: Record<string, unknown>;
}
