import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from './dialog'

interface SurfaceProps {
  className?: string
  children?: ReactNode
  'aria-label'?: string
}
function nameHeading(node: ReactNode): { node: ReactNode; found: boolean } {
  let found = false
  const nodes = Children.map(node, (child) => {
    if (found || !isValidElement<SurfaceProps>(child)) return child
    if (
      typeof child.type === 'string' &&
      (/^h[1-6]$/.test(child.type) ||
        /wf-serif|modal-title|sheet-title/.test(child.props.className ?? ''))
    ) {
      found = true
      return <DialogPrimitive.Title asChild>{child}</DialogPrimitive.Title>
    }
    const nested = nameHeading(child.props.children)
    if (!nested.found) return child
    found = true
    return cloneElement(child, {}, nested.node)
  })
  return { node: nodes, found }
}

export function Modal({
  children,
  onClose,
  title,
  className,
  ...props
}: Omit<ComponentProps<typeof DialogOverlay>, 'onClick' | 'children' | 'title'> & {
  children: ReactNode
  onClose?: () => void
  title?: ReactNode
}) {
  const opener = useRef<HTMLElement | null>(
    typeof document === 'undefined'
      ? null
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
  )
  const nodes = Children.toArray(children)
  const surface = nodes.find((node) => isValidElement<SurfaceProps>(node))
  if (!isValidElement<SurfaceProps>(surface)) return null
  const explicitName = title ?? surface.props['aria-label']
  const named =
    explicitName !== undefined
      ? { node: surface.props.children, found: false }
      : nameHeading(surface.props.children)
  const content = cloneElement(
    surface,
    {},
    <>
      {!named.found && <DialogTitle className="sr-only">{explicitName ?? 'Dialog'}</DialogTitle>}
      {named.node}
    </>,
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      <DialogPortal>
        <DialogOverlay
          className={['wf modal-overlay', className].filter(Boolean).join(' ')}
          {...props}
        >
          <DialogPrimitive.Content
            asChild
            data-slot="dialog-surface"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              opener.current?.focus()
            }}
          >
            {content}
          </DialogPrimitive.Content>
          {nodes.filter((node) => node !== surface)}
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  )
}
