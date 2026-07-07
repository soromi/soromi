// CSS imports are handled by the consuming app's bundler; these keep the standalone typecheck happy.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.css' {}
