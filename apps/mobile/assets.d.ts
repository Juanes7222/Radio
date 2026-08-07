/**
 * Metro resolves static image assets to numeric module ids at build time.
 * These declarations let TypeScript type-check imports of the assets used
 * throughout the app (e.g. the logo and the default album art).
 */
declare module '*.png' {
  const value: number;
  export default value;
}
