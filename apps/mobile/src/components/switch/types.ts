export type Props = {
  value: boolean
  onChange: (value: boolean) => void
  /** What it turns on, for a screen reader: the row's label. */
  label: string
  disabled?: boolean
}
