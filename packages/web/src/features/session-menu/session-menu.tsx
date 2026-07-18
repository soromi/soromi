import { Switch } from '@mantine/core'
import { useShallow } from 'zustand/react/shallow'

//Store
import { useUiStore } from '@/stores/ui-store'

//Components
import { BottomSheet } from '@/shared/bottom-sheet'

//Styles
import styles from './session-menu.module.css'

const FONT_MIN = 10
const FONT_MAX = 18

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
      <div className={styles.row}>
        <span className={styles.text}>
          <span className={styles.label}>Touch keys</span>
          <span className={styles.desc}>Show the special-key row above the keyboard</span>
        </span>
        <Switch
          checked={keyboardVisible}
          onChange={toggleKeyboard}
          aria-label="Toggle touch keys"
        />
      </div>

      <div className={styles.row}>
        <span className={styles.text}>
          <span className={styles.label}>Font size</span>
          <span className={styles.desc}>Monospace terminal text</span>
        </span>
        <span className={styles.stepper}>
          <button
            type="button"
            className={styles.step}
            onClick={() => setFontSize(fontSize - 1)}
            disabled={fontSize <= FONT_MIN}
            aria-label="Smaller"
          >
            −
          </button>
          <span className={styles.value}>{fontSize}</span>
          <button
            type="button"
            className={styles.step}
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
