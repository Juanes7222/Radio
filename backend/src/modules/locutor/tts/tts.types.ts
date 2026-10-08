export type TtsProviderId = "elevenlabs" | "kokoro";

export interface TtsSynthesisRequest {
  text: string;
  /**
   * Voice selected in the announcement template. It is a provider-neutral
   * label, not a provider id: each provider maps it to whatever it calls its
   * own voices.
   */
  templateVoice: string;
  speed: number;
}

export interface TtsProviderOutput {
  audio: Buffer;
  /**
   * The voice that actually produced the audio, qualified with the provider
   * (`elevenlabs:abc123`, `kokoro:ef_dora`) so the audio bank records where
   * the file came from and not only what the template asked for.
   */
  voice: string;
}

export interface TtsProvider {
  readonly id: TtsProviderId;
  /**
   * Whether this provider could serve the request right now, without spending
   * a request on finding out. A null `templateVoice` means "no specific
   * template": the answer is whether the provider is usable at all, which is
   * what the status endpoint reports.
   */
  isAvailable(templateVoice: string | null): boolean;
  synthesize(request: TtsSynthesisRequest): Promise<TtsProviderOutput>;
}

/**
 * A provider failed in a way that will repeat for every key, so trying the
 * next one is pointless: the text is too long for the model, or the
 * configured voice does not exist. Distinct from a network failure, which is
 * worth retrying on another key.
 */
export class TtsProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsProviderConfigError";
  }
}
