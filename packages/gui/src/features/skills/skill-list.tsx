import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

//Packages
import { useClientStore, useTransport } from '@soromi/client'
import { SkillList as SkillListView } from '@soromi/ui'

//Store
import { useAppStore } from '@/stores/app-store'

/**
 * The active session's slash commands and skills. Wires the store + transport to the shared
 * presentational list; clicking a card types `/name ` into the terminal (it does not run), so you
 * can add arguments and press Enter yourself.
 */
export function SkillList() {
  const transport = useTransport()
  const { active, activeSession } = useAppStore(
    useShallow((s) => ({ active: s.active, activeSession: s.activeSession })),
  )
  const skills = useClientStore((s) => s.skills)
  const session = active ? activeSession[active] : undefined
  const list = session ? skills[session] : undefined

  // Refresh when the active session changes.
  useEffect(() => {
    if (session) transport.send({ type: 'list-skills', session })
  }, [session, transport])

  if (!session) return null

  const insert = (name: string) => {
    transport.send({ type: 'input', session, data: `/${name} ` })
  }

  return <SkillListView skills={list} onInsert={insert} />
}
