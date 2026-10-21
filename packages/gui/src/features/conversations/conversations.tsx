import { useEffect, useState } from 'react'

//Packages
import {
  CONVERSATION_SEARCH_MS,
  conversationAge,
  conversationQuery,
  isStaleList,
  openTabOf,
  useClientStore,
  useTransport,
} from '@soromi/client'
import { Input, cn } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

//Components
import { OverlayShell } from '@/shared/overlay-shell'
import { ProviderIcon } from '@/shared/provider-icon'

//Types
import type { PastConversation } from '@soromi/protocol'

/** How many a search found, the most a search returns, or what picking one does. */
function caption(query: string | null, found: number): string {
  if (!query) return 'Pick one to carry it on in a new tab, its history and all.'
  if (found === 0) return ''
  if (found === SEARCH_LIMIT) return `The ${found} newest that mention “${query}”`
  return found === 1 ? `1 conversation mentions “${query}”` : `${found} mention “${query}”`
}

/** The most a search returns (the daemon's limit), newest first. */
const SEARCH_LIMIT = 50

/**
 * A workspace's earlier conversations: every one its agents kept on disk for it, newest first,
 * found by name or by anything said in them. Picking one opens a tab that carries it on where it
 * stopped, with its history; one a tab already shows goes to that tab.
 */
export function Conversations({ workspace }: { workspace: string }) {
  const transport = useTransport()
  const held = useClientStore((s) => s.conversations[workspace])
  const popOverlay = useAppStore((s) => s.popOverlay)
  const selectSession = useAppStore((s) => s.selectSession)
  const [text, setText] = useState('')
  const query = conversationQuery(text)

  // The list when the screen opens, a search once the typing stops (the daemon reads every
  // conversation for one), and the same again when the link comes back.
  useEffect(() => {
    const ask = () =>
      transport.send({ type: 'list-conversations', workspace, ...(query ? { query } : {}) })
    const timer = setTimeout(ask, query ? CONVERSATION_SEARCH_MS : 0)
    const off = transport.onOpen(ask)
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [transport, workspace, query])

  const waiting = isStaleList(held, query)
  const list = held?.list ?? []
  const now = Math.floor(Date.now() / 1000)

  const pick = (conversation: PastConversation) => {
    const tab = openTabOf(conversation)
    if (tab) {
      selectSession(workspace, tab)
    } else {
      // The daemon answers `session-opened`, which brings the new tab up.
      transport.send({
        type: 'resume-conversation',
        workspace,
        conversation: conversation.id,
        agent: conversation.agent,
        account: conversation.account,
        mode: 'chat',
      })
    }
    popOverlay()
  }

  return (
    <OverlayShell title={`${workspace} · Earlier conversations`}>
      <div className="mr-2 mb-2 min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-[var(--soromi-border-subtle)] bg-[var(--soromi-bg-terminal)] [box-shadow:var(--soromi-shadow-panel)]">
        <div className="mx-auto max-w-[720px] px-7 pt-8 pb-14">
          <Input
            autoFocus
            className="rounded-[10px] bg-[var(--soromi-bg-tab)]"
            value={text}
            placeholder="Search what was said…"
            onChange={(event) => setText(event.target.value)}
          />
          <div className="mt-2 mb-4 min-h-[18px] text-[12px] text-[var(--soromi-text-faint)]">
            {waiting && held ? 'Searching…' : caption(query, list.length)}
          </div>

          {!held ? (
            <div className="py-10 text-center text-[13px] text-[var(--soromi-text-faint)]">
              Looking for this workspace’s conversations…
            </div>
          ) : list.length === 0 && !waiting ? (
            <div className="py-10 text-center text-[13px] text-[var(--soromi-text-faint)] leading-[1.55]">
              {query
                ? `No conversation here mentions “${query}”.`
                : 'No earlier conversations in this workspace yet. Each session’s conversation shows here once it has one.'}
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-col overflow-hidden rounded-[14px] border border-[var(--soromi-border)] bg-[var(--soromi-bg-sidebar)] transition-opacity',
                waiting && 'opacity-60',
              )}
            >
              {list.map((conversation) => (
                <button
                  type="button"
                  key={`${conversation.account}:${conversation.id}`}
                  onClick={() => pick(conversation)}
                  className="flex cursor-pointer appearance-none items-center gap-3 border-[var(--soromi-border-subtle)] border-x-0 border-t-0 border-b bg-transparent px-4 py-3 text-left last:border-b-0 hover:bg-[var(--soromi-bg-hover)]"
                >
                  <span className="flex-none text-[var(--soromi-text-dim)]">
                    <ProviderIcon provider={conversation.agent} size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-[14px] text-[var(--soromi-text)]">
                      {conversation.title}
                    </span>
                    {conversation.lastPrompt && (
                      <span className="truncate text-[12.5px] text-[var(--soromi-text-faint)]">
                        {conversation.lastPrompt}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-none flex-col items-end gap-0.5">
                    <span className="text-[12px] text-[var(--soromi-text-faint)] tabular-nums">
                      {conversationAge(conversation.updated, now)}
                    </span>
                    <span className="text-[11px] text-[var(--soromi-text-faint)]">
                      {openTabOf(conversation) ? 'Open in a tab' : conversation.account}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </OverlayShell>
  )
}
