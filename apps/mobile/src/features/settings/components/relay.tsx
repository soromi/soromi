import { useCallback, useEffect, useMemo, useState } from 'react'

//Components
import { Button, Input, Text } from '@/components'

//Constants
import { SETTINGS } from '../constants/settings'

//Helpers
import { getRelayDraft } from '../helpers'

//Services
import { ComputersService } from '@/services/computers'

//State
import { useLinkRelay } from '@/states/link/link.state.hook'

/**
 * The relay this phone reaches the computer in use through, when it is not on the same network,
 * as the pairing code gave it. It can be changed by hand, for a computer that moved to another
 * relay since; the phone then reaches it through that one at once.
 */
export const RelayAddress = () => {
  const relay = useLinkRelay()
  const [text, setText] = useState(relay ?? '')
  const [saved, setSaved] = useState(false)

  // Another computer brought in, or the relay saved: the box shows what is in use.
  useEffect(() => setText(relay ?? ''), [relay])

  const draft = useMemo(() => getRelayDraft(text, relay), [text, relay])
  const url = draft.url

  const handleChange = useCallback((next: string) => {
    setText(next)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!url) return
    await ComputersService.setRelay(url)
    setSaved(true)
  }, [url])

  const invalid = text.trim() !== '' && url === null

  return (
    <>
      <Text variant="bodySm" tone="body">
        {SETTINGS.relay.about}
      </Text>
      <Input
        mono
        value={text}
        placeholder={SETTINGS.relay.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onChangeText={handleChange}
      />
      {invalid && (
        <Text variant="caption" tone="danger">
          {SETTINGS.relay.invalid}
        </Text>
      )}
      {saved && !draft.changed && (
        <Text variant="caption" tone="action">
          {SETTINGS.relay.saved}
        </Text>
      )}
      <Button
        variant="secondary"
        label={SETTINGS.relay.save}
        disabled={!draft.changed}
        onPress={handleSave}
      />
    </>
  )
}
