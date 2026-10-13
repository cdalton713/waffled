import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn('relative inline-flex h-[28px] w-[46px] shrink-0 items-center rounded-full border-0 bg-(--control-track) p-[3px] data-[state=checked]:bg-(--person-3) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50', className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="pointer-events-none block size-[22px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
