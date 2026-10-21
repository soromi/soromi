import { useMemo } from 'react'

//Components
import { Stat } from './stat'

//Constants
import { SETTINGS } from '../constants/settings'

//Helpers
import { formatDuration, getLatencySummary } from '../helpers'

//Hooks
import { useConnectionProbe } from '../hooks/use-connection-probe'

//State
import { useLinkQuality, useLinkRoute, useLinkStatus } from '@/states/link/link.state.hook'

/**
 * How good the link to the computer is, live: whether it is up, which way it goes, how long a
 * round trip takes and how that feels, how long it has been up and how often it dropped. Nothing
 * of it leaves the phone.
 */
export const ConnectionStats = () => {
  const status = useLinkStatus()
  const route = useLinkRoute()
  const quality = useLinkQuality()
  const online = status === 'online'
  const copy = SETTINGS.connection

  useConnectionProbe(online)

  const latency = useMemo(() => getLatencySummary(quality.samples), [quality.samples])
  // Worked out on every render; the probe brings one every few seconds while the view is open.
  const since = quality.since === null ? copy.unknown : formatDuration(Date.now() - quality.since)

  return (
    <>
      <Stat
        label={copy.labels.status}
        value={copy.status[status]}
        tone={online ? 'action' : 'warn'}
      />
      <Stat label={copy.labels.route} value={route ? copy.route[route] : copy.unknown} />
      <Stat
        label={copy.labels.latency}
        value={latency ? copy.latency(latency.last, copy.grade[latency.grade]) : copy.unknown}
        tone={latency ? copy.gradeTone[latency.grade] : 'body'}
      />
      <Stat
        label={copy.labels.average}
        value={latency ? copy.average(latency.average, quality.samples.length) : copy.unknown}
      />
      <Stat label={copy.labels.since} value={since} />
      <Stat label={copy.labels.drops} value={copy.drops(quality.drops)} />
    </>
  )
}
