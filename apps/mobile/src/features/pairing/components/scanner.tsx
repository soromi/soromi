import { CameraView, useCameraPermissions } from 'expo-camera'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'

//Components
import { Button, Text } from '@/components'

//Config
import { defineStyles, useThemedStyles } from '@/config/theme'

//Constants
import { PAIRING } from '../constants/pairing'

//Type
import type { BarcodeScanningResult } from 'expo-camera'
import type { ScannerProps } from '../types'

/** The camera, looking for a pairing code; or, until it is allowed, the request to use it. */
export const Scanner = (props: ScannerProps) => {
  const styles = useThemedStyles(makeStyles)
  const [permission, requestPermission] = useCameraPermissions()
  const onScan = props.onScan

  const handleScanned = useCallback(
    (result: BarcodeScanningResult) => onScan(result.data),
    [onScan],
  )

  const handleAllow = useCallback(() => void requestPermission(), [requestPermission])

  return (
    <View style={styles.frame}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={PAIRING.camera.barcode}
          onBarcodeScanned={handleScanned}
        />
      ) : (
        <View style={styles.off}>
          <Text variant="bodySm" tone="muted" style={styles.prompt}>
            {PAIRING.camera.prompt}
          </Text>
          <Button label={PAIRING.camera.allow} onPress={handleAllow} />
        </View>
      )}
    </View>
  )
}

const makeStyles = defineStyles((theme) => ({
  frame: {
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.border.default,
    backgroundColor: theme.surface.sunken,
  },
  off: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  prompt: { textAlign: 'center' },
}))
