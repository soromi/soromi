const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const repo = path.resolve(__dirname, '../..')
const config = getDefaultConfig(__dirname)

// The shared packages (`@soromi/core`, `@soromi/protocol`) are linked from the repo, outside this
// project, and their own dependencies sit in the repo's package store. Metro only reads what it
// watches.
config.watchFolders = [path.join(repo, 'packages'), path.join(repo, 'node_modules', '.pnpm')]

// The repo's other apps are on an older React. Whatever file asks for React, it gets this app's:
// two copies in one bundle break hooks at runtime.
const own = ['react', 'react-native']
const fromHere = path.join(__dirname, 'package.json')
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = own.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))
  const from = pinned ? { ...context, originModulePath: fromHere } : context

  return context.resolveRequest(from, moduleName, platform)
}

module.exports = config
