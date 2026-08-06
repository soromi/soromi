// Shared Tailwind class strings for the settings overlay sections (used by settings.tsx and
// remote-settings.tsx), so the two forms stay visually identical.

/** A titled settings section: heading block + its content, stacked. */
export const SECTION = 'flex flex-col gap-4'

/** The section's header row: title/description on the left, an optional count on the right. */
export const SECTION_HEAD = 'flex items-start justify-between gap-4'

/** The big section title. */
export const H2 = 'mt-0 mb-2 font-bold text-[26px] text-[var(--soromi-text)]'

/** The muted explainer paragraph under a title. */
export const DESC = 'm-0 max-w-[720px] text-[var(--soromi-text-dim)] text-sm leading-[1.5]'

/** A bordered card wrapping account / form content. */
export const CARD = 'overflow-hidden rounded-xl border border-[var(--soromi-border)]'

/** A card name / muted-workspace label. */
export const CARD_NAME = 'font-semibold text-[var(--soromi-text)] text-base'
