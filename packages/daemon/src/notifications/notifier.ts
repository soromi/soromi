import { spawn } from 'node:child_process'

export interface Notification {
  title: string
  message: string
  sound: boolean
}

/** Fires an OS-native notification. Per-OS implementations sit behind this interface. */
export interface Notifier {
  notify(notification: Notification): void
}

/** macOS notifications via `osascript`. Fire-and-forget; never crashes the daemon. */
export class MacNotifier implements Notifier {
  notify({ title, message, sound }: Notification): void {
    const script = `display notification ${quote(message)} with title ${quote(title)}${
      sound ? ' sound name "Ping"' : ''
    }`
    const child = spawn('osascript', ['-e', script], { stdio: 'ignore' })
    child.on('error', () => {})
  }
}

/** No-op notifier for unsupported platforms and tests. */
export class NoopNotifier implements Notifier {
  notify(): void {}
}

export function createNotifier(platform: NodeJS.Platform = process.platform): Notifier {
  return platform === 'darwin' ? new MacNotifier() : new NoopNotifier()
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
