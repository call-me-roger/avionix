// react-dom ships no bundled type declarations for its `react-dom/client` entry
// point, and `@types/react-dom` is not part of this project's dependency set.
// This ambient module declaration covers only the subset of the API this test
// suite uses (`createRoot`, the `Root` handle it returns) so `tsc` can type-check
// `tests/web/mvp-screen.web.test.tsx` without adding a new dependency.
declare module 'react-dom/client' {
  import type { ReactNode } from 'react';

  export interface RootOptions {
    identifierPrefix?: string;
    onCaughtError?: (error: unknown, errorInfo: unknown) => void;
    onRecoverableError?: (error: unknown, errorInfo: unknown) => void;
    onUncaughtError?: (error: unknown, errorInfo: unknown) => void;
  }

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root;
}
