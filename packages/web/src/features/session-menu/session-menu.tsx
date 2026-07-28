import { useShallow } from 'zustand/react/shallow'

//Packages
import { Switch } from '@soromi/ui'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { BottomSheet } from '@/shared/bottom-sheet'

const FONT_MIN = 10
const FONT_MAX = 18

/** A settings row (label + description on the left, control on the right). */
const ROW = 'flex w-full items-center justify-between gap-3 px-2 py-3 text-[var(--soromi-text)]'
/** The label + description text stack. */
const TEXT = 'flex min-w-0 flex-col gap-[3px]'
/** A +/− stepper button. */
const STEP =
  'h-[30px] w-8 cursor-pointer appearance-none rounded-lg border-none bg-[var(--soromi-bg-active)] text-[var(--soromi-text)] text-lg disabled:cursor-default disabled:opacity-35'

/** Bottom sheet of per-session view settings: the touch key row and the terminal text size. */
export function SessionMenu() {
  const { sheet, keyboardVisible, fontSize, toggleKeyboard, setFontSize, close } = useUiStore(
    useShallow((s) => ({
      sheet: s.sheet,
      keyboardVisible: s.keyboardVisible,
      fontSize: s.fontSize,
      toggleKeyboard: s.toggleKeyboard,
      setFontSize: s.setFontSize,
      close: s.closeSheet,
    })),
  )

  return (
    <BottomSheet opened={sheet === 'session-menu'} onClose={close} title="Session">
      <div className={ROW}>
        <span className={TEXT}>
          <span className="font-semibold text-[14.5px]">Touch keys</span>
          <span className="text-[var(--soromi-text-faint)] text-xs">
            Show the special-key row above the keyboard
          </span>
        </span>
        <Switch
          checked={keyboardVisible}
          onCheckedChange={toggleKeyboard}
          aria-label="Toggle touch keys"
        />
      </div>

      <div className={ROW}>
        <span className={TEXT}>
          <span className="font-semibold text-[14.5px]">Font size</span>
          <span className="text-[var(--soromi-text-faint)] text-xs">Monospace terminal text</span>
        </span>
        <span className="flex flex-none items-center gap-1 rounded-[10px] bg-[var(--soromi-bg-hover)] p-[3px]">
          <button
            type="button"
            className={STEP}
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= FONT_MIN}
            aria-label="Smaller"
          >
            −
          </button>
          <span className="min-w-[30px] text-center text-sm tabular-nums">{fontSize}</span>
          <button
            type="button"
            className={STEP}
            onClick={() => setFontSize(fontSize + 1)}
            disabled={fontSize >= FONT_MAX}
            aria-label="Larger"
          >
            +
          </button>
        </span>
      </div>
    </BottomSheet>
  )
}
