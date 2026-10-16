import { useState, type ComponentProps } from 'react'
import { Button } from './button'
import { DataIcon } from './data-icon'
import { IconValue } from './icon-value'
import { SYMBOL_OPTIONS, type SymbolKind } from './icon-symbols'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Input } from './input'
import { cn } from '@/lib/utils'
import { useFieldLabel } from './label-context'

export function IconPicker({
  value,
  onValueChange,
  kind = 'general',
  allowText = false,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'value' | 'onChange'> & {
  value?: string | null
  onValueChange: (value: string) => void
  kind?: SymbolKind
  allowText?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [text, setText] = useState(value ?? '')
  const label = useFieldLabel()
  const options = SYMBOL_OPTIONS.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  function choose(next: string) {
    onValueChange(next)
    setOpen(false)
    setQuery('')
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setText(value ?? '')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="unstyled"
          type="button"
          data-slot="icon-picker"
          aria-label={label?.text ?? 'Select icon'}
          className={cn(
            'inline-flex items-center justify-center rounded-(--r-sm) border border-input bg-(--card-2) px-[12px] py-[9px] [font:inherit] text-foreground cursor-pointer',
            className,
          )}
          {...props}
        >
          <>
            {allowText && value ? (
              <IconValue value={value} kind={kind} />
            ) : (
              <DataIcon value={value} kind={kind} />
            )}
          </>
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Choose an icon" className="w-[280px] max-w-[calc(100vw-24px)]">
        {allowText && (
          <div className="mb-[8px] flex gap-[8px]">
            <Input
              aria-label="Text symbol"
              placeholder="XP, $, £"
              maxLength={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  choose(text.trim())
                }
              }}
              className="min-w-0 flex-1 rounded-(--r-xs) border border-input bg-(--card-2) p-[8px] [font:inherit] text-foreground"
            />
            <Button variant="secondary" type="button" onClick={() => choose(text.trim())}>
              Use text
            </Button>
          </div>
        )}
        <Input
          aria-label="Find an icon"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an icon…"
          className="mb-[8px] box-border w-full rounded-(--r-xs) border border-input bg-(--card-2) p-[8px] [font:inherit] text-foreground"
        />
        <div className="grid max-h-[240px] grid-cols-5 gap-[4px] overflow-y-auto">
          {options.map((option) => (
            <Button
              key={option.value}
              variant="unstyled"
              type="button"
              aria-label={option.label}
              aria-pressed={value === option.value}
              title={option.label}
              className="grid size-[46px] place-items-center rounded-(--r-xs) border-0 bg-transparent text-foreground hover:bg-secondary aria-pressed:bg-primary aria-pressed:text-primary-foreground cursor-pointer"
              onClick={() => choose(option.value)}
            >
              <option.icon size={22} />
            </Button>
          ))}
        </div>
        {options.length === 0 && (
          <div role="status" className="p-[8px] text-muted-foreground">
            No matching icons
          </div>
        )}
        <Button
          variant="unstyled"
          type="button"
          className="mt-[8px] w-full rounded-(--r-xs) border-0 bg-secondary p-[8px] [font:inherit] text-foreground cursor-pointer"
          onClick={() => choose('')}
        >
          Use default icon
        </Button>
      </PopoverContent>
    </Popover>
  )
}
