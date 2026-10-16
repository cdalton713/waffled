import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DataIcon } from '@/components/ui/data-icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  if (options.length === 0) return null
  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((value) => value !== option)
        : [...selected, option],
    )
  const text = selected.length === 0 ? label : label + ' · ' + selected.length
  return (
    <div className="ms-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="unstyled"
            type="button"
            className={'recipes-filter ' + (selected.length ? 'on' : '')}
          >
            {text}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="ms-menu"
          align="start"
          aria-label={label}
          style={{ position: 'relative', left: 'auto', top: 'auto' }}
        >
          {options.map((option) => {
            const on = selected.includes(option)
            return (
              <Button
                variant="unstyled"
                key={option}
                type="button"
                className="ms-opt"
                aria-pressed={on}
                onClick={() => toggle(option)}
              >
                <span className={'ms-ck ' + (on ? 'on' : '')}>{on && <DataIcon value="✓" />}</span>
                <span className="ms-opt-t">{option}</span>
              </Button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
