import { useEffect, useState } from 'preact/hooks'
import { roomConsumer, type ConsumerStatus } from '../lib/network'
export function useNetworkConsumerStatusWithTimestamp(roomId: string) {
  const [status, setStatus] = useState<ConsumerStatus>({ phase: 'idle' })
  const [updatedAt, setUpdatedAt] = useState(Date.now())
  useEffect(() => {
    if (!roomId) { setStatus({ phase: 'idle' }); return }
    const client = roomConsumer(roomId)
    setStatus(client.status)
    return client.onStatusChange(next => { setStatus(next); setUpdatedAt(Date.now()) })
  }, [roomId])
  return { status, updatedAt }
}
