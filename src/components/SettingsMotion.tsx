import type { ComponentChildren, RefObject } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export function motionOptions(element: HTMLElement, fast = false) {
  const style = getComputedStyle(element)
  return { duration: reducedMotion() ? 0 : parseFloat(style.getPropertyValue(fast ? '--motion-fast' : '--motion-base')), easing: style.getPropertyValue('--ease-out').trim() }
}

// Presence keeps closing content alive, and cancellation samples the current frame
// so reversing a disclosure never jumps or leaves an explicit height behind.
export function AnimatedDisclosure({ open, children }: { open: boolean; children: ComponentChildren }) {
  const [present, setPresent] = useState(open)
  const shell = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    if (open && !present) { setPresent(true); return }
    const element = shell.current
    if (!element) { first.current = false; return }
    const from = animation.current ? element.getBoundingClientRect().height : open ? 0 : element.getBoundingClientRect().height
    const opacity = animation.current ? getComputedStyle(element).opacity : open ? '0' : '1'
    animation.current?.cancel()
    if (reducedMotion() || first.current) {
      first.current = false
      animation.current = null
      element.style.overflow = ''
      if (!open) setPresent(false)
      return
    }
    element.style.overflow = 'hidden'
    const next = element.animate([{ height: `${from}px`, opacity }, { height: `${open ? element.scrollHeight : 0}px`, opacity: open ? 1 : 0 }], motionOptions(element))
    animation.current = next
    next.onfinish = () => {
      animation.current = null
      element.style.overflow = ''
      if (!open) setPresent(false)
    }
  }, [open, present])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => { animation.current?.finish() }
    media.addEventListener('change', stop)
    return () => { media.removeEventListener('change', stop); animation.current?.cancel() }
  }, [])
  return present ? <div ref={shell} class="settings-disclosure" inert={!open}>{children}</div> : null
}

export function usePopoverMotion(open: boolean, menu: RefObject<HTMLDivElement>) {
  const [present, setPresent] = useState(open)
  useLayoutEffect(() => { if (open) setPresent(true) }, [open])
  useEffect(() => {
    const element = menu.current
    if (!element || !present) return
    if (reducedMotion()) { if (!open) setPresent(false); return }
    const up = element.dataset.placement === 'up'
    const animation = element.animate(open ? [
      { opacity: 0, translate: `0 ${up ? '-4px' : '4px'}`, scale: .98 },
      { opacity: 1, translate: '0 0', scale: 1 },
    ] : [{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], motionOptions(element, !open))
    const finish = () => { if (!open) setPresent(false) }
    animation.onfinish = finish
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => { animation.finish() }
    media.addEventListener('change', stop)
    return () => { media.removeEventListener('change', stop); animation.cancel() }
  }, [open, present])
  return present
}

export function useAnimatedItems<T extends { id: string }>(items: T[]) {
  const [rows, setRows] = useState(() => items.map(item => ({ item, phase: '' })))
  useLayoutEffect(() => {
    setRows(previous => [
      ...items.map(item => ({ item, phase: previous.find(row => row.item.id === item.id)?.phase === 'leaving' ? 'entering' : previous.find(row => row.item.id === item.id)?.phase ?? 'entering' })),
      ...previous.filter(row => !items.some(item => item.id === row.item.id)).map(row => ({ ...row, phase: 'leaving' })),
    ])
    const timer = setTimeout(() => setRows(previous => previous.filter(row => items.some(item => item.id === row.item.id)).map(row => ({ ...row, phase: '' }))), reducedMotion() ? 0 : 200)
    return () => clearTimeout(timer)
  }, [JSON.stringify(items)])
  return rows
}
