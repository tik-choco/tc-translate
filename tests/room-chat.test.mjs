// Run: node --experimental-test-module-mocks --test tests/room-chat.test.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { after, mock, test } from 'node:test'
import { createRoomConsumers, decode, encode, requestRoomChat, requestRoomOpenAi } from '@tik-choco/mistai'

// Node strips TypeScript; resolve the app's extensionless Vite imports.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})
const networkMock = mock.module(new URL('../src/lib/network.ts', import.meta.url).href, {
  namedExports: { requestNetworkChat: requestRoomChat, requestNetworkOpenAi: requestRoomOpenAi },
})
const { requestChatCompletion } = await import('../src/lib/llm.ts')
const { readImageText } = await import('../src/lib/api.ts')
after(() => { networkMock.restore(); hooks.deregister() })

const roomId = 'effort-test-room'
const model = 'test-model'
const messages = [{ role: 'user', content: 'Translate this text.' }]

function roomFixture(t) {
  const sent = []
  const received = Promise.withResolvers()
  const rooms = createRoomConsumers(() => {
    let onEvent
    const reply = message => onEvent(0, 'provider', encode({ v: 1, ...message }))
    return {
      async init() {},
      onEvent(callback) { onEvent = callback },
      joinRoom(joinedRoom) {
        assert.equal(joinedRoom, roomId)
        reply({ type: 'provider_hello', models: [model], services: ['chat', 'oai'] })
      },
      leaveRoom() {},
      sendMessage(_to, bytes) {
        const message = decode(bytes)
        assert.ok(message)
        sent.push(message)
        if (message.type === 'llm_request' || (message.type === 'oai_request' && message.last)) {
          received.resolve({ message, reply })
        }
      },
    }
  }, { requestTimeoutMs: 1000, providerWaitTimeoutMs: 1000 })
  t.after(() => rooms.disconnectRoom(roomId))
  return { sent, received: received.promise }
}

for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) {
  test(`room chat sends ${effort} on llm_request and streams before completion`, { timeout: 3000 }, async t => {
    const fixture = roomFixture(t)
    const progress = []
    let completed = false
    const result = requestChatCompletion({
      settings: { baseUrl: `mist-network://${roomId}`, model, reasoningEffort: effort },
      messages,
      onProgress: full => progress.push(full),
    }).then(text => { completed = true; return text })
    const { message, reply } = await fixture.received
    assert.equal(message.type, 'llm_request')
    assert.equal(message.model, model)
    assert.equal(message.reasoning_effort, effort)
    assert.deepEqual(message.messages, messages)
    assert.equal('temperature' in message, false)

    reply({ type: 'llm_response_chunk', id: message.id, seq: 0, delta: 'Hello' })
    assert.deepEqual(progress, ['Hello'])
    assert.equal(completed, false)
    reply({ type: 'llm_response_chunk', id: message.id, seq: 1, delta: ' world' })
    assert.deepEqual(progress, ['Hello', 'Hello world'])
    assert.equal(completed, false)
    reply({ type: 'llm_response_done', id: message.id, content: 'Hello world' })
    assert.equal(await result, 'Hello world')
    assert.equal(fixture.sent.some(message => message.type === 'oai_request'), false)
  })
}

test('room chat carries effort without a progress callback', { timeout: 3000 }, async t => {
  const fixture = roomFixture(t)
  const result = requestChatCompletion({
    settings: { baseUrl: `mist-network://${roomId}`, model, reasoningEffort: 'high' }, messages,
  })
  const { message, reply } = await fixture.received
  assert.equal(message.type, 'llm_request')
  assert.equal(message.reasoning_effort, 'high')
  reply({ type: 'llm_response_done', id: message.id, content: 'Hello' })
  assert.equal(await result, 'Hello')
})

test('room vision/OCR keeps image parts and effort in the OpenAI tunnel', { timeout: 3000 }, async t => {
  const fixture = roomFixture(t)
  const imageUrl = 'data:image/png;base64,dGVzdA=='
  const deltas = []
  const result = readImageText({
    settings: {
      visionTarget: { baseUrl: `mist-network://${roomId}`, model },
      reasoningEffort: 'low', visionReasoningEffort: 'high',
    },
    image: { dataUrl: imageUrl },
    onDelta: delta => deltas.push(delta),
  })
  const { message, reply } = await fixture.received
  assert.equal(message.type, 'oai_request')
  assert.equal(message.path, '/chat/completions')
  assert.equal(message.method, 'POST')
  const parts = fixture.sent.filter(part => part.type === 'oai_request').sort((a, b) => a.seq - b.seq)
  const body = JSON.parse(Buffer.from(parts.map(part => part.data).join(''), 'base64').toString('utf8'))
  assert.equal(body.model, model)
  assert.equal(body.reasoning_effort, 'high')
  assert.equal('temperature' in body, false)
  assert.equal(body.messages[1].content[1].type, 'image_url')
  assert.equal(body.messages[1].content[1].image_url.url, imageUrl)
  assert.equal(fixture.sent.some(message => message.type === 'llm_request'), false)
  reply({
    type: 'oai_response', id: message.id, seq: 0, last: true, status: 200,
    contentType: 'application/json',
    data: Buffer.from(JSON.stringify({ choices: [{ message: { content: 'Read text' } }] })).toString('base64'),
  })
  assert.equal(await result, 'Read text')
  assert.deepEqual(deltas, ['Read text'])
})

test('HTTP chat keeps reasoning_effort and omits temperature', async t => {
  let body
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  })
  assert.equal(await requestChatCompletion({
    settings: { baseUrl: 'https://example.test/v1', apiKey: '', model, reasoningEffort: 'none' }, messages,
  }), 'Hello')
  assert.equal(body.reasoning_effort, 'none')
  assert.equal('temperature' in body, false)
})
