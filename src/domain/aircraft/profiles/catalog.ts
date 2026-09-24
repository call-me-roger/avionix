import type { ProfileCatalog } from '@/domain/aircraft/profile';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

/**
 * Every profile that ships with the app. `named` is empty until Stage 4 adds the first
 * aircraft-specific profile; the selection logic is already written for it.
 */
export const BUNDLED_PROFILES: ProfileCatalog = {
  generic: GENERIC_PROFILE,
  named: [],
};
