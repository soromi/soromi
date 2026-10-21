//Type
import type { WorkspacesConfig } from '../types'

export const WORKSPACES: WorkspacesConfig = {
  open: {
    create: 'New workspace',
    settings: 'Workspace settings',
  },
  create: {
    title: 'New workspace',
    about:
      'Pick one or more folders on the computer, and the agent that works in them. Nothing is written to the folders.',
    name: 'Name',
    namePlaceholder: 'Named after its folder',
    folders: 'Folders',
    agent: 'Agent',
    account: 'Account',
    submit: 'Create workspace',
    pending: 'Creating…',
    importFile: 'Use its soromi.space.json',
    importHint: 'This folder describes a workspace of its own: its folders, agents and accounts.',
  },
  folders: {
    add: 'Add folder',
    none: 'No folder yet.',
    remove: 'Remove this folder',
    picker: {
      title: 'Choose a folder',
      up: 'Up one folder',
      use: 'Use this folder',
      empty: 'No folders in here.',
      loading: 'Looking…',
      enter: 'Open this folder',
    },
  },
  settings: {
    title: 'Workspace settings',
    tabs: [
      { id: 'general', label: 'General' },
      { id: 'agents', label: 'Agents' },
      { id: 'advanced', label: 'Advanced' },
    ],
    name: 'Name',
    folders: 'Folders',
    foldersHint:
      'Sessions keep the folders they started with. New sessions get the folders set here.',
    agents: 'Agent accounts',
    agentsHint:
      'New sessions run under an agent’s default account. Remove it to make the next one the default.',
    defaultAccount: 'Default',
    addAccount: 'Add account',
    removeAccount: 'Remove this account',
    instructions: 'Instructions',
    instructionsHint: 'Added to what every agent in this workspace is told, in new sessions.',
    instructionsPlaceholder: 'e.g. This is a monorepo. Prefer pnpm.',
    notifications: 'Notifications',
    notify: 'Notify me',
    notifyHint: 'A banner when a session here finishes or needs you.',
    unsaved: 'Unsaved changes',
    discard: 'Discard',
    save: 'Save',
    pending: 'Saving…',
    share: 'Share',
    export: 'Export soromi.space.json',
    exportHint: 'Writes this workspace to a file in its folder, to commit and share.',
    exported: (path) => `Written to ${path}`,
    danger: 'Danger zone',
    remove: 'Remove workspace',
    removeHint: 'Its sessions are closed. Its folders and files stay where they are.',
    confirm: {
      title: 'Remove this workspace?',
      message: 'Its sessions are closed. Its folders and files are left where they are.',
      cancel: 'Cancel',
      confirm: 'Remove',
    },
    missing: 'This workspace is not on the computer any more.',
  },
}
