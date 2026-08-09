/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_STATION_URL: string
  readonly VITE_STATION_ID: string
  readonly VITE_API_KEY: string
  readonly VITE_MAINTENANCE: string
  readonly VITE_FIREBASE_CONFIG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
