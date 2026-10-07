/** How a command activation ended: sent and acknowledged, sent and failed, or never sent. */
export type ActivationResult = 'ok' | 'failed' | 'refused';
