// Thin storage-only path into the vendored mistlib wasm module, used to move
// heavy per-item content (translation history bodies, shared translations-
// inbox Markdown) out of localStorage and into mistlib's OPFS-backed,
// content-addressed store. storage_add/storage_get only need the wasm node
// initialized, not a joined room, but the underlying wasm module supports
// exactly one active node per page (see mistNodeShared.ts), so init is routed
// through that shared guard rather than calling `init_with_config` directly -
// doing so bypassed the guard entirely and silently re-initialized (and thus
// reset the identity/config of) whichever node the LLM Network consumer/
// provider stacks had already brought up, an intermittent-freeze bug
// (verified via a direct repro: two independent `init_with_config` calls on
// the same wasm singleton each fully reset the engine with no error/warning).

import { storage_add, storage_get } from '../vendor/mistlib/wrappers/web/index.js'
import { ensureSharedMistNodeReady } from './mistNodeShared'
import { NODE_ID_STORAGE_KEY } from './network'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

let initPromise: Promise<void> | null = null

function loadOrCreateNodeId(): string {
  try {
    const stored = localStorage.getItem(NODE_ID_STORAGE_KEY)
    if (stored) return stored
  } catch {
    // localStorage unavailable; fall through to an in-memory id.
  }
  const nodeId = `node-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
  try {
    localStorage.setItem(NODE_ID_STORAGE_KEY, nodeId)
  } catch {
    // Best-effort persistence; an in-memory id still works for this session.
  }
  return nodeId
}

async function ensureStorageNodeInit(): Promise<void> {
  if (!initPromise) {
    initPromise = ensureSharedMistNodeReady(loadOrCreateNodeId()).catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

/** Stores raw bytes under `name` and returns the resulting content-address (CID). */
export async function storageAdd(name: string, data: Uint8Array): Promise<string> {
  await ensureStorageNodeInit()
  return storage_add(name, data)
}

/** Fetches previously-stored bytes for `cid`. Throws if the data isn't available. */
export async function storageGet(cid: string): Promise<Uint8Array> {
  await ensureStorageNodeInit()
  return storage_get(cid)
}

/** Stores `value` as JSON and returns the resulting CID. */
export async function storageAddJson(name: string, value: unknown): Promise<string> {
  return storageAdd(name, textEncoder.encode(JSON.stringify(value)))
}

/** Fetches and JSON-parses the bytes stored at `cid`. */
export async function storageGetJson<T>(cid: string): Promise<T> {
  const bytes = await storageGet(cid)
  return JSON.parse(textDecoder.decode(bytes)) as T
}

/** Stores `text` as UTF-8 bytes and returns the resulting CID. */
export async function storageAddText(name: string, text: string): Promise<string> {
  return storageAdd(name, textEncoder.encode(text))
}

/** Fetches and UTF-8-decodes the bytes stored at `cid`. */
export async function storageGetText(cid: string): Promise<string> {
  const bytes = await storageGet(cid)
  return textDecoder.decode(bytes)
}
