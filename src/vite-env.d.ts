/// <reference types="vite/client" />

/** Injected by vite.config.ts at build time. */
declare const __APP_VERSION__: string;
/** `git describe --tags --always --dirty --abbrev=40`, or `APP_COMMIT` when building outside git. */
declare const __COMMIT_HASH__: string;

/** Optional build-time RPCs (see .env.example). */
interface ImportMetaEnv {
  readonly VITE_RPC_URLS_1?: string;
  readonly VITE_RPC_URLS_8453?: string;
  readonly VITE_RPC_URLS_42161?: string;
  readonly VITE_RPC_URLS_10?: string;
  readonly VITE_RPC_URLS_57073?: string;
  readonly VITE_RPC_URLS_143?: string;
}
