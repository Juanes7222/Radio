export type VideoStatus =
  | "RECEIVED"
  | "CHECKING_METADATA"
  | "IGNORED"
  | "DOWNLOADING"
  | "UPLOADING"
  | "UPLOAD_PENDING"
  | "DONE"
  | "ERROR"
  | "RETRYING"
  | "ABANDONED";

export interface VideoJob {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Date;
  attempt: number;
}