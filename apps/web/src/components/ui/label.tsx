import {
  Children,
  isValidElement,
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { FieldLabelContext } from './label-context'

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children)
  return ''
}

export function Label({
  className,
  children,
  htmlFor,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  const [controlId, setControlId] = useState<string>()
  const register = useCallback((id: string | undefined) => setControlId(id), [])
  const first = Children.toArray(children)[0]
  const label = text(first).trim() || undefined
  return (
    <FieldLabelContext.Provider value={{ text: label, register }}>
      <LabelPrimitive.Root
        data-slot="label"
        className={cn(className)}
        htmlFor={htmlFor ?? controlId}
        {...props}
      >
        {children}
      </LabelPrimitive.Root>
    </FieldLabelContext.Provider>
  )
}
