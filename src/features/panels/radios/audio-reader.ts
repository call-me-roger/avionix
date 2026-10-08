import type { SessionSnapshot } from '@/application/session-snapshot';
import { type AudioReader, audioModel } from '@/domain/audio/audio-model';
import type { ComNumber } from '@/domain/audio/catalogue';
import { numberAt } from '@/domain/systems/readouts';
import { bindingMissing, bindingOk, valueOf } from '@/features/panels/systems/availability';

/** The session snapshot as the audio domain reads it (F-12's three answers). */
export function audioReader(snapshot: SessionSnapshot): AudioReader {
  return {
    has: (name) => bindingOk(snapshot, name),
    missing: (name) => bindingMissing(snapshot, name),
    number: (name) => numberAt(valueOf(snapshot, name), 0),
  };
}

/** The COM X-Plane reports the pilot transmits on, for the COM rows' MIC lamp; null when unknown. */
export function transmittingCom(snapshot: SessionSnapshot): ComNumber | null {
  return audioModel(audioReader(snapshot)).transmitting;
}
