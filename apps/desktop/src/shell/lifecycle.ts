// Whether the app is really quitting (Cmd+Q / menu) versus the window merely hiding on close. The
// window's close handler, the daemon's exit handler, and the quit IPC all coordinate through this so
// closing the window keeps the daemon alive but a real quit tears everything down.

let quitting = false

export const isQuitting = (): boolean => quitting

export const markQuitting = (): void => {
  quitting = true
}
