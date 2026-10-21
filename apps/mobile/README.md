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

Builds run on [EAS](https://docs.expo.dev/build/introduction/), started by hand with the `eas`
command from this folder (there are no package scripts for them), and both Android profiles in
`eas.json` produce an **APK** (a file you can install directly), not the bundle the Play Store
takes.

```bash
cd apps/mobile
eas build --platform android --profile production   # the production build
eas build --platform android --profile preview      # the same build, with a link to install it from
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

### iOS and iPadOS

One app for iPhone and iPad (`supportsTablet`), signed by EAS with the Apple developer account it
is given the first time: it creates the certificate, the provisioning profile and the push key.

```bash
cd apps/mobile
eas build --platform ios --profile preview      # a build to install on your own devices
eas build --platform ios --profile production   # for TestFlight and the App Store
```

- **A preview build only installs on devices Apple has been told about.** Register each iPhone
  or iPad once, before building: `eas device:create` (run in this folder) gives a link to open
  on the device. A device added later needs a new build.
- **A production build** is for TestFlight: `eas submit --platform ios` uploads it. Apple then
  asks whether the app uses encryption, which it does (the link to the computer is end-to-end
  encrypted), so answer that for the account rather than have a setting here answer it.
- The first time the app reaches the computer over the local network, iOS asks for permission
  ("find devices on local networks"). Refused, the app still works, through the relay.

### Push notifications

The app is told of a finished task two ways: over its link while it is open, and by a push
notification while it is closed or behind another app. The second needs credentials, and they are
**not in this repository**: they name a Firebase project and an Apple developer account, so each
project that builds the app brings its own. Without them the app builds and works, and notifies
only while it is open.

**Android** needs Firebase, because Google only delivers to an app registered there:

1. In the [Firebase console](https://console.firebase.google.com), create a project and add an
   Android app with the package name in `app.json` (`dev.soromi.app`, or yours if you changed
   it).
2. Download its `google-services.json` into this folder. It is git-ignored; `app.config.js` picks
   it up when it is there.
3. Give it to EAS as a file, since a cloud build does not see ignored files:

   ```bash
   eas env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
     --environment production --environment preview --visibility secret
   ```

4. In the Firebase project's settings, under Service accounts, generate a private key, and hand it
   to EAS for sending: `eas credentials` → Android → Google Service Account → FCM V1. That key is
   a secret: keep it out of the repository.

**iOS and iPadOS** need no Firebase and no file. They need an Apple push key, which the first
`eas build --platform ios` offers to create on the Apple developer account (or `eas credentials`
at any time). Push needs a real device: the simulator gets none.

Pushes are sent by the daemon on the user's computer, straight to Expo's push service, which
passes them to Apple or Google with the credentials above; nothing of ours sits in between. The
daemon needs no setup for it: the phone hands it a token when it connects.

## Patterns

### Folder layout

`src/` is thin, single-purpose layers. There is no `shared/` or `utils/` bucket: a layer is named
for what it holds.

```
index.ts                 the entry: runtime setup and the background answers, then the router
modules/                 the app's own native code (Expo modules), linked into every build
src/
├─ app/                  routes only (Expo Router): each file exports a screen, nothing else
├─ screens/              one file per screen, grouped by area of the app; shared/, what more than
│                        one screen is built from; plus root.tsx, the navigator
├─ features/<domain>/    components/ hooks/ constants/ types.ts helpers.ts
├─ components/           hand-built UI primitives, one folder each; index.ts is the one barrel
├─ config/               app.ts (settings, read once), router/ (every path), theme/, runtime.ts,
│                        answers.ts
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
| `features/` | One folder per domain (`sessions`, `chat`, `conversations`, `usage`, `terminal`, `files`, `git`, `skills`, `panel`, `settings`, `pairing`, `workspaces`, `layout`). Its components, hooks, constants, types and pure helpers. No stores and no services live here. |
| `components/` | Primitives built on `StyleSheet`: `Text`, `Button`, `IconButton`, `Icon`, `Chip`, `Input`, `Option`, `Sheet`, `Card`, `ActionRow`, `Backdrop`, `Segmented`, `Switch`, `KeyboardView`, `Loader`, `Logo`, `Markdown`, `Highlight`, `Picture`, `PictureViewer`, `ProviderMark`, `ResizeHandle`, `StatusDot`, `SystemBars`, `Terminal`, `WorkingMark`. They know nothing about sessions or the daemon. |
| `config/` | How the app is wired: settings, routes, the theme, runtime setup, and what the entry sets up before anything is drawn (`answers.ts`). |
| `services/` | The transport to the daemon (`link.ts`), the computers the phone is paired with (`computers.ts`), the keychain (`keychain.ts`), the photo library and the camera (`photos.ts`), the phone's files (`documents.ts`), the clipboard (`clipboard.ts`), network changes (`network.ts`), the phone's notifications (`notifications.ts`), the answers given from them (`answers.ts`), time to finish in the background (`background.ts`), keeping the screen on (`screen.ts`) and what the phone is called (`device.ts`). |
| `modules/` | Native code of the app's own, as Expo modules, which autolinking finds there: `background-time` (iOS), the time an answer needs to be sent with the app out of sight. A change in it needs a new build. |
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
| 768 and up (`wide`) | The sessions keep a column of their own at the left (`screens/shared/sidebar`), and the stack is what is open beside it. A session draws its own top row (`ScreenHeader`: title at the left, the panel's icons at the right) in place of the navigator's header, and its panel is a pane at the right, the height of the screen, that slides over the conversation. |
| 1100 and up (`docked`) | The panel sits beside the conversation instead of over it. |

- **The columns of a wide screen share one top row.** The sessions', a session's and its panel's
  are all `layout.header` tall, below the status bar, so the panel opens with its icons on the
  line where the session's were, as on the desktop.
- **Never branch on the platform or the device type for layout.** A large phone on its side is
  wide; a tablet sharing its screen with another app is not.
- **The navigator keeps its place in the tree** whichever layout is on (`screens/root.tsx`), so
  turning the device does not start the navigation over. A layout change adds or removes what is
  around the stack, never the stack.
- **What a phone shows as a screen and a tablet as a pane is written once**, in `screens/shared/`
  (`panel-body`), and used by both.
- **A phone's home is two levels: the workspaces, then one workspace.** The home
  (`features/sessions/components/workspaces`) starts with what needs the person, from every
  workspace (`getAttention`: a session stuck, waiting for an answer, or finished and not looked at,
  the stuck first), then the workspaces, one row each: its name, how many sessions it has, and how
  many are at work or finished. A tap opens the workspace's screen (`screens/app/workspace`): what
  can be done in it at the top, on one card (start a session, carry on an earlier conversation,
  its usage), then its sessions, as rows or as cards, switched from its header and kept in
  `preferences`, with its settings beside the switch. The cards are as many to a row as fit
  (`useLayout().columns`).
- **The sessions column of a wide screen is the desktop's sidebar instead**: every workspace with
  its sessions under it, only the first open to start with; a tap on a workspace's name opens or
  folds it, and that holds for as long as the app runs. Its heading starts a session (the plus)
  and offers the rest from its dots (`WorkspaceMenu`: earlier conversations, usage, settings).
- **Screens do not slide in the wide layout.** There a screen takes the place of the one before
  it, as a pane does, and swapping the top screen while an earlier swap was still animating left
  Android showing both. The animation is chosen in `screens/root.tsx` by the layout.
- **Going to a session** is `useOpenSession()`, which knows that beside the sessions column a
  session takes the place of the one open rather than stacking on it.
- **Reading widths are capped**: a conversation's column (`layout.column`) and a sheet
  (`layout.sheet`) stop growing and sit in the middle.
- **The sessions column and a session's panel are dragged wider or narrower** by their inner
  edge, as on the desktop (`ResizeHandle`, `hooks/use-resizable`). While the edge moves only the
  column's width changes, as an animated value, so nothing is drawn again; when it is let go the
  width goes into `preferences` (`columns`), and the keychain keeps it. The limits follow the
  window (`layout.resize`): the column takes at most a share of it, and a docked panel leaves the
  conversation room to read. A screen reader moves an edge a step at a time.

### Styling

- **Theme tokens only.** Colours, spacing, radii and type styles come from `config/theme`
  (`theme.surface.raised`, `theme.spacing.md`, `theme.borderRadius.lg`). No hex colour and no
  spacing token is written anywhere else. `primitives` holds the raw palettes, one per
  appearance; styles use the semantic names, which each appearance fills (`darkTheme`,
  `lightTheme`). Two things are not styling and keep their own colours: artwork (a provider's
  mark, in `components/provider-mark/constants.ts`) and data (a file type's colour, which comes
  from `@soromi/core` with the type and is handed to `Icon` as `color`).
- **Two appearances, light and dark**, as the desktop's. Settings has the choice (System, Light,
  Dark; `preferences.appearance`, kept in the keychain), System following the phone's own setting
  as it changes. `ThemeProvider` resolves it and every style made with `useThemedStyles` follows;
  the status bar (`SystemBars`) and the keyboard take its light or dark. A terminal stays dark in
  both (`theme.terminal`): what programs print is coloured for a dark background.
- **Icons go through `Icon`**, by name and in a text tone (`<Icon name="folder" tone="action" />`).
  A new one is added to `components/icon`, imported on its own path so the bundle carries only
  the icons in use. An action that is an icon alone is an `IconButton`, which requires the `label`
  a screen reader says.
- **What goes at the right of a header goes through `getHeaderActions`**
  (`features/layout/helpers`), never straight into `headerRight`. iOS 26 puts anything in a
  navigation bar on a pane of glass and morphs it between screens; the helper hands our buttons
  over as items that ask for none. It is the one place that looks at the platform, and it is
  about a system API, not about layout.
- **A screen's title goes through `getHeaderTitle`** (`features/layout/helpers`), never straight
  into `title`. Android's toolbar would set it in a large type of its own, far to the right of the
  back arrow; there the helper hands over an empty native title and draws ours (`HeaderTitle`, the
  type the wide layout's header uses) next to the arrow. iOS keeps its native title.
- **A session's panel is reached by its views' icons** (`features/panel/components/tabs`): files,
  skills, changes, terminals. They sit in the session's header, where each opens the panel on
  that view, and at the top of the panel, where they move between views; never both at once.
- **A choice among a few is a `Chip` that opens a `Sheet` of `Option`s** (the model, the permission
  mode, the account), each picker keeping its own open state. In a form it is a field instead
  (`ChoiceField` in `features/workspaces`): the height of a text box, its value and a chevron.
- **Controls share heights** (`theme.control`): a button, a text box, a form's picker and a row of
  a settings card are `md` (44), a small button `sm` (36). Set the height from there, never from
  padding alone, so what sits together lines up.
- **Settings are cards of rows** (`Card` and `ActionRow` from `components/`, `Field` and
  `SwitchRow` from `features/workspaces`): a label above, the rows on one card with a hairline between them, and a line under
  it on what it does. A screen with several parts splits them into tabs (`Segmented`), as a
  workspace's settings do (General, Agents, Advanced); what is edited there is saved from a bar
  that shows only while something has changed.
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
  `services/network.ts`, the notifications module only in `services/notifications.ts`, keeping the screen on only in `services/screen.ts`, the document picker and the file system only in `services/documents.ts`, the status bar only in `components/system-bars`, the device module only in `services/device.ts`, the web view only in `components/terminal/index.tsx`, the markdown parser only in `components/markdown/helpers.ts`, the code highlighter (highlight.js) only in `components/highlight/helpers.ts`, the icon set
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
    away is not pushed anything while someone is looking at Soromi on the computer, unless the
    phone is where the person is: it drives the sessions, or did when it was put away and nobody
    at the computer has acted since. Then the computer stays quiet and the phone is pushed.
    Android needs the Firebase service-account key (FCM V1) in the EAS project's credentials for
    Expo to reach Google; without it every push to Android is refused.

  A tap on either opens the session it is about. A banner about a tool request (an agent in a
  chat session asking to run or edit something) says what it asks and has **Allow** and **Deny**
  buttons (the `approval` category, `NotificationService.setup`), which answer it **without the
  app coming up** (`services/answers.ts`). iOS asks for the phone to be unlocked first, then
  starts the app out of sight, and the press arrives as a tap does; the app's native module asks
  iOS for the half minute it needs before it is suspended. Android runs the press in a task of
  the app's, with no screen when the app is closed (`NotificationService.onBackgroundAnswer`,
  set up from the entry). The answer goes over the app's link when it is using the computer that
  asked (`LinkService.sendConfirmed`, waiting for the link an app that is only starting makes),
  and otherwise over a link made for it alone (`LinkService.sendOnce`), never both: through the
  relay a second link of the phone's takes the computer from the first. It counts as sent once
  the daemon answers a round trip timed after it; then the banner goes, and if it could not be
  sent, a banner saying so takes its place and opens the session. Any device may answer, without
  taking control: the first answer is the one taken. A build without push credentials gets no token
  and simply has the first way. What is pushed is the banner's text (the workspace's name and
  what happened) and the session's id; unlike the link, it is readable by the push service.
- **The phone names itself.** It says what it is called when it connects (`hello`'s
  `deviceName`): the name its owner gave it (Android's "Device name"), else its model, since iOS
  answers only "iPhone" (`toDeviceName`). The computer lists it under that name and shows it
  driving under it; pairing no longer asks for one.
- **The phone can be paired with several computers**, one in use at a time
  (`services/computers.ts`). The keychain keeps them all (`computers`), which one is in use, and
  each one's direct routes; a phone paired by an older build has its one pairing moved into the
  list. The home's title is the computer in use, by the name it gives (`ComputerSwitcher`): a tap
  lists the others and offers to pair one more, and a scanned code adds a computer rather than
  replacing the one there. Moving to another clears what the stores held and connects to it.
  Every computer keeps pushing banners to the phone, each naming the phone's id on it
  (`device`), so a tap on one from a computer not in use brings that one in first. Unpairing
  forgets the computer in use and goes on with the next.
- **Settings say which computer this is and how good the link to it is.** The computer's name,
  system, Soromi release and what runs its daemon (`host.launcher`: the desktop app, a terminal or
  a service) come from its answer to `hello`, kept in `DaemonStore` as `host`, where a feature
  that only makes sense on one kind of computer can check it. The Connection section is live
  while it is on screen: status, route, the latest round trip with a grade (good up to 150 ms,
  fair up to 400 ms, on the average), its average, how long the link has been up and how often it
  dropped. Round trips are timed by `@soromi/core`'s transport (`onLatency`, `measure`) and kept
  in the `link` store; nothing of it is sent anywhere.
- **The relay can be changed by hand** (`features/settings/components/relay`), for the computer in
  use: a pairing code carries the relay it was made with, and a computer that moved to another
  (Settings → Remote on it) is not reached through the old one. The address is checked as one
  (`getRelayDraft`: `wss://` or `ws://`, a host, no space), kept in the computer's pairing in the
  keychain, and dialed at once (`ComputersService.setRelay`), without leaving the computer: what
  the stores hold stays.
- **A background agent's own work can be read** (`screens/app/agent`): a tap on one in the
  "agents working" list opens its log, its prompt, tool calls and replies drawn as a conversation
  is (`toRows`), followed live while the screen is on top (`useAgentLog` sends `watch-agent`, and
  again when the link comes back). The daemon sends the latest 200 events of it and what follows,
  without pictures and with long tool output cut, so it fits through the relay.
- **A message written while the agent works is queued**, not sent into the turn
  (`features/chat/components/queue`). The computer holds the queue (`chat-queue`), so the desktop
  shows the same one and it goes on with the phone put away: each message is sent as a turn of its
  own once the one before it ends. One can be sent at once, which steers the running turn, or
  taken out (`chat-unqueue`). Stopping the agent holds the queue until the next message is sent.
- **A workspace's earlier conversations can be carried on** (`screens/app/conversations`), from
  its screen's actions (or its dots in the sessions column): every conversation its agents kept on the computer for it, newest
  first, searched by anything said in them (the computer reads them; the search waits for the
  typing to stop). A tap opens a session on it, its history shown (`resume-conversation`); one a
  session already shows opens that session. For now that is Claude's conversations.
- **A workspace's plan usage is shown where it is used**: among its screen's actions
  (`features/sessions/components/usage`), and in a line under a chat's box, as the desktop's status
  bar has it (`features/usage/components/line`). Both show each agent's mark and the percent of its
  five-hour window, amber from 75% and red from 90% (`usageLevel`, `@soromi/core`'s, as are the
  names, the resets and the plan pages); the line adds when the first window resets. The action
  opens the usage screen (`screens/app/usage`), the line a sheet over the chat (`UsageSheet`):
  each window as a bar, when it rolls over, the plan, and the agent's plan page in the browser.
  The computer reads it from the accounts the workspace's sessions run under and keeps a reading
  for a quarter of an hour; the phone asks again that often while it is shown, and a pull, the
  screen's header button or the sheet's has it read afresh (`hooks/use-usage`, shared by all).
  Neither is there until a reading has something in it: a workspace with no sessions has no
  agents to read.
- **A terminal is renamed with a long press on its tab** (`features/terminal`), for every device:
  the computer keeps the names, as it keeps the list.
- **The screen stays on while an agent works in the conversation on it**
  (`features/chat/hooks/use-screen-on`), so a turn can be followed without touching the phone.
  Leaving the conversation (another screen, the home, another app) or the turn ending lets it dim
  as usual; nothing is held in the background, where the system would not allow it anyway.
- **Code is coloured as the desktop colours it** (`components/highlight`): a message's code blocks
  in the palette of the desktop's chat (GitHub Dark, or GitHub Light), a file in the palette of its
  file viewer, colour for colour, both in `theme.syntax`. The language is the one a block names, or a file's
  extension (`Dockerfile` and a few others by their name). The phone tokenizes with highlight.js,
  which runs anywhere JavaScript does, rather than the desktop's own highlighters, so a few pieces
  of code may be told apart differently; the colours are the same. Code over 256 KB is drawn plain.
- **What goes with a message** is up to four pictures and files together, about 2 MB (a message
  crosses the relay in one piece), from the paperclip's sheet (`AttachSheet`): the photo library,
  the camera, or the phone's files. A file is sent as the agent reads it (`toDocumentType`): a PDF
  or a picture as itself, text as text, known by its type or by its name (`main.rs`); anything
  else is left out, and the user is told. It shows in the box as a tile with its name, and in the
  conversation as a line with it.
- **A picture in the conversation opens at full size** with a tap (`PictureViewer`): pinched to
  grow it up to 4×, dragged to look around it, double-tapped to zoom in and out.
- **A session is switched between chat and terminal** from its long-press menu, as the desktop's
  toggle does (`switch-mode`): the computer restarts it in the other mode, and the conversation
  carries on.
- **A session says how long ago it changed** ("Finished · 2h ago"; `getSessionLine`), from the
  time the computer sends with it (`updated`, set when its status last changed). One at work says
  only what it is doing. The lists count from a clock that moves on every minute (`useClock`).
- **Pictures come as base64 and are drawn by `Picture`**: an open file that is an image (any
  kind the platform decodes, and SVG, which is rendered), and what a tool returned (a screenshot
  the agent read, shown large in its tool row). The computer sends a phone pictures of up to
  2 MB, which is what fits through the relay; a larger one says so.
- **A workspace can hold several repositories**: its root, the folders it is made of, the
  directories right under the root. The daemon lists them with each git status, and the Git view
  offers them (`features/git/components/repo-picker`) when there is more than one; a root that
  is no repository gives way to the first. Which is shown is kept per workspace in the
  `workspace` store, and the rule and the labels are `@soromi/core`'s, the desktop's too.
- **A workspace's terminals are the same on every device.** The Terminal view of a session's
  panel shows the plain shells on the computer, as the desktop's Terminal tab does, and they are
  the same ones: the daemon keeps the list (`workspace.shells`) and names each shell, so one
  opened, renamed or closed on the desktop is opened, renamed or closed here, and the reverse. A
  shell that exits (`exit`) closes everywhere, and they all end with the daemon. Which one is on
  screen is each device's own (`workspace` store). Unpairing closes the shells this phone opened
  (`openedBy`) only on a computer with nobody at it, a daemon started from a terminal or as a
  service; on the desktop app's computer they are the desktop's to close.
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

- Stage, commit or discard: the changes and their diffs are read-only, as on the desktop. Files
  can be edited and saved (up to 200,000 characters; larger ones are read-only).

## What it will not do

The gear in the header opens the app's own settings (`screens/app/settings`): what is about this
phone, one section per subject: the computer (and unpairing), the connection, the appearance, and
the relay the phone reaches the computer through.

A workspace is set up from here as on the desktop (`features/workspaces`): the plus in the home's
header creates one (folders picked from the computer's, an agent and an account, or a folder's own
`soromi.space.json`), and the gear on a workspace's screen (or its dots in the sessions column)
opens its settings (name, folders, the
accounts each agent runs under, instructions, notifications, export, remove). The phone has no file
dialog of the computer's, so the daemon lists its folders (`browse-folders`). The rules and the
messages are `@soromi/core`'s (`createSpaceMessage`, `updateSpaceMessage`), the desktop's too.

The app-wide settings stay on the desktop: account profiles, the relay and direct route,
keep-awake, paired devices, updates. The phone's own settings are about the phone.
