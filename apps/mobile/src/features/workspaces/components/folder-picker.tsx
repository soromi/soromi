import { useCallback } from 'react'
import { View } from 'react-native'

//Components
import { Button, Loader, Option, Sheet, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Components
import { FolderEntry } from './folder-entry'

//Constants
import { WORKSPACES } from '../constants/workspaces'

//Helpers
import { getChildPath } from '../helpers'

//Hooks
import { useFolderBrowser } from '../hooks/use-folder-browser'

//Type
import type { FolderPickerProps } from '../types'

/**
 * The computer's folders, to pick one: where it is, the way up, the folders in it to go into, and
 * the button that picks the one shown. The phone has no file dialog of the computer's, so the
 * daemon lists them.
 */
export const FolderPicker = (props: FolderPickerProps) => {
  const styles = useThemedStyles(makeStyles)
  const browser = useFolderBrowser(props.visible)
  const listing = browser.listing
  const go = browser.go
  const onPick = props.onPick
  const copy = WORKSPACES.folders.picker

  const handleUp = useCallback((parent: string) => go(parent), [go])
  const handleUse = useCallback(() => {
    if (listing) onPick(listing.path)
  }, [listing, onPick])

  return (
    <Sheet visible={props.visible} title={copy.title} onClose={props.onClose}>
      {listing && (
        <Text variant="mono" tone="muted" numberOfLines={2} style={styles.path}>
          {listing.path}
        </Text>
      )}
      {browser.loading && (
        <View style={styles.center}>
          <Loader />
        </View>
      )}
      {listing?.parent && (
        <Option value={listing.parent} label={copy.up} hint={listing.parent} onSelect={handleUp} />
      )}
      {listing?.dirs.map((name) => (
        <FolderEntry key={name} name={name} path={getChildPath(listing.path, name)} onOpen={go} />
      ))}
      {listing && listing.dirs.length === 0 && !browser.loading && (
        <Text variant="bodySm" tone="muted" style={styles.empty}>
          {copy.empty}
        </Text>
      )}
      <View style={styles.footer}>
        <Button label={copy.use} disabled={!listing || browser.loading} onPress={handleUse} />
      </View>
    </Sheet>
  )
}

const makeStyles = defineStyles((theme) => ({
  path: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
  center: { alignItems: 'center', padding: theme.spacing.md },
  empty: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  footer: { padding: theme.spacing.md },
}))
