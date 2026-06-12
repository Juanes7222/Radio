export type VideoStatus =
  | "RECEIVED"
  | "CHECKING_METADATA"
  | "IGNORED"
  | "DOWNLOADING"
  | "UPLOADING"
  | "DONE"
  | "ERROR"
  | "RETRYING";

export interface VideoJob {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Date;
  attempt: number;
}