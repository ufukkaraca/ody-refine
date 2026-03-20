/**
 * STTProvider - interface for speech-to-text transcription
 * Implementations: ElevenLabs, Deepgram, Fake
 */
export interface STTProvider {
  /**
   * Transcribe audio to text
   * @param audio - audio data as Buffer or base64 string
   * @param mimeType - audio MIME type (e.g., 'audio/webm', 'audio/wav')
   */
  transcribe(audio: Buffer | string, mimeType: string): Promise<string>;
}

/**
 * TTSProvider - interface for text-to-speech synthesis
 * Implementations: ElevenLabs, Fake
 */
export interface TTSProvider {
  /**
   * Synthesize text to audio
   * @param text - text to convert to speech
   * @returns audio data as Buffer
   */
  synthesize(text: string): Promise<Buffer>;

  /**
   * Get the MIME type of audio produced
   */
  getAudioMimeType(): string;
}

/**
 * Clock - interface for getting current time (for deterministic tests)
 */
export interface Clock {
  now(): Date;
}

/**
 * IdGenerator - interface for generating unique IDs (for deterministic tests)
 */
export interface IdGenerator {
  generate(): string;
}
