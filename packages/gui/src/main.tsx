import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

//Styles
import '@mantine/core/styles.css'
import '@/styles/theme.css'

//Main
import { App } from './app/App'

const root = document.getElementById('root')

if (!root) throw new Error('missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
