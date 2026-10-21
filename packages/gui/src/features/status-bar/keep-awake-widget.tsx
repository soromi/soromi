import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  cn,
} from '@soromi/ui'

//Icons
import CheckSvg from '@/assets/icons/check.svg?react'
import MugSvg from '@/assets/icons/mug.svg?react'

//Types
import type { KeepAwakeMode } from '@soromi/protocol'

const KEEP_AWAKE_MODES: { mode: KeepAwakeMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'working', label: 'While agent works' },
  { mode: 'always', label: 'Always on' },
]

/** A status-bar button that is an icon alone. */
export const STATUS_ICON =
  'flex h-[24px] w-[28px] cursor-pointer appearance-none items-center justify-center rounded-lg border-none bg-transparent text-[var(--soromi-text-faint)] transition-colors hover:bg-[var(--soromi-bg-hover)] hover:text-[var(--soromi-text-dim)] data-[state=open]:bg-[var(--soromi-bg-hover)]'

/**
 * Keep-awake, at the left of the status bar: whether this computer is kept from sleeping now (the
 * cup lights up), and the mode that decides it, picked from a menu that opens upward.
 */
export function KeepAwakeWidget() {
  const transport = useTransport()
  const { keepAwake, keepAwakeMode, setKeepAwakeMode } = useClientStore(
    useShallow((s) => ({
      keepAwake: s.keepAwake,
      keepAwakeMode: s.keepAwakeMode,
      setKeepAwakeMode: s.setKeepAwakeMode,
    })),
  )

  const select = (mode: KeepAwakeMode) => {
    setKeepAwakeMode(mode)
    transport.send({ type: 'set-keep-awake-mode', mode })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Keep awake: ${KEEP_AWAKE_MODES.find((m) => m.mode === keepAwakeMode)?.label}`}
          className={cn(STATUS_ICON, keepAwake && 'text-[var(--soromi-accent)]')}
        >
          <MugSvg width={15} height={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[230px]">
        <DropdownMenuLabel>Keep awake</DropdownMenuLabel>
        {KEEP_AWAKE_MODES.map(({ mode, label }) => (
          <DropdownMenuItem key={mode} onClick={() => select(mode)}>
            <CheckSvg
              width={14}
              height={14}
              className={cn('opacity-0', mode === keepAwakeMode && 'opacity-100')}
            />
            {label}
          </DropdownMenuItem>
        ))}
        <p className="px-2 pt-1.5 pb-1 text-[11px] text-[var(--soromi-text-faint)] leading-snug">
          In every mode, this computer also stays awake while a paired phone is connected. A
          sleeping computer cannot be reached from a phone.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
