//Packages
import { Sheet, SheetContent } from '@soromi/ui'

//Types
import type { ReactNode } from 'react'

/**
 * A bottom-anchored sheet (shadcn Sheet on Radix), styled to the app's dark surface and rounded at
 * the top only. It hugs its content (up to 82% of the screen, then scrolls), the phone-native sheet
 * shape. Used for the workspaces switcher and the session settings.
 */
export function BottomSheet({
  opened,
  onClose,
  title,
  children,
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <Sheet open={opened} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" title={title} className="max-h-[82%] pb-[var(--safe-bottom)]">
        <div className="flex-1 overflow-y-auto px-3 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
