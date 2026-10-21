import { useShallow } from 'zustand/react/shallow'

//Packages
import { cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { SettingsGroup, SettingsPage } from '../layout'

//Types
import type { Theme } from '@/stores/app-store'

/**
 * Each theme, as a small picture of the app in it. Drawn in that theme's own colours, whichever is
 * on: it shows what choosing it gives (the colours are the ui's theme.css, light and dark).
 */
const PREVIEWS: {
  theme: Theme
  label: string
  shell: string
  panel: string
  line: string
  dim: string
  accent: string
}[] = [
  {
    theme: 'dark',
    label: 'Dark',
    shell: '#09090a',
    panel: '#121213',
    line: '#2a2a2a',
    dim: '#1f1f1f',
    accent: '#3ecf8e',
  },
  {
    theme: 'light',
    label: 'Light',
    shell: '#f3f3f1',
    panel: '#ffffff',
    line: '#e2e2de',
    dim: '#ebebe8',
    accent: '#12a066',
  },
]

/** Light or dark, picked from a picture of each. It changes at once, and the next launch opens in it. */
export function AppearanceSection() {
  const { theme, setTheme } = useAppStore(
    useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme })),
  )

  return (
    <SettingsPage title="Appearance" description="How Soromi looks on this computer.">
      <SettingsGroup label="Theme" hint="Code, diffs and the terminal follow it too.">
        <div className="grid grid-cols-2 gap-3 p-3">
          {PREVIEWS.map((preview) => (
            <button
              key={preview.theme}
              type="button"
              onClick={() => setTheme(preview.theme)}
              aria-pressed={theme === preview.theme}
              className={cn(
                'flex cursor-pointer appearance-none flex-col gap-2 rounded-[10px] border bg-transparent p-2 text-left transition-colors',
                theme === preview.theme
                  ? 'border-[var(--soromi-accent)] [box-shadow:0_0_0_3px_color-mix(in_srgb,var(--soromi-accent)_18%,transparent)]'
                  : 'border-[var(--soromi-border)] hover:border-[var(--soromi-border-strong)]',
              )}
            >
              <div
                aria-hidden="true"
                className="flex h-[92px] gap-1.5 overflow-hidden rounded-[7px] p-1.5"
                style={{ background: preview.shell }}
              >
                <div className="flex w-[30%] flex-col gap-1.5 pt-1">
                  <div
                    className="h-1.5 w-[70%] rounded-full"
                    style={{ background: preview.accent }}
                  />
                  <div
                    className="h-1.5 w-[85%] rounded-full"
                    style={{ background: preview.line }}
                  />
                  <div
                    className="h-1.5 w-[60%] rounded-full"
                    style={{ background: preview.line }}
                  />
                  <div
                    className="h-1.5 w-[75%] rounded-full"
                    style={{ background: preview.line }}
                  />
                </div>
                <div
                  className="flex flex-1 flex-col gap-1.5 rounded-[5px] border p-2"
                  style={{ background: preview.panel, borderColor: preview.line }}
                >
                  <div
                    className="h-1.5 w-[50%] rounded-full"
                    style={{ background: preview.line }}
                  />
                  <div className="h-1.5 w-[80%] rounded-full" style={{ background: preview.dim }} />
                  <div className="h-1.5 w-[65%] rounded-full" style={{ background: preview.dim }} />
                  <div
                    className="mt-auto h-3 rounded-[3px] border"
                    style={{ borderColor: preview.line }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 px-0.5 pb-0.5">
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                    theme === preview.theme
                      ? 'border-[var(--soromi-accent)]'
                      : 'border-[var(--soromi-border-strong)]',
                  )}
                >
                  {theme === preview.theme && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--soromi-accent)]" />
                  )}
                </span>
                <span className="text-[12.5px] text-[var(--soromi-text)]">{preview.label}</span>
              </div>
            </button>
          ))}
        </div>
      </SettingsGroup>
    </SettingsPage>
  )
}
