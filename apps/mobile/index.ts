// The app's entry. It starts with what has to be in place before anything is drawn: the runtime
// the link's encryption needs, and what answers a notification's button with the app closed,
// which Android runs with no screen at all. Then the router, which draws the app.
import './src/config/runtime'
import './src/config/answers'
import 'expo-router/entry'
