import * as lamejs from '@breezystack/lamejs'

// Some OpenAI-compatible TTS servers ignore `response_format: 'mp3'` and
// return WAV. For downloads we normalize to MP3 here, in the browser, so the
// saved file matches what the user asked for regardless of the provider.
// Sniffs the actual bytes (Content-Type is not trusted); anything that is
// neither MP3 nor decodable audio falls back to the original blob unchanged.

const MP3_BITRATE_KBPS = 128
const ENCODER_BLOCK_SIZE = 1152

type SniffedFormat = 'mp3' | 'other'

function sniffFormat(bytes: Uint8Array): SniffedFormat {
  // ID3 tag ("ID3") or an MPEG frame sync (11 set bits) both mean MP3 already.
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3'
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3'
  return 'other'
}

function floatTo16BitPcm(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return output
}

async function decodePcm(buffer: ArrayBuffer): Promise<{ left: Int16Array; right: Int16Array | null; sampleRate: number }> {
  const AudioContextCtor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('AudioContext is unavailable')
  const context = new AudioContextCtor()
  try {
    const decoded = await context.decodeAudioData(buffer)
    const left = floatTo16BitPcm(decoded.getChannelData(0))
    const right = decoded.numberOfChannels > 1 ? floatTo16BitPcm(decoded.getChannelData(1)) : null
    return { left, right, sampleRate: decoded.sampleRate }
  } finally {
    void context.close().catch(() => undefined)
  }
}

function encodeMp3(left: Int16Array, right: Int16Array | null, sampleRate: number): Blob {
  const channels = right ? 2 : 1
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < left.length; i += ENCODER_BLOCK_SIZE) {
    const leftChunk = left.subarray(i, i + ENCODER_BLOCK_SIZE)
    const rightChunk = right ? right.subarray(i, i + ENCODER_BLOCK_SIZE) : undefined
    const encoded = right ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk)
    if (encoded.length) chunks.push(new Uint8Array(encoded))
  }
  const flushed = encoder.flush()
  if (flushed.length) chunks.push(new Uint8Array(flushed))
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
}

/**
 * Returns an MP3 blob for the given TTS audio: pass-through (with a corrected
 * MIME type) when the bytes are already MP3, transcoded via lamejs otherwise.
 * Never throws - if decoding/encoding fails the original blob is returned so
 * the download still happens in the provider's native format.
 */
export async function ensureMp3Blob(blob: Blob): Promise<Blob> {
  try {
    const buffer = await blob.arrayBuffer()
    if (sniffFormat(new Uint8Array(buffer)) === 'mp3') {
      return blob.type === 'audio/mpeg' ? blob : new Blob([buffer], { type: 'audio/mpeg' })
    }
    const { left, right, sampleRate } = await decodePcm(buffer)
    return encodeMp3(left, right, sampleRate)
  } catch (error) {
    console.warn('MP3 conversion failed; downloading the original audio as-is.', error)
    return blob
  }
}
