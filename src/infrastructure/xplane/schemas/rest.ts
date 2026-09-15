import { z } from 'zod';

export const capabilitiesResponseSchema = z.object({
  api: z.object({ versions: z.array(z.string()) }),
  'x-plane': z.object({ version: z.string() }),
});
export type RawCapabilities = z.infer<typeof capabilitiesResponseSchema>;

const idSchema = z.number().int().nonnegative();

export const dataRefSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  value_type: z.enum(['float', 'double', 'int', 'int_array', 'float_array', 'data']),
  is_writable: z.boolean().optional(),
});
export type RawDataRef = z.infer<typeof dataRefSchema>;

export const commandSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
});
export type RawCommand = z.infer<typeof commandSchema>;

export const dataRefListResponseSchema = z.object({ data: z.array(dataRefSchema) });
export const commandListResponseSchema = z.object({ data: z.array(commandSchema) });

export const dataRefValueSchema = z.union([z.number(), z.array(z.number()), z.string()]);
export const dataRefValueResponseSchema = z.object({ data: dataRefValueSchema });

export const countResponseSchema = z.object({ data: z.number().int() });

export const errorPayloadSchema = z.object({
  error_code: z.string(),
  error_message: z.string().optional(),
});
export type RawErrorPayload = z.infer<typeof errorPayloadSchema>;
