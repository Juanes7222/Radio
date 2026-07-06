import 'dotenv/config';

function required(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Env ${key} is not defined`);
    return val;
}

export const config = {
    port: parseInt(process.env.PORT ?? '3001', 10),
    azuracast: {
        url: (() => {
            const u = required('AZURACAST_URL').replace(/\/$/, '');
            return /^https?:\/\//i.test(u) ? u : `https://${u}`;
        })(),
        get baseUrl() { return this.url; },
        get publicUrl() {
            const env = process.env.AZURACAST_PUBLIC_URL;
            const u = (env ? env : this.url).replace(/\/$/, '');
            return /^https?:\/\//i.test(u) ? u : `https://${u}`;
        },
        apiKey:    required('AZURACAST_API_KEY'),
        stationId: required('AZURACAST_STATION_ID'),
        playlistId: process.env.AZURACAST_PLAYLIST_ID ?? "",
        newsPlaylistId: process.env.AZURACAST_NEWS_PLAYLIST_ID ?? "",
        newsFolderPath: process.env.AZURACAST_NEWS_FOLDER_PATH ?? "/var/azuracast/stations/1/media/NOTICIAS",
    },
    locutor: {
        kokoroUrl: process.env.KOKORO_URL || 'http://localhost:8880',
        mediaDir: process.env.MEDIA_DIR || '/var/azuracast/stations/1/media/locutores',
        timezone: process.env.TIMEZONE || 'America/Bogota',
        stationName: process.env.STATION_NAME || 'Radio',
        harborHost: process.env.LIQUIDSOAP_HARBOR_HOST || 'localhost',
        harborPort: parseInt(process.env.LIQUIDSOAP_HARBOR_PORT || '8005', 10),
        mountPoint: process.env.LIQUIDSOAP_MOUNT_POINT || '/live',
        streamerUser: process.env.LOCUTOR_STREAMER_USER || '',
        streamerPassword: process.env.LOCUTOR_STREAMER_PASSWORD || '',
    },
    google: {
        clientId: required('GOOGLE_CLIENT_ID'),
    },
    jwt: {
        secret:    required('JWT_SECRET'),
        expiresIn: '24h' as const,
    },
    whitelist: (process.env.ADMIN_WHITELIST ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean),
    publicUrl:   (required('PUBLIC_URL')).replace(/\/$/, ''),
    panelSecret: required('PANEL_SECRET'),
    youtube: {
        channelIds: (process.env.YOUTUBE_CHANNEL_IDS ?? "").split(",").filter(Boolean),
        noticeChanelIds: (process.env.YOUTUBE_CHANNEL_NOTICES ?? "").split(",").filter(Boolean),
    },
    worker: {
        authSecret: required('WORKER_AUTH_SECRET'),
        port: parseInt(process.env.WS_PORT ?? '3001', 10),
    },
    jobDispatchIntervalMs: parseInt(process.env.JOB_DISPATCH_INTERVAL_MS ?? '2000', 10),
    workerHeartbeatTimeoutMs: parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT_MS ?? '60000', 10),
    processing: {
        maxDurationSeconds: parseInt(process.env.MAX_VIDEO_DURATION_SECONDS ?? "600", 10),
        maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS ?? "3", 10),
        jobDeadlineHours: parseInt(process.env.JOB_DEADLINE_HOURS ?? "48", 10),
        tempDir: process.env.TEMP_DOWNLOAD_DIR ?? "/tmp/yt-downloads",
    },
    email: {
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASSWORD ?? '',
        apiKey: process.env.BREVO_API_KEY ?? '',
        emails: (process.env.EMAIL_RECIPIENTS ?? '').split(',').map(e => e.trim()).filter(Boolean)
    },
    prayer: {
        recipients: (process.env.PRAYER_EMAIL_RECIPIENTS ?? '')
            .split(',')
            .map(e => e.trim())
            .filter(Boolean),
    },
};
