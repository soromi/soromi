// SVGs imported as React components (vite-plugin-svgr), configured in each consuming app.
declare module '*.svg?react' {
  import type { ComponentType, SVGProps } from 'react'
  const component: ComponentType<SVGProps<SVGSVGElement>>
  export default component
}
