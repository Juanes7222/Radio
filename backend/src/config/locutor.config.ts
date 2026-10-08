import {
  envOr,
  floatEnvOr,
  intEnvOr,
  keyValueEnvOr,
  listEnvOr,
} from "./env";

const DEFAULT_KOKORO_VOICE = "ef_dora";

export const locutorConfig = {
  kokoroUrl: envOr("KOKORO_URL", "http://localhost:8880"),
  mediaDir: envOr(
    "MEDIA_DIR",
    "/var/azuracast/stations/1/media/locutores"
  ),
  timezone: envOr("TIMEZONE", "America/Bogota"),
  stationName: envOr("STATION_NAME", "Radio"),
  harborHost: envOr("LIQUIDSOAP_HARBOR_HOST", "localhost"),
  harborPort: intEnvOr("LIQUIDSOAP_HARBOR_PORT", 8005),
  mountPoint: envOr("LIQUIDSOAP_MOUNT_POINT", "/live"),
  streamerUser: envOr("LOCUTOR_STREAMER_USER", ""),
  streamerPassword: envOr("LOCUTOR_STREAMER_PASSWORD", ""),
  bedsDir: envOr("LOCUTOR_BEDS_DIR", "../packages/assets/audio"),
  bedVolume: floatEnvOr("LOCUTOR_BED_VOLUME", 0.15),
  announcementsPerHour: intEnvOr("LOCUTOR_ANNOUNCEMENTS_PER_HOUR", 2),
  minAnnouncementGapMinutes: intEnvOr("LOCUTOR_ANNOUNCEMENT_MIN_GAP_MINUTES", 20),

  /**
   * Voice engine. Order is fixed: the external provider first, Kokoro as the
   * fallback. Both providers return the same MP3, so nothing downstream of
   * `synthesize` knows which one answered.
   */
  tts: {
    defaultVoice: envOr("LOCUTOR_DEFAULT_VOICE", DEFAULT_KOKORO_VOICE),
    defaultSpeed: floatEnvOr("LOCUTOR_DEFAULT_SPEED", 0.85),
    requestTimeoutMs: intEnvOr("TTS_REQUEST_TIMEOUT_MS", 60_000),
    maxTextLength: intEnvOr("TTS_MAX_TEXT_LENGTH", 4000),
    elevenLabs: {
      baseUrl: envOr("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io").replace(
        /\/$/,
        ""
      ),
      /**
       * Comma-separated pool. Empty means the provider is not configured at
       * all and every synthesis goes straight to Kokoro, which is the
       * behaviour of a station that never set a key.
       */
      apiKeys: listEnvOr("ELEVENLABS_API_KEYS"),
      modelId: envOr("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
      /** Maps an announcement template voice to an ElevenLabs voice id. */
      voiceIdByTemplateVoice: keyValueEnvOr("ELEVENLABS_VOICE_IDS"),
      /** Used when the template voice has no explicit mapping. */
      defaultVoiceId: envOr("ELEVENLABS_DEFAULT_VOICE_ID", ""),
      outputFormat: envOr("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"),
      stability: floatEnvOr("ELEVENLABS_STABILITY", 0.5),
      similarityBoost: floatEnvOr("ELEVENLABS_SIMILARITY_BOOST", 0.75),
      /**
       * Cooldown applied when quota is gone. The real reset moment comes from
       * the subscription endpoint; this is the fallback when that call fails,
       * and it is deliberately short so a monthly reset is never missed by days.
       */
      quotaCooldownMinutes: intEnvOr("ELEVENLABS_QUOTA_COOLDOWN_MINUTES", 360),
      /**
       * Cooldown for a key that failed for a reason that says nothing about
       * its quota (429 concurrency, 5xx, network). Short on purpose: the next
       * announcement should not be stuck without a good voice for an hour
       * because of one timeout.
       */
      transientCooldownMinutes: intEnvOr("ELEVENLABS_TRANSIENT_COOLDOWN_MINUTES", 2),
      subscriptionCacheMinutes: intEnvOr("ELEVENLABS_SUBSCRIPTION_CACHE_MINUTES", 15),
    },
  },
};
