/** The web has no haptics engine; every call is a silent no-op. */
export const haptics = {
  press(): void {},
  failure(): void {},
};
