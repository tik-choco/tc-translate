# TC Translate

Preact + Vite + TypeScript translation app using an OpenAI-compatible Chat
Completions API. Modern, fully internationalized UI with a light/dark theme
(toggle in the top bar; the choice is remembered).

## Development

```sh
npm install
npm run dev
```

## Usage

Choose a target language, paste text, then translate. `Ctrl + Enter` also
starts translation. Use the image button or paste an image into the input to
read visible text with a vision model and translate it. The app generates
multiple tone variants in one request. Use Back-translate in the output pane to
translate results back into the source language and check for meaning drift.

## Settings

Configure:

- Base URL, for example `https://api.openai.com/v1`
- API key, optional for local LLMs
- Model
- Vision model, used when translating from images

The app automatically loads model IDs from `GET /models`. If the provider does
not support `/models`, fallback model choices are shown.

Settings are saved in browser localStorage.

## Interoperability with TC Storage

When deployed alongside the other tik-choco apps on the same origin, each
finished translation is published on the shared cross-app bus
(`translations-inbox` topic, `src/lib/sharedBus.ts` +
`src/lib/shareToStorage.ts`). TC Storage picks these up and shows them as
Markdown files in a "TC Translate" folder — no server, no manual export. See
`protocol/docs/data-contracts/docs/SHARED_BUS.md` for the contract.
