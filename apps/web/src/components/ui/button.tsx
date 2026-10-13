import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const shape = 'inline-flex items-center gap-[8px] border-0 rounded-full px-[22px] py-[12px] [font-family:inherit] [line-height:inherit] [font-size:15px] font-bold cursor-pointer [&_svg]:size-[17px] [&_svg]:stroke-2'
export const buttonVariants = cva('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', {
  variants: {
    variant: {
      default: `${shape} bg-primary text-primary-foreground shadow-(--sh-1)`,
      secondary: `${shape} bg-secondary text-secondary-foreground`,
      ghost: `${shape} bg-secondary text-secondary-foreground`,
      ai: `${shape} bg-[linear-gradient(135deg,var(--ai),var(--ai-d))] text-primary-foreground`,
      destructive: `${shape} bg-destructive text-primary-foreground`,
      outline: `${shape} border border-input bg-card text-foreground`,
      plain: shape,
      unstyled: '',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Button({ className, variant, asChild = false, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" data-variant={variant ?? 'default'} className={cn(buttonVariants({ variant }), className)} {...props} />
}
