import { AvionixError } from '@/domain/errors/avionix-error';
import type { Logger } from '@/infrastructure/logging/logger';
import { simulatorErrorToAvionixError } from '@/infrastructure/xplane/http/error-mapping';
import type { ResultMessage } from '@/infrastructure/xplane/schemas/websocket';

interface PendingRequest {
  resolve: () => void;
  reject: (error: AvionixError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestManager {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly options: { defaultTimeoutMs: number; logger: Logger }) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  nextRequestId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  register(reqId: number, timeoutMs: number = this.options.defaultTimeoutMs): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(
          new AvionixError({
            code: 'TIMEOUT',
            message: `X-Plane did not answer WebSocket request ${reqId} within ${timeoutMs} ms`,
            retryable: true,
          }),
        );
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
    });
  }

  settle(result: ResultMessage): boolean {
    const entry = this.pending.get(result.req_id);
    if (entry === undefined) {
      this.options.logger.debug('unmatched result message', {
        reqId: result.req_id,
        success: result.success,
        errorCode: result.error_code,
      });
      return false;
    }
    clearTimeout(entry.timer);
    this.pending.delete(result.req_id);
    if (result.success) {
      entry.resolve();
    } else {
      entry.reject(
        simulatorErrorToAvionixError({
          errorCode: result.error_code ?? 'unknown_error',
          errorMessage: result.error_message,
        }),
      );
    }
    return true;
  }

  rejectAll(error: AvionixError): void {
    for (const [reqId, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(reqId);
      entry.reject(error);
    }
  }
}
