import type { ComponentChildren } from 'preact'
import type { RubyToken } from './pinyinZhuyin'

type RubyTextProps = {
  tokens: RubyToken[]
}

export function RubyText({ tokens }: RubyTextProps) {
  if (tokens.length === 0) {
    return <div class="kanji-ruby kanji-ruby-empty" />
  }
  const nodes: ComponentChildren[] = []
  let plain = ''
  let plainKey = -1
  const flushPlain = () => {
    if (plain === '') return
    nodes.push(<span key={plainKey}>{plain}</span>)
    plain = ''
  }
  tokens.forEach((token, index) => {
    if (token.reading) {
      flushPlain()
      nodes.push(
        <ruby key={index}>
          {token.text}
          <rt>{token.reading}</rt>
        </ruby>,
      )
    } else {
      if (plain === '') plainKey = index
      plain += token.text
    }
  })
  flushPlain()
  return <div class="kanji-ruby">{nodes}</div>
}
