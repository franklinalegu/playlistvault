/// <reference types="vite/client" />
import type { VaultApi } from '../electron/preload/index';

declare global {
  interface Window {
    vault: VaultApi;
  }
}

export {};
