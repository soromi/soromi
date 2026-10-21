import { useCallback } from 'react'

//Components
import { Icon, Option, Sheet } from '@/components'

//Constants
import { CHAT } from '../constants/chat'

//Type
import type { AttachSheetProps, AttachSource } from '../types'

/** Where the next attachment comes from: the photo library, the camera, or the phone's files. */
export const AttachSheet = (props: AttachSheetProps) => {
  const onSelect = props.onSelect
  const sources = CHAT.attach.sources

  const handleSelect = useCallback((value: string) => onSelect(value as AttachSource), [onSelect])

  return (
    <Sheet visible={props.visible} title={CHAT.attach.title} onClose={props.onClose}>
      <Option
        value="library"
        label={sources.library.label}
        leading={<Icon name="image" size={20} />}
        onSelect={handleSelect}
      />
      <Option
        value="camera"
        label={sources.camera.label}
        leading={<Icon name="camera" size={20} />}
        onSelect={handleSelect}
      />
      <Option
        value="files"
        label={sources.files.label}
        hint={sources.files.hint}
        leading={<Icon name="file-text" size={20} />}
        onSelect={handleSelect}
      />
    </Sheet>
  )
}
