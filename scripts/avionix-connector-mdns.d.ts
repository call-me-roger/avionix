export interface AdvertiserSpec {
  name: string;
  port: number;
  txt: Record<string, string>;
}
export interface Advertisement {
  stop(): Promise<void>;
}
export type Advertiser = (spec: AdvertiserSpec) => Advertisement;
export interface BonjourLike {
  publish(options: { name: string; type: string; port: number; txt: Record<string, string> }): {
    stop(callback: () => void): void;
  };
  destroy(): void;
}
export const SERVICE_TYPE: 'avionix';
export function createBonjourAdvertiser(factory?: () => BonjourLike): Advertiser;
export function createNullAdvertiser(): Advertiser;
