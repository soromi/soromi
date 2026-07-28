import * as LabelPrimitive from '@radix-ui/react-label'
import { forwardRef } from 'react'

//Utils
import { cn } from '../../lib/utils'

//Types
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

export const Label = forwardRef<
  ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
})
