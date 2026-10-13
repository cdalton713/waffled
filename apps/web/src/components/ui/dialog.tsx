import type { ComponentProps } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogPortal = DialogPrimitive.Portal

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-50 bg-(--scrim) backdrop-blur-[2px]', className)} {...props} />
}

export function DialogContent({ className, children, showCloseButton = true, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('wf modal-card fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none', className)}
        {...props}
      >
        {children}
        {showCloseButton && <DialogClose asChild><Button variant="unstyled" className="modal-close" aria-label="Close"><X size={20} /></Button></DialogClose>}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('m-0 [font-family:var(--serif)] [font-size:19px] font-semibold', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('m-0 text-(--ink-3) [font-size:12.5px] font-semibold leading-[1.4]', className)} {...props} />
}
