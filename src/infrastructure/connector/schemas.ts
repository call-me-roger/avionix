import { z } from 'zod';

/** `GET /avionix/info` — see docs/connector.md. */
export const connectorInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  pairingRequired: z.boolean(),
  xplane: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    reachable: z.boolean(),
  }),
});

/** `POST /avionix/pair` success body. */
export const pairResponseSchema = z.object({ token: z.string().min(1) });
