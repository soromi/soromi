import { useMemo } from 'react'

//Components
import { Icon } from '@/components'

//Constants
import { FILES } from '../constants/files'

//Helpers
import { getFileIcon } from '../helpers'

//Type
import type { FileIconProps } from '../types'

/** A file's icon: its shape says what kind of file it is, its colour which type exactly. */
export const FileIcon = (props: FileIconProps) => {
  const name = props.name
  const look = useMemo(() => getFileIcon(name), [name])

  return <Icon name={look.icon} size={FILES.iconSize} color={look.color} />
}
