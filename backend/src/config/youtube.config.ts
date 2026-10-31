import { envOr } from "./env";

export const youtubeConfig = {
  // Empty by default so a station without ingestion still boots; the poller reports
  // the missing key instead of the process refusing to start.
  apiKey: envOr("YOUTUBE_API_KEY", ""),
};
