import { listEnvOr } from "./env";

export const youtubeConfig = {
  channelIds: listEnvOr("YOUTUBE_CHANNEL_IDS"),
  noticeChanelIds: listEnvOr("YOUTUBE_CHANNEL_NOTICES"),
};
