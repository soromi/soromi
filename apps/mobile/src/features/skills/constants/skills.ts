//Type
import type { SkillsConfig } from '../types'

export const SKILLS: SkillsConfig = {
  prefix: '/',
  kinds: {
    command: 'Command',
    skill: 'Skill',
  },
  scopes: {
    user: 'Yours',
    project: 'Project',
  },
  copy: {
    empty: 'This session has no commands or skills.',
  },
}
