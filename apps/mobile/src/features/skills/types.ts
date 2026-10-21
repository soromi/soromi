import type { Skill } from '@soromi/protocol'

export type RowProps = {
  session: string
  skill: Skill
  /** Whether picking it can put it in a message: only a chat session has a message box. */
  usable: boolean
}

export type ListProps = {
  session: string
  /** Whether picking one can put it in a message: only a chat session has a message box. */
  usable: boolean
}

export type SkillsConfig = {
  /** What a skill or command is called with. */
  prefix: string
  kinds: Record<Skill['kind'], string>
  scopes: Record<Skill['scope'], string>
  copy: {
    empty: string
  }
}
