import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'

type MicOption = { deviceId: string; label: string }

// Enumerates audio inputs for the microphone picker. Device labels stay blank
// until the user has granted mic permission at least once, so the picker
// exposes a button that requests a throwaway stream to unlock them.
export function useMicrophones() {
  const [microphones, setMicrophones] = useState<MicOption[]>([])
  const [labelsHidden, setLabelsHidden] = useState(false)
  const enumerationSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices)

  async function refresh(): Promise<void> {
    if (!enumerationSupported) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter((device) => device.kind === 'audioinput' && device.deviceId)
      setMicrophones(
        inputs.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || t('voice-mic-fallback-label', { index: index + 1 }),
        })),
      )
      setLabelsHidden(inputs.length > 0 && inputs.every((device) => !device.label))
    } catch {
      // Enumeration failing just leaves the picker on "default".
    }
  }

  async function unlockLabels(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch {
      // Permission denied: keep whatever we have.
    }
    await refresh()
  }

  useEffect(() => {
    void refresh()
    const mediaDevices = enumerationSupported ? navigator.mediaDevices : undefined
    mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => mediaDevices?.removeEventListener?.('devicechange', refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { microphones, labelsHidden, enumerationSupported, unlockLabels }
}

