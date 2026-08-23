import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Soromi',
    appBundleId: 'dev.soromi.app',
    icon: 'icons/icon',
    asar: true,
    // Bundled beside the app (Contents/Resources): the standalone daemon binary the shell spawns,
    // and the built frontend the shell serves. Build them first: `pnpm build:daemon:release` and
    // `pnpm build:gui`. Loaded from `process.resourcesPath` in `main.ts` when packaged.
    extraResource: ['../../target/release/soromi-daemon', '../../packages/gui/dist'],
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID as string,
      appleIdPassword: process.env.APPLE_PASSWORD as string,
      teamId: process.env.APPLE_TEAM_ID as string,
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: 'icons/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: 'icons/icon.png' } }),
    new MakerDeb({ options: { icon: 'icons/icon.png' } }),
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
