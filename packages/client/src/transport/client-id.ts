const CLIENT_ID_KEY = 'soromi.clientId'

/**
 * A stable id for this install, kept in local storage where there is one. The transport announces
 * it to the daemon in `hello`.
 */
export function browserClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)
    if (stored) return stored
    const created = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, created)

    return created
  } catch {
    return crypto.randomUUID()
  }
}
