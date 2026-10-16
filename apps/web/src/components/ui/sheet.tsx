import type { ComponentProps } from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Sheet = SheetPrimitive.Root
export const SheetClose = SheetPrimitive.Close
export const SheetTitle = SheetPrimitive.Title

export function SheetContent({
  className,
  children,
  style,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="mobile-nav-scrim open" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        className={cn('wf pointer-events-none fixed inset-0 z-[220] outline-none', className)}
        style={{ ...style, pointerEvents: 'none' }}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}
