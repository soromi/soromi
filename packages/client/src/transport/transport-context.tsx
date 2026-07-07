import { createContext, useContext } from 'react'

//Types
import type { Transport } from './transport'

const TransportContext = createContext<Transport | null>(null)

export const TransportProvider = TransportContext.Provider

export function useTransport(): Transport {
  const transport = useContext(TransportContext)

  if (!transport) throw new Error('useTransport must be used within a TransportProvider')

  return transport
}
