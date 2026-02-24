// Tipos para el panel de administración

export interface AdminUser {
  apiKey: string;
  stationId: string;
  stationName?: string;
}

export interface StationStatus {
  id: number;
  name: string;
  shortcode: string;
  is_public: boolean;
  storage_quota: string;
  storage_used: string;
  is_online: boolean;
  listeners_unique: number;
  listeners_total: number;
}

export interface AdminPlaylist {
  id: number;
  name: string;
  type: string;
  source: string;
  order: string;
  remote_url: string | null;
  status: string;
  is_enabled: boolean;
  is_jingle: boolean;
  play_per_songs: number;
  play_per_minutes: number;
  play_per_hour_minute: number;
  weight: number;
  include_in_requests: boolean;
  include_in_on_demand: boolean;
  num_songs: number;
  total_length: number;
  links: { self: string };
}

export interface MediaFile {
  unique_id: string;
  song_id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  length: number;
  length_text: string;
  custom_fields: Record<string, string>;
  playlists: { id: number; name: string }[];
  links: { self: string; art: string; download: string };
}

export interface SongRequest {
  id: string;
  song: {
    id: string;
    text: string;
    artist: string;
    title: string;
    album: string;
    art: string;
  };
  timestamp: number;
  skip_delay: boolean;
  played_at: number | null;
}

export interface Streamer {
  id: number;
  streamer_username: string;
  streamer_password: string;
  display_name: string;
  comments: string;
  is_active: boolean;
  enforce_schedule: boolean;
  reactivate_at: number | null;
  art_updated_at: number;
  links: { self: string; art: string };
}

export interface ScheduleItem {
  id: number;
  start_timestamp: number;
  start: string;
  end_timestamp: number;
  end: string;
  is_now: boolean;
  type: 'playlist' | 'streamer';
  title: string;
}

export interface ListenerStats {
  total: number;
  unique: number;
  current: number;
}

export interface ListenerDetail {
  ip: string;
  user_agent: string;
  connected_on: number;
  connected_time: number;
  mount_name: string;
  location: {
    city: string;
    country: string;
    lat: number | null;
    lon: number | null;
  };
}
