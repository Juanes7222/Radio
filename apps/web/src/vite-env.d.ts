/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin used by the browser. Empty means same-origin. */
  readonly VITE_API_BASE_URL: string
  /** Backend the Vite dev proxy forwards to. Not exposed to the app. */
  readonly VITE_API_PROXY_TARGET: string
  readonly VITE_STATION_URL: string
  readonly VITE_STATION_ID: string
  readonly VITE_API_KEY: string
  readonly VITE_MAINTENANCE: string
  readonly VITE_FIREBASE_CONFIG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
