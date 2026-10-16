import {
  Children,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { useFieldLabel } from './label-context'

interface Option {
  value: string
  label: ReactNode
  text: string
  disabled: boolean
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children)
  return ''
}

function optionsFrom(children: ReactNode, groupDisabled = false): Option[] {
  const result: Option[] = []
  Children.forEach(children, (node) => {
    if (
      !isValidElement<{
        children?: ReactNode
        value?: string | number
        disabled?: boolean
        label?: string
      }>(node)
    )
      return
    if (node.type === 'option')
      result.push({
        value: String(node.props.value ?? text(node.props.children)),
        label: node.props.children,
        text: node.props.label ?? text(node.props.children),
        disabled: groupDisabled || !!node.props.disabled,
      })
    else result.push(...optionsFrom(node.props.children, groupDisabled || !!node.props.disabled))
  })
  return result
}

export function SelectField({
  children,
  value,
  defaultValue,
  onValueChange,
  className,
  style,
  id,
  name,
  disabled,
  required,
  autoFocus,
  onInvalid,
  ...props
}: Omit<ComponentProps<'select'>, 'ref' | 'multiple' | 'onChange' | 'value' | 'defaultValue'> & {
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
}) {
  const label = useFieldLabel()
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const register = label?.register
  useLayoutEffect(() => {
    register?.(triggerId)
    return () => register?.(undefined)
  }, [register, triggerId])
  const options = optionsFrom(children)
  const [localValue, setLocalValue] = useState(String(defaultValue ?? options[0]?.value ?? ''))
  const [invalid, setInvalid] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = String(value ?? localValue)
  const index = options.findIndex((option) => option.value === selected)
  const attrs = Object.fromEntries(
    Object.entries(props).filter(
      ([key]) => key.startsWith('aria-') || key === 'title' || key === 'data-testid',
    ),
  )
  const nativeAttrs = Object.fromEntries(
    Object.entries(props).filter(([key]) => !key.startsWith('aria-') && key !== 'data-testid'),
  )
  function change(next: string) {
    setLocalValue(next)
    setInvalid(false)
    onValueChange?.(next)
  }
  return (
    <>
      {(name || required) && (
        <select
          {...nativeAttrs}
          id={triggerId + '-form-value'}
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            border: 0,
            margin: -1,
            clip: 'rect(0,0,0,0)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
          name={name}
          value={selected}
          required={required}
          disabled={disabled}
          onChange={(event) => change(event.target.value)}
          onInvalid={(event) => {
            onInvalid?.(event)
            event.preventDefault()
            setInvalid(true)
            trigger.current?.focus()
          }}
        >
          {options.map((option, i) => (
            <option key={i} value={option.value} disabled={option.disabled}>
              {option.text}
            </option>
          ))}
        </select>
      )}
      <Select
        value={index < 0 ? '' : 'option-' + index}
        disabled={disabled}
        onValueChange={(key) => {
          const option = options[Number(key.slice(7))]
          if (option) change(option.value)
        }}
      >
        <SelectTrigger
          {...attrs}
          ref={trigger}
          id={triggerId}
          aria-label={props['aria-label'] ?? label?.text}
          aria-invalid={props['aria-invalid'] ?? (invalid || undefined)}
          autoFocus={autoFocus}
          className={className}
          style={{ ...style, backgroundImage: 'none' }}
        >
          <SelectValue placeholder={options[0]?.label}>
            <span className="flex min-w-0 items-center gap-[6px] overflow-hidden text-ellipsis whitespace-nowrap">
              {options[index]?.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option, i) => (
            <SelectItem key={i} value={'option-' + i} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
