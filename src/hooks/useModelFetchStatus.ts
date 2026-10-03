import { useEffect, useState } from 'preact/hooks'
import { subscribeModelFetchStatus } from '../lib/providerModels'

export function useModelFetchStatus() {
  const [, update] = useState(0)
  useEffect(() => subscribeModelFetchStatus(() => update(n => n + 1)), [])
}
