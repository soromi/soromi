//Constants
import { SKILLS } from './constants/skills'

//Type
import type { Skill } from '@soromi/protocol'

export const getSkillKey = (skill: Skill): string => `${skill.kind}:${skill.scope}:${skill.name}`

/** How a skill is called: `/name`. */
export const getSkillCommand = (skill: Skill): string => `${SKILLS.prefix}${skill.name}`

/** "Command · Project": what kind of thing it is, and where it is defined. */
export const getSkillOrigin = (skill: Skill): string =>
  `${SKILLS.kinds[skill.kind]} · ${SKILLS.scopes[skill.scope]}`
