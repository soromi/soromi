import { Drawer } from '@mantine/core'

//Types
import type { ReactNode } from 'react'

/**
 * A bottom-anchored Mantine Drawer, styled to the app's dark surface and rounded at the top only.
 * It hugs its content (up to 82% of the screen, then scrolls), the phone-native sheet shape. Used
 * for the workspaces switcher and the session settings.
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
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      title={title}
      overlayProps={{ backgroundOpacity: 0.5 }}
      transitionProps={{ transition: 'slide-up', duration: 220 }}
      styles={{
        content: {
          height: 'auto',
          maxHeight: '82%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--soromi-bg-sidebar)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 'var(--safe-bottom)',
        },
        header: {
          background: 'var(--soromi-bg-sidebar)',
          color: 'var(--soromi-text)',
          padding: '16px 16px 8px',
          minHeight: 0,
        },
        title: { fontSize: 15, fontWeight: 700 },
        body: { padding: '0 12px 16px', overflowY: 'auto' },
      }}
    >
      {children}
    </Drawer>
  )
}
