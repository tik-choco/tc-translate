import type { ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { RubyToken } from './pinyinZhuyin'

const HAN = /\p{Script=Han}/u
const HOVER_CLOSE_DELAY_MS = 150
const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 6

type RubyTextProps = {
  tokens: RubyToken[]
  /** Popover content for a token containing Han characters; omit for plain ruby. */
  renderDetails?: (token: RubyToken) => ComponentChildren
}

type OpenState = { index: number; pinned: boolean }

let popoverSeq = 0

export function RubyText({ tokens, renderDetails }: RubyTextProps) {
  const [open, setOpen] = useState<OpenState | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const anchorRefs = useRef(new Map<number, HTMLElement>())
  const popoverRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [popoverId] = useState(() => `kanji-reading-popover-${++popoverSeq}`)

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!openRef.current?.pinned) setOpen(null)
    }, HOVER_CLOSE_DELAY_MS)
  }
  const show = (index: number, pinned: boolean) => {
    cancelClose()
    setOpen({ index, pinned })
  }

  // Tokens change whenever the input does; a stale index would point the
  // popover at the wrong character.
  useEffect(() => setOpen(null), [tokens])
  useEffect(() => cancelClose, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRefs.current.get(open.index)?.contains(target)) return
      setOpen(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    // The popover is fixed-positioned against the anchor's rect at open time,
    // so any scroll would leave it floating over the wrong spot.
    const onScroll = (event: Event) => {
      if (popoverRef.current?.contains(event.target as Node)) return
      setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  // Place above the character when there's room (the reading row sits above
  // the text, so this keeps the line itself readable), else below; clamp
  // horizontally so it never runs off a phone-width screen.
  useLayoutEffect(() => {
    const anchor = open ? anchorRefs.current.get(open.index) : undefined
    const popover = popoverRef.current
    if (!anchor || !popover) {
      setPosition(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const { width, height } = popover.getBoundingClientRect()
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft))
    const above = rect.top - height - ANCHOR_GAP
    const top = above >= VIEWPORT_MARGIN ? above : rect.bottom + ANCHOR_GAP
    setPosition({ left, top })
  }, [open])

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
    const interactive = renderDetails !== undefined && HAN.test(token.text)
    if (!token.reading && !interactive) {
      if (plain === '') plainKey = index
      plain += token.text
      return
    }
    flushPlain()
    const content = token.reading ? (
      <ruby>
        {token.text}
        <rt>{token.reading}</rt>
      </ruby>
    ) : (
      token.text
    )
    if (!interactive) {
      nodes.push(<span key={index}>{content}</span>)
      return
    }
    const active = open?.index === index
    nodes.push(
      <span
        key={index}
        ref={(el) => {
          if (el) anchorRefs.current.set(index, el)
          else anchorRefs.current.delete(index)
        }}
        class={`kanji-token ${active ? 'active' : ''}`}
        tabIndex={0}
        role="button"
        aria-expanded={active}
        aria-describedby={active ? popoverId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && !openRef.current?.pinned) show(index, false)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') scheduleClose()
        }}
        onClick={() => {
          if (openRef.current?.index === index && openRef.current.pinned) setOpen(null)
          else show(index, true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (openRef.current?.index === index) setOpen(null)
            else show(index, true)
          }
        }}
      >
        {content}
      </span>,
    )
  })
  flushPlain()

  const openToken = open ? tokens[open.index] : undefined

  return (
    <>
      <div class="kanji-ruby">{nodes}</div>
      {openToken && renderDetails
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="tooltip"
              class="kanji-reading-popover"
              style={position ? { left: `${position.left}px`, top: `${position.top}px` } : { visibility: 'hidden' }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') cancelClose()
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') scheduleClose()
              }}
            >
              {renderDetails(openToken)}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
