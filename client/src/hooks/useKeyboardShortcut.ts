import { useEffect, useRef } from 'react'

interface ShortcutOptions {
  /** Require Cmd/Ctrl to be held */
  meta?: boolean
  /** Require Alt/Option */
  alt?: boolean
  /** Require Shift */
  shift?: boolean
  /** Disable when user is focused on an input/textarea/select */
  ignoreInputs?: boolean
}

/**
 * Register a keyboard shortcut. The handler fires when the key + modifiers match.
 * Automatically removed on unmount.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: ShortcutOptions = {},
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const { meta = false, alt = false, shift = false, ignoreInputs = true } = options

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ignoreInputs) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if ((e.target as HTMLElement)?.isContentEditable) return
      }
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      if (meta !== (e.metaKey || e.ctrlKey)) return
      if (alt !== e.altKey) return
      if (shift !== e.shiftKey) return
      handlerRef.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, meta, alt, shift, ignoreInputs])
}

export interface Shortcut {
  keys: string[]
  description: string
  group: string
}

export const APP_SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], description: 'Open command palette', group: 'Navigation' },
  { keys: ['G', 'D'], description: 'Go to Dashboard', group: 'Navigation' },
  { keys: ['G', 'Q'], description: 'Go to All Quotes', group: 'Navigation' },
  { keys: ['G', 'B'], description: 'Go to Bulk Costing', group: 'Navigation' },
  { keys: ['G', 'A'], description: 'Go to Assemblies', group: 'Navigation' },
  { keys: ['G', 'S'], description: 'Go to Supplier Map', group: 'Navigation' },
  { keys: ['N'], description: 'New Quote', group: 'Actions' },
  { keys: ['?'], description: 'Show this help', group: 'Help' },
  { keys: ['Esc'], description: 'Close modal / go back', group: 'Help' },
]
