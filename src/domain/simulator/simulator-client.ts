import type {
  CommandDescriptor,
  DataRefDescriptor,
  DataRefSubscription,
  DataRefUpdate,
  DataRefValue,
} from '@/domain/simulator/types';

export interface SocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
  initiatedByClient: boolean;
}

export type Unsubscribe = () => void;

/**
 * Simulator-facing port consumed by the application layer.
 * The X-Plane Web API implementation lives in infrastructure/xplane.
 */
export interface SimulatorClient {
  findDataRef(name: string): Promise<DataRefDescriptor | null>;
  findCommand(name: string): Promise<CommandDescriptor | null>;
  getDataRefValue(id: number, index?: number): Promise<DataRefValue>;
  setDataRefValue(id: number, value: DataRefValue, index?: number): Promise<void>;
  activateCommand(id: number, durationSeconds?: number): Promise<void>;
  connectWebSocket(): Promise<void>;
  subscribeDataRefs(subscriptions: DataRefSubscription[]): Promise<void>;
  unsubscribeDataRefs(subscriptions: DataRefSubscription[] | 'all'): Promise<void>;
  onDataRefUpdate(listener: (updates: DataRefUpdate[]) => void): Unsubscribe;
  onSocketClosed(listener: (info: SocketCloseInfo) => void): Unsubscribe;
  disconnectWebSocket(): void;
}
