// Tipos para la API de AzuraCast
// Documentación: https://www.azuracast.com/api/

export interface NowPlayingData {
  station: Station;
  listeners: Listeners;
  live: Live;
  now_playing: NowPlaying;
  playing_next: PlayingNext | null;
  song_history: SongHistory[];
}

export interface Station {
  id: number;
  name: string;
  shortcode: string;
  description: string;
  frontend: string;
  backend: string;
  listen_url: string;
  url: string;
  public_player_url: string;
  playlist_pls_url: string;
  playlist_m3u_url: string;
  is_public: boolean;
  mounts: Mount[];
  remotes: Remote[];
  hls_enabled: boolean;
  hls_url: string | null;
  hls_listeners: number;
}

export interface Mount {
  id: number;
  name: string;
  url: string;
  bitrate: number;
  format: string;
  listeners: Listeners;
  path: string;
  is_default: boolean;
}

export interface Remote {
  id: number;
  name: string;
  url: string;
  bitrate: number;
  format: string;
  listeners: Listeners;
}

export interface Listeners {
  total: number;
  unique: number;
  current: number;
}

export interface Live {
  is_live: boolean;
  streamer_name: string | null;
  broadcast_start: string | null;
  art: string | null;
}

export interface NowPlaying {
  sh_id: number;
  played_at: number;
  duration: number;
  playlist: string;
  streamer: string;
  is_request: boolean;
  song: Song;
  elapsed: number;
  remaining: number;
}

export interface PlayingNext {
  cued_at: number;
  played_at: number;
  duration: number;
  playlist: string;
  is_request: boolean;
  song: Song;
}

export interface SongHistory {
  sh_id: number;
  played_at: number;
  duration: number;
  playlist: string;
  streamer: string;
  is_request: boolean;
  song: Song;
}

export interface Song {
  id: string;
  text: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  isrc: string;
  lyrics: string | null;
  art: string;
  custom_fields: Record<string, string>;
}

export interface SongRequest {
  request_id: string;
  request_url: string;
  song: Song;
}

export interface StationStatus {
  online: boolean;
  bitrate: number;
  format: string;
  listeners: number;
}

export type StreamQuality = '64' | '128' | '320';

export interface PlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  quality: StreamQuality;
  isLive: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AudioMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  elapsed: number;
}
