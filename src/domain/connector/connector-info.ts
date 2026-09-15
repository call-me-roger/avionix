/**
 * What `GET /avionix/info` reports about an Avionix Connector. The domain layer only
 * describes the shape; validation lives in `src/infrastructure/connector/schemas.ts`.
 */
export interface ConnectorInfo {
  name: string;
  version: string;
  pairingRequired: boolean;
  xplane: { host: string; port: number; reachable: boolean };
}
