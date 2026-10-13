import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { groceryApi } from '../../lib/api'

const DEBOUNCE_MS = 150

// An add-bar input with a suggestion dropdown (ARIA combobox). Picking a suggestion —
// tap, or arrows + Enter — calls onPick; Enter with nothing highlighted still submits
// the surrounding form, so free text keeps working. Without `suggest` it's a plain input.
export function ItemAutocomplete({ value, onChange, onPick, suggest, className, ref, ...inputProps }: {
  ref?: Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  onPick: (name: string) => void
  suggest?: (query: string) => Promise<string[]>
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'role'>) {
  const [results, setResults] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const latest = useRef(0)

  useEffect(() => {
    const q = value.trim()
    const req = ++latest.current
    if (!suggest || !q) { setResults([]); return }
    const timer = setTimeout(() => {
      suggest(q)
        .then((names) => { if (req === latest.current) { setResults(names); setActive(-1) } })
        .catch(() => { if (req === latest.current) setResults([]) })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, suggest])

  const shown = open && results.length > 0

  function pick(name: string) {
    setOpen(false)
    setResults([])
    setActive(-1)
    onPick(name)
  }

  return (
    <span className={`item-ac ${className ?? ''}`}>
      <input
        {...inputProps}
        ref={ref}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={(e) => { setOpen(true); inputProps.onFocus?.(e) }}
        onBlur={(e) => { setOpen(false); inputProps.onBlur?.(e) }}
        onKeyDown={(e) => {
          inputProps.onKeyDown?.(e)
          if (e.key === 'ArrowDown' && results.length) {
            e.preventDefault()
            setActive(shown ? Math.min(active + 1, results.length - 1) : 0)
            setOpen(true)
          } else if (e.key === 'ArrowUp' && shown) {
            e.preventDefault()
            setActive(Math.max(active - 1, -1))
          } else if (e.key === 'Escape' && shown) {
            e.preventDefault()
            setOpen(false)
            setActive(-1)
          } else if (e.key === 'Enter' && shown && active >= 0) {
            e.preventDefault()
            pick(results[active])
          }
        }}
      />
      {shown && (
        <ul className="item-ac-menu" role="listbox" id={listId}>
          {results.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              // mousedown, not click: it fires before the input's blur closes the menu.
              onMouseDown={(e) => { e.preventDefault(); pick(name) }}
              onMouseEnter={() => setActive(i)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

// Names the household has used before, then a common-grocery catalog, for one list.
export function useItemSuggest(listId: string | null | undefined): ((query: string) => Promise<string[]>) | undefined {
  const suggest = useCallback(
    (q: string) => groceryApi.suggestions(q, listId ?? null).then((list) => list.map((s) => s.name)),
    [listId],
  )
  return listId ? suggest : undefined
}
