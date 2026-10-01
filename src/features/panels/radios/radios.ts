import {
  FEATURE_COM1,
  FEATURE_COM2,
  FEATURE_NAV1,
  FEATURE_NAV2,
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { formatCom, formatNav } from '@/domain/radios/channels';
import type { EntryKind } from '@/domain/radios/entry';

export type RadioKey = 'com1' | 'com2' | 'nav1' | 'nav2';

export interface RadioSpec {
  key: RadioKey;
  label: string;
  kind: 'com' | 'nav';
  featureId: string;
  active: string;
  standby: string;
  flip: string;
  navId?: string;
  hasDme?: string;
  dme?: string;
  course?: string;
}

export const RADIOS: readonly RadioSpec[] = [
  {
    key: 'com1',
    label: 'COM1',
    kind: 'com',
    featureId: FEATURE_COM1,
    active: D.com1Active,
    standby: D.com1Standby,
    flip: C.com1Flip,
  },
  {
    key: 'com2',
    label: 'COM2',
    kind: 'com',
    featureId: FEATURE_COM2,
    active: D.com2Active,
    standby: D.com2Standby,
    flip: C.com2Flip,
  },
  {
    key: 'nav1',
    label: 'NAV1',
    kind: 'nav',
    featureId: FEATURE_NAV1,
    active: D.nav1Active,
    standby: D.nav1Standby,
    flip: C.nav1Flip,
    navId: D.nav1Id,
    hasDme: D.nav1HasDme,
    dme: D.nav1Dme,
    course: D.nav1Course,
  },
  {
    key: 'nav2',
    label: 'NAV2',
    kind: 'nav',
    featureId: FEATURE_NAV2,
    active: D.nav2Active,
    standby: D.nav2Standby,
    flip: C.nav2Flip,
    navId: D.nav2Id,
    hasDme: D.nav2HasDme,
    dme: D.nav2Dme,
    course: D.nav2Course,
  },
];

export function formatFrequency(kind: 'com' | 'nav', value: number): string {
  return kind === 'com' ? formatCom(value) : formatNav(value);
}

export type EntryTargetId = RadioKey | 'squawk';

export interface EntryTarget {
  id: EntryTargetId;
  title: string;
  kind: EntryKind;
  featureId: string;
  /** The DataRef Set writes. */
  name: string;
  readBackKey: string;
}

export function entryTarget(id: EntryTargetId): EntryTarget {
  if (id === 'squawk') {
    return {
      id,
      title: 'Squawk code',
      kind: 'squawk',
      featureId: FEATURE_TRANSPONDER_CODE,
      name: D.transponderCode,
      readBackKey: 'squawk',
    };
  }
  const radio = RADIOS.find((candidate) => candidate.key === id);
  if (radio === undefined) {
    throw new Error('unknown radio');
  }
  return {
    id,
    title: `${radio.label} standby`,
    kind: radio.kind,
    featureId: radio.featureId,
    name: radio.standby,
    readBackKey: radio.key,
  };
}

export const RADIOS_PANEL: PanelDescriptor = {
  id: 'radios',
  title: 'Radios',
  features: [
    FEATURE_COM1,
    FEATURE_COM2,
    FEATURE_NAV1,
    FEATURE_NAV2,
    FEATURE_TRANSPONDER_CODE,
    FEATURE_TRANSPONDER_MODE,
    FEATURE_TRANSPONDER_IDENT,
  ],
  supports: EVERYWHERE,
};
