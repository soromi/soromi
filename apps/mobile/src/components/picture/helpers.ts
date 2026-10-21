/** Text sent as base64, read back as the UTF-8 it was. */
export const fromBase64Text = (data: string): string => {
  const binary = atob(data)
  const escaped = Array.from(
    binary,
    (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  )

  return decodeURIComponent(escaped.join(''))
}

/** Where an image decoder finds a picture sent as base64. */
export const toDataUri = (mediaType: string, data: string): string =>
  `data:${mediaType};base64,${data}`
