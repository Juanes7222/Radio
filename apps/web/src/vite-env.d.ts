/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATION_URL: string
  readonly VITE_STATION_ID: string
  readonly VITE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
