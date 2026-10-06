export type DeviceClass = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';

export const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];

/**
 * What the framework needs to know about a panel, without its component: the domain stays free of
 * React, and the application layer can reason about panels (subscriptions, persistence) too.
 */
export interface PanelDescriptor {
  /** Stable and persisted, so never reused for a different panel. `setup` is reserved. */
  id: string;
  title: string;
  /** Profile feature ids whose DataRefs this panel reads; they drive the subscription. */
  features: readonly string[];
  supports: Readonly<Record<DeviceClass, readonly Orientation[]>>;
  /**
   * The panel lays out its own scrolling in a fixed-height frame: the frame gives it the space
   * under the title instead of scrolling it (the CDU, which pins its glass above scrolling keys).
   */
  fillsFrame?: boolean;
}

/** Every device class in both orientations. */
export const EVERYWHERE: PanelDescriptor['supports'] = {
  phone: ORIENTATIONS,
  tablet: ORIENTATIONS,
};
