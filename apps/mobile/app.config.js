const fs = require('node:fs')
const path = require('node:path')

/**
 * The app's configuration is `app.json`. This adds the one thing that cannot be written there:
 * Google's `google-services.json`, which Android needs before it can be sent a push notification.
 *
 * The file belongs to whoever builds the app (it names their Firebase project) and is not in the
 * repository. It is taken from where an EAS build puts it (`GOOGLE_SERVICES_JSON`, a file kept in
 * the EAS project), or from this folder for a build made here. With neither, the app builds
 * without it and notifies only while it is open.
 */
module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json')

  const file = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? local : null)

  if (!file) return config

  return { ...config, android: { ...config.android, googleServicesFile: file } }
}
