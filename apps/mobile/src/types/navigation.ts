import type { Href } from 'expo-router'

/** Every navigable path, grouped by area of the app. */
export type RouteTree = { [key: string]: Href | RouteTree }
