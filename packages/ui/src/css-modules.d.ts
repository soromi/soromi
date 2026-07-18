// CSS Modules are consumed as source by each app's bundler; this only types the default import.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
