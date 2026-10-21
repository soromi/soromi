import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

/** What the Linux installers say of the app. */
const LINUX_PACKAGE = {
  name: 'soromi',
  productName: 'Soromi',
  genericName: 'Coding agents',
  description: 'Run and follow your coding agents, from this computer or your phone.',
  bin: 'Soromi',
  icon: 'icons/icon.png',
  categories: ['Development' as const],
  homepage: 'https://soromi.dev',
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Soromi',
    appBundleId: 'dev.soromi.app',
    icon: 'icons/icon',
    asar: true,
    // Bundled beside the app (Contents/Resources): the standalone daemon binary the shell spawns,
    // and the built frontend the shell serves. Build them first: `pnpm build:daemon:release` and
    // `pnpm build:gui`. Loaded from `process.resourcesPath` in `main.ts` when packaged.
    // The png is the window's and the notifications' icon on Linux, where the bundle has none.
    extraResource: [
      '../../target/release/soromi-daemon',
      '../../packages/gui/dist',
      'icons/icon.png',
    ],
    osxSign: {},
    // CI passes the app-specific password via env (APPLE_ID set); locally we notarize from the
    // `soromi-notary` keychain profile (`xcrun notarytool store-credentials`), so no secrets are needed.
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID as string,
          appleIdPassword: process.env.APPLE_PASSWORD as string,
          teamId: process.env.APPLE_TEAM_ID as string,
        }
      : { keychainProfile: 'soromi-notary' },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: 'icons/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    // The Linux packages are named for the app, not for the workspace package (`@soromi/desktop`),
    // and point at the executable the packager names after the product.
    new MakerRpm({ options: LINUX_PACKAGE }),
    new MakerDeb({ options: { ...LINUX_PACKAGE, maintainer: 'Soromi' } }),
  ],
  plugins: [
    new VitePlugin({
      // Only the main + preload processes are built by Forge/Vite. The renderer is the shared
      // `packages/gui` build, which the shell loads over its own `app://` scheme (see `main.ts`) —
      // so gui keeps its own Vite config (React, Tailwind, workspace aliases) untouched.
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      // there's nothing to encrypt. Re-enable once the app ships with a stable Developer ID signature.
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      // The shell serves the frontend from Resources over app://, so app code isn't asar-only.
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
}

export default config
