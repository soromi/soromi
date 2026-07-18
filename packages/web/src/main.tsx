import { createRoot } from 'react-dom/client'

//Styles
import '@mantine/core/styles.css'
import '@soromi/ui/theme.css'
import '@/styles/theme.css'

//Main
import { App } from './app/App'

const root = document.getElementById('root')

if (!root) throw new Error('missing #root element')

// No StrictMode: its dev double-mount breaks the imperative xterm terminal and transport.
createRoot(root).render(<App />)
