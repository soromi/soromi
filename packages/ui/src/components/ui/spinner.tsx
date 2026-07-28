import { Loader2 } from 'lucide-react'

//Utils
import { cn } from '../../lib/utils'

/** A spinning loader, replacing Mantine's `<Loader>`. Sized in px like an icon. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Loader2
      width={size}
      height={size}
      className={cn('animate-spin text-primary', className)}
      aria-label="Loading"
    />
  )
}
