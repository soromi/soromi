# @soromi/mobile

The Soromi phone app (Expo / React Native): pair with your computer, see every workspace and
session live, follow a conversation, and send the next message.

It talks to the daemon end-to-end encrypted, using the same transport and store as the desktop app
(`@soromi/core`): straight to the computer when the phone is on its network, and through the relay
otherwise. Which one is chosen by the transport, re-checked whenever the phone's network changes,
and shown in the home screen's header ("Local" or "Relay"). Nothing here is specific to the phone
except the screens.

- [Run it](#run-it)
- [Check it](#check-it)
- [Build it](#build-it): an installable Android app, through EAS.
- [Patterns](#patterns): how code in this app is written. Read it before adding or changing
  anything in `src/`.
- [What it does not do yet](#what-it-does-not-do-yet)

## Run it

From the repo root:

```bash
pnpm install                           # the repo, if you have not: the app links its shared packages
pnpm --filter @soromi/protocol build   # the protocol types the app imports
pnpm --dir apps/mobile install         # the app's own dependencies
pnpm dev:mobile                        # starts the Expo dev server
```

Open the QR code it prints with **Expo Go** on your phone (the phone and the computer on the same
network). Then, in Soromi on your computer: devices button in the status bar → "Pair a device", and
scan that code from the app's pairing screen.

In Expo Go the pairing code has to be scanned from inside the app (or pasted): the `soromi://` link
only opens the app directly in a development or store build. On Android, Expo Go also logs an error
about push notifications at launch: it is about pushed ones, which this app does not use.

The app is not part of the repo's pnpm workspace and has its own lockfile. It is on a newer React
than the desktop, and one install cannot hold both without the desktop's libraries picking up the
wrong React types. `@soromi/core` and `@soromi/protocol` are linked from `../../packages`, and
`metro.config.js` lets Metro read them there.

## Check it

```bash
pnpm check:mobile                 # from the repo root: typecheck, tests, then build both bundles
pnpm check                        # Biome, over the whole repo including this app
pnpm --dir apps/mobile doctor     # Expo's own project checks
```

`doctor` reports one failure, a duplicate React: it finds the desktop's React 18 in the repo's
`node_modules` above this folder. That copy never reaches the app, since `metro.config.js` resolves
React from here whatever file asks for it, in a native build as well.

Expo changes its APIs with every SDK release. Before touching an Expo or React Native API, read the
docs for the SDK version in `package.json`, and add packages with `npx expo install`, which picks
the versions that SDK expects.

## Build it

Builds run on [EAS](https://docs.expo.dev/build/introduction/), from this folder, and both
profiles in `eas.json` produce an **APK** (a file you can install directly), not the bundle the
Play Store takes.

```bash
pnpm build:mobile                              # from the repo root: the production build
pnpm --dir apps/mobile build:android           # the same, by its own name
pnpm --dir apps/mobile build:android:preview   # the same build, with a link to install it from
```

Never run `eas` from the repo root. It finds no Expo project there, so it offers to make one (an
`app.json` and an `eas.json` beside the repo's own files), cannot tell the SDK version, warns
about "SDK < 41", and the build fails.

- **Production** raises the Android version code on every build, which Android requires before it
  will install a build over the one already on the phone. The number is kept by EAS
  (`appVersionSource: remote`), not in `app.json`.
- **Signing.** The first build asks EAS to make the app's signing key and keeps it for every build
  after. Android only installs an update signed with the same key, so that key is the app's
  identity: do not let it be replaced.
- **What EAS builds from.** It uploads the whole repository and installs this folder's own
  dependencies. The app also needs `@soromi/core` and `@soromi/protocol` from `../../packages`,
  which are not built or installed by that, so the `eas-build-post-install` script installs just
  those two from the repo root and builds the protocol types. Nothing of the desktop app is
  installed on the build machine.
- The Node and pnpm versions the build uses are pinned in `eas.json`, to the ones the repo uses.

Only Android is set up. An iOS build needs an Apple developer account and its own profile.

### Push notifications

The code is in place; each platform needs its credentials before a build can receive a push.
Without them the app works as before and only notifies while it is open.

- **Android.** A Firebase project with an Android app for `dev.soromi.mobile`. Put its
  `google-services.json` in this folder and name it in `app.json`
  (`"android": { "googleServicesFile": "./google-services.json" }`), then give EAS the project's
  service account key for sending: `eas credentials` → Android → Google Service Account → FCM V1.
- **iOS.** An iOS build profile in `eas.json`, and a push key, which `eas credentials` (or the
  first `eas build --platform ios`) offers to create on the Apple developer account.

Pushes are sent by the daemon on the user's computer, straight to Expo's push service; nothing of
ours sits in between.

## Patterns

### Folder layout

`src/` is thin, single-purpose layers. There is no `shared/` or `utils/` bucket: a layer is named
for what it holds.

```
src/
├─ app/                  routes only (Expo Router): each file exports a screen, nothing else
├─ screens/              one file per screen, grouped by area of the app; shared/, what more than
│                        one screen is built from; plus root.tsx, the navigator
├─ features/<domain>/    components/ hooks/ constants/ types.ts helpers.ts
├─ components/           hand-built UI primitives, one folder each; index.ts is the one barrel
├─ config/               app.ts (settings, read once), router/ (every path), theme/, runtime.ts
├─ services/             what reaches outside the app: the link to the computer, the keychain
├─ states/               every Zustand store, with create.ts
├─ hooks/                cross-cutting hooks with no single owning feature
└─ types/                global declarations with no single owning domain
```

Imports go one way: `app → screens → features → components / config / services / states / hooks /
types`, never back. **Features never import each other.** What two of them need moves up to
`components/`, `hooks/` or a shared feature such as `features/layout`.

| Layer | Owns |
|---|---|
| `app/` | Route files. `_layout.tsx` sets up providers and renders the navigator. |
| `screens/` | A screen composes features and components, reads the stores it needs, and owns navigation parameters. Grouped by area: `app/` (needs a pairing), `pairing/`. A screen is the one place two features meet; what two screens share of that (the sessions column, a session's panel) is in `shared/`. |
| `features/` | One folder per domain (`sessions`, `chat`, `terminal`, `files`, `git`, `skills`, `panel`, `settings`, `pairing`, `layout`). Its components, hooks, constants, types and pure helpers. No stores and no services live here. |
| `components/` | Primitives built on `StyleSheet`: `Text`, `Button`, `IconButton`, `Icon`, `Chip`, `Input`, `Option`, `Sheet`, `Segmented`, `KeyboardView`, `Loader`, `Logo`, `Markdown`, `ProviderMark`, `StatusDot`, `Terminal`, `WorkingMark`. They know nothing about sessions or the daemon. |
| `config/` | How the app is wired: settings, routes, the theme, runtime setup. |
| `services/` | The transport to the daemon (`link.ts`), the keychain (`keychain.ts`), the photo library (`photos.ts`), the clipboard (`clipboard.ts`), network changes (`network.ts`) and the phone's notifications (`notifications.ts`). |
| `states/` | State. The phone's own (`link`, `chat`, and `preferences`, which unpairing leaves alone), what it has looked at on the computer (`workspace`), and the daemon's mirror (`daemon`). |

### Routes

- **A route file is three lines.** It imports its screen and exports it as default. No logic.

  ```tsx
  //Screens
  import { SessionsScreen } from '@/screens/app/sessions'

  export default SessionsScreen
  ```

- **Paths live in `config/router`.** Links, pushes and redirects use `routes.app.sessions`, never
  a string.
- **A path with parameters is a pattern there** (`'/session/[id]'`), filled inside a helper of
  the feature that links to it (`getSessionHref(id)` in `features/sessions/helpers.ts`,
  `getFileHref(workspace, path)` in `features/files/helpers.ts`).
- **Route types are generated** into `.expo/types` when the dev server starts (`pnpm dev:mobile`).
  Until it has run once after a route is added, `tsc` does not know the new path.
- **Settings are read once, in `config/app.ts`.** Nothing else reads `process.env`, and a value
  used in more than one place (the pairing prefix) is defined there.

### Components

**Props are read as `props.x`.** A component takes `props` and never destructures it, in the
signature or in the body.

```tsx
// ✅
export const WorkspaceHeading = (props: HeadingProps) => (
  <Text variant="label">{props.title}</Text>
)

// ❌
export const WorkspaceHeading = ({ title }: HeadingProps) => …
```

The one exception is a default value: destructure only the props that have a default, and keep the
rest as `props`.

```tsx
export const Text = ({ variant = 'body', tone = 'heading', ...props }: Props) => …
```

A prop read inside a `useCallback` or `useMemo` is first taken into a local
(`const onScan = props.onScan`), so the dependency list names that value and not the whole `props`
object.

**`useCallback` and `useMemo`.**

- Every handler passed to a child is a `useCallback`: `onPress`, `onChangeText`, `renderItem`.
- Every derived value that costs something, or is passed down, is a `useMemo`: list sections,
  navigator options, a list's empty or footer element.
- No inline arrow handlers inside a `.map()` or a list's `renderItem`. When each item needs its own
  handler, the item is a small component that builds it (`SessionRow`, `Approval`).
- A list's `keyExtractor` is a helper (`getSessionKey`), not an inline arrow.
- A primitive that is one of a list of choices takes a `value` and an `onSelect(value)` (`Option`,
  a `Segmented` option), so whoever lists them passes one handler and no arrow per item.

**Nothing loose in a component file.** A component file holds its imports, its component, and its
`makeStyles` at the bottom. Everything else sits beside it:

| What | Where |
|---|---|
| Props and every other type | `types.ts` (`<Name>Props` in a feature; `Props` in a `components/<name>/` folder) |
| Constants, copy, option lists | `constants/<name>.ts` in a feature; `constants.ts` in a component folder |
| Pure functions | `helpers.ts` |

All copy the user reads is a constant, not a string in JSX.

**One object per group of related constants**, with a named type in `types.ts`:

```ts
// ✅
export const CHAT: ChatConfig = { empty: {…}, composer: {…}, approval: {…}, row: {…} }

// ❌
export const CHAT_PLACEHOLDER = '…'
export const CHAT_SEND = '…'
```

**`components/<name>/`.** A primitive is a folder: `index.tsx` (the component), `types.ts`,
`styles.ts`, and `helpers.ts` when it has lookups. `index.tsx` is the component itself, not a
re-export. `components/index.ts` is the barrel screens and features import primitives from
(`@/components`). Feature, state and service folders have no barrel; the only other index is
`config/theme`, which is one module split over a few files.

### Layout: phone and tablet

The app lays itself out by the width it is given, not by the kind of device. `useLayout()` says
which layout that is, from the breakpoints in `config/layout.ts`:

| Width | Layout |
|---|---|
| under 768 | One thing at a time, full width: the sessions, then a conversation, then its panel. |
| 768 and up (`wide`) | The sessions keep a column of their own at the left (`screens/shared/sidebar`), and the stack is what is open beside it. A session's panel is a pane at the right that slides over the conversation. |
| 1100 and up (`docked`) | The panel sits beside the conversation instead of over it. |

- **Never branch on the platform or the device type for layout.** A large phone on its side is
  wide; a tablet sharing its screen with another app is not.
- **The navigator keeps its place in the tree** whichever layout is on (`screens/root.tsx`), so
  turning the device does not start the navigation over. A layout change adds or removes what is
  around the stack, never the stack.
- **What a phone shows as a screen and a tablet as a pane is written once**, in `screens/shared/`
  (`panel-body`), and used by both.
- **The home has two views**, a list and a grid of cards, switched from its header and kept in
  `preferences`. The grid has as many cards to a row as fit (`useLayout().columns`). The sessions
  column of a wide screen is always a list.
- **Going to a session** is `useOpenSession()`, which knows that beside the sessions column a
  session takes the place of the one open rather than stacking on it.
- **Reading widths are capped**: a conversation's column (`layout.column`) and a sheet
  (`layout.sheet`) stop growing and sit in the middle.

### Styling

- **Theme tokens only.** Colours, spacing, radii and type styles come from `config/theme`
  (`theme.surface.raised`, `theme.spacing.md`, `theme.borderRadius.lg`). No hex colour and no
  spacing token is written anywhere else. `primitives` holds the raw palette; styles use the
  semantic names. Two things are not styling and keep their own colours: artwork (a provider's
  mark, in `components/provider-mark/constants.ts`) and data (a file type's colour, which comes
  from `@soromi/core` with the type and is handed to `Icon` as `color`).
- **Icons go through `Icon`**, by name and in a text tone (`<Icon name="folder" tone="action" />`).
  A new one is added to `components/icon`, imported on its own path so the bundle carries only
  the icons in use. An action that is an icon alone is an `IconButton`, which requires the `label`
  a screen reader says.
- **A choice among a few is a `Chip` that opens a `Sheet` of `Option`s** (the model, the permission
  mode, the account), each picker keeping its own open state.
- **Styles are a factory outside the component**, applied with a hook:

  ```tsx
  const styles = useThemedStyles(makeStyles)
  …
  const makeStyles = defineStyles((theme) => ({
    row: { gap: theme.spacing.sm2, paddingHorizontal: theme.spacing.md },
  }))
  ```

- **A screen with a text box is wrapped in `KeyboardView`**, which keeps its bottom above the
  on-screen keyboard on both platforms. Never use React Native's `KeyboardAvoidingView` directly.
- **All text goes through `Text`**, with a `variant` (the type style) and a `tone` (the colour).
  Never set `fontSize`, `fontWeight` or a font family by hand, and never import React Native's
  `Text`, `TextInput` or `ActivityIndicator` outside `components/`.

### State

Every store lives in `states/<domain>/`. One the app defines is three files (the daemon's has no
type file, since its types are `@soromi/core`'s):

| File | Holds |
|---|---|
| `<domain>.state.ts` | the store |
| `<domain>.state.type.ts` | its types |
| `<domain>.state.hook.ts` | one selector hook per thing a component reads, each with a `@description` |

- **Components read state through those hooks**, never through the store directly. Code outside
  React (services, effects that must not re-run) uses `Store.getState()`.
- **State is grouped by concern** into nested objects (`pairing`, `connection`), with every action
  in a sibling `actions` group. That keeps `useLinkActions()` a stable reference.
- **Stores are made with `states/create.ts`'s `create`**, not Zustand's. It is the same function
  plus a registry, so `resetAllStores()` clears every store without anyone keeping a list. A store
  built elsewhere is added with `register`.
- **Prefer one store per real domain** over one per feature.
- **The daemon's state is not ours to shape.** `DaemonStore` is `@soromi/core`'s store, the same
  one the desktop mirrors the daemon into. The app reads it through `daemon.state.hook.ts` and
  never writes to it; the link fills it.

### Services and data

- **`services/link.ts` is the only place that holds the transport.** Everything sent to the daemon
  goes through `LinkService.send`, and everything received is routed into the stores there.
- **Something the daemon answers is asked for in a hook** (`useFile`, `useGitStatus`, `useSkills`):
  when its screen opens, and again whenever the link comes back, since the daemon starts every
  connection from nothing. The answer lands in a store, and the hook returns it from there.
- **The terminal runs in a web view**, since its emulator needs a browser. The page it loads
  (the emulator and a small bridge) is generated into `components/terminal/page.generated.ts` by
  `pnpm --dir apps/mobile gen:terminal` from `scripts/terminal-bridge.js` and the desktop's own
  copy of the emulator, so both apps draw with one version. The result is committed; run the
  script again after changing the bridge or upgrading the emulator.
- **A library the app wraps is imported in one file.** `expo-secure-store` only in
  `services/keychain.ts`, the transport only in `services/link.ts`, the photo picker only in
  `services/photos.ts`, the clipboard only in `services/clipboard.ts`, the network module only in
  `services/network.ts`, the notifications module only in `services/notifications.ts`, the web view only in `components/terminal/index.tsx`, the markdown parser only in `components/markdown/helpers.ts`, the icon set
  only in `components/icon/constants.ts`. Setup happens once, and swapping the library touches one
  file. Do the same for the next one (dates, say).
- **Banners are the computer's.** The daemon decides when one is due (a task finished, an agent
  needs a permission or is waiting for an answer; a muted workspace sends none), exactly as it
  does for the desktop, and each one reaches the phone one of two ways
  (`features/sessions/hooks/use-banners`):
  - **Over the link, while the app is on screen.** The app asks for them
    (`LinkService.watchBanners`) and posts each as a notification of its own, except the one
    about the session that is open.
  - **Pushed, while it is not.** The app gives the daemon its push token
    (`LinkService.setPushToken`) and says when it leaves the screen (`LinkService.setAttended`).
    From then on the daemon hands banners to Expo's push service, which reaches the phone
    through Apple or Google, and the system shows them with the app closed. A phone that is put
    away is not pushed anything while someone is looking at Soromi on the computer.

  A tap on either opens the session it is about. A build without push credentials gets no token
  and simply has the first way. What is pushed is the banner's text (the workspace's name and
  what happened) and the session's id; unlike the link, it is readable by the push service.
- **A workspace can hold several repositories**: its root, the folders it is made of, the
  directories right under the root. The daemon lists them with each git status, and the Git view
  offers them (`features/git/components/repo-picker`) when there is more than one; a root that
  is no repository gives way to the first. Which is shown is kept per workspace in the
  `workspace` store, and the rule and the labels are `@soromi/core`'s, the desktop's too.
- **A workspace's terminals are the phone's own.** The Terminal view of a session's panel opens
  plain shells on the computer, as the desktop's Terminal tab does. The app names each one, keeps
  the list (in the keychain, since the shells go on running when the app is closed) and closes
  them when the phone is unpaired. The daemon keeps no list of shells, so the ones opened on the
  desktop are not shown here, nor these there.
- **Types come from `@soromi/protocol` and `@soromi/core`, never hand-written.** A message, a
  session or a chat event has one definition, generated from the daemon's.
- **Logic the desktop needs too belongs in `@soromi/core`**, not here: parsing the pairing code,
  routing daemon messages, tracking a chat's position, the model catalog, the permission modes,
  which agents a workspace can run. Core has no React and no DOM in it; keep it that way.
- Sibling files in `services/` are told apart by suffix: `link.ts`, `link.helpers.ts`,
  `link.constants.ts`, `photos.type.ts`.

### Files and imports

- **No redundant names.** A file does not repeat what its folder says:
  `features/chat/components/row.tsx`, not `chat-row.tsx`. A hyphen is only for a real compound
  (`status-dot`, `use-link-boot`).
- **A folder's main file is `index.tsx`**, never named after the folder. Suffixes that tell
  siblings apart are not redundant: `link.state.ts`, `link.state.hook.ts`.
- **Screens carry no suffix:** `screens/app/sessions.tsx`.
- **Components and screens are named arrow-function exports.** Only route files use
  `export default`.
- **Imports are grouped,** top to bottom: external packages first (React, Expo, `@soromi/*`) with
  no header, then internal ones in labelled blocks, a blank line between blocks.

  ```ts
  import { useCallback } from 'react'
  import { View } from 'react-native'

  //Components
  import { Button, Text } from '@/components'

  //Config
  import { defineStyles, useThemedStyles } from '@/config/theme'

  //Constants
  import { CONTROL } from '../constants/control'

  //Services
  import { LinkService } from '@/services/link'

  //Type
  import type { RowProps } from '../types'
  ```

  The labels in use: `//Components`, `//Config`, `//Features`, `//Constants`, `//Helpers`,
  `//Hooks`, `//Services`, `//State`, `//Styles`, `//Screens`, `//Type`. When none fits, use one
  that describes the group.
- **`@/` for imports that leave their layer, relative ones for those that stay in it.**
  `@/config/theme` from a feature; `../constants/chat` inside a feature; `../text` between
  primitives. Never a chain of `../../../`.
- **Pure logic is tested beside it:** `helpers.test.ts` next to `helpers.ts`, run with
  `pnpm --dir apps/mobile test`. Components are not unit-tested; keep what can go wrong in helpers.
- **Comments say what the code cannot:** why something is done, or what would go wrong without it.
- Formatting is Biome's, from the repo's `biome.json`.

### Checklist for a new screen

1. Add the path in `config/router`, a three-line route file in `app/`, and the screen to the
   navigator in `screens/root.tsx`.
2. Build the screen in `screens/<area>/`, and its pieces in `features/<domain>/`.
3. Each component file holds only its component and `makeStyles`, with props read as `props.x` and
   handlers as `useCallback`. Types go in `types.ts`, copy and constants in `constants/`, pure
   functions in `helpers.ts`.
4. Style with `defineStyles` and theme tokens; put text in `Text`.
5. Read state through the hooks in `states/`; send to the daemon through `LinkService`.
6. Test any new helper, then run `pnpm check:mobile` and `pnpm check`.

## What it does not do yet

- Highlight code: code blocks, files and diffs are monospace, without colours.
- Attach anything but pictures from the photo library, up to four a message and about 2 MB
  together (a message crosses the relay in one piece). No camera, no documents.
- Open a picture from a message at full size: they are drawn as tiles.
- Stage, commit or discard: the changes and their diffs are read-only, as on the desktop. Files
  can be edited and saved (up to 200,000 characters; larger ones are read-only).
- Switch a session between chat and terminal: a terminal session can be used as one (its
  Terminal tab), a chat session only as a chat. A plain shell is opened from the panel's Terminal
  view.

## What it will not do

The gear in the header opens the app's own settings (`screens/app/settings`): what is about this
phone, one section per subject. For now that is unpairing.

Setting the computer up stays on the computer. The app has no workspace settings (folders,
accounts, instructions), and does not create or remove workspaces or manage accounts: it is for
working in what is already set up there.
