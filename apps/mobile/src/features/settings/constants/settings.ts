//Type
import type { SettingsConfig } from '../types'

export const SETTINGS: SettingsConfig = {
  open: 'Settings',
  computer: {
    title: 'Computer',
    about: 'This phone is paired with a computer, and shows the workspaces and sessions on it.',
    os: { macos: 'macOS', linux: 'Linux', windows: 'Windows' },
    launcher: {
      desktop: 'Soromi desktop app',
      cli: 'Started from a terminal',
      service: 'Running as a service',
    },
    separator: ' · ',
    version: (version) => `Soromi ${version}`,
  },
  connection: {
    title: 'Connection',
    probeMs: 2000,
    grades: { good: 150, fair: 400 },
    labels: {
      status: 'Status',
      route: 'Route',
      latency: 'Latency',
      average: 'Average',
      since: 'Connected for',
      drops: 'Drops',
    },
    status: {
      connecting: 'Connecting…',
      online: 'Online',
      'computer-offline': 'Computer not reachable',
      replaced: 'Opened on another device',
      'update-app': 'This app needs an update',
      'update-desktop': 'The computer needs an update',
    },
    route: {
      direct: 'Direct, on the same network',
      relay: 'Through the relay',
    },
    grade: { good: 'Good', fair: 'Fair', poor: 'Poor' },
    gradeTone: { good: 'action', fair: 'warn', poor: 'danger' },
    unknown: '—',
    ms: (ms) => `${Math.round(ms)} ms`,
    latency: (ms, grade) => `${Math.round(ms)} ms · ${grade}`,
    average: (ms, count) => `${Math.round(ms)} ms over ${count}`,
    drops: (count) => (count === 0 ? 'None since the app opened' : `${count} since the app opened`),
    duration: { seconds: 's', minutes: 'min', hours: 'h' },
  },
  appearance: {
    title: 'Appearance',
    about: 'Light or dark, or as the phone is set: light by day and dark at night, say.',
    options: [
      { id: 'system', label: 'System' },
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
  },
  relay: {
    title: 'Relay',
    about:
      'Where this phone reaches the computer when it is not on the same network. It comes from the pairing code: change it only if the computer now uses another relay (Settings → Remote on the computer).',
    placeholder: 'wss://relay.example.com',
    invalid: 'That is not a relay address: wss:// and a host, such as wss://relay.example.com.',
    save: 'Save relay',
    saved: 'Saved. The phone reaches the computer through this relay now.',
  },
  unpair: {
    action: 'Unpair from this computer',
    hint: 'The phone forgets this computer and goes on with another it is paired with. On a server, the terminals it opened there are closed too.',
    title: 'Unpair from this computer?',
    message:
      'The phone will forget this computer. To cut off access for good, also revoke this device in Soromi on the computer.',
    cancel: 'Cancel',
    confirm: 'Unpair',
  },
}
