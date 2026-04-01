/** @type {import('extension').FileConfig} */
// Extension.js uses a fresh profile on every run.
// Prefer that default? Remove the profile config below.
const profile = (name) => `./dist/extension-profile-${name}`

// Firefox MV3 uses background.scripts instead of background.service_worker.
class FirefoxManifestPlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('FirefoxManifestPlugin', (compilation) => {
      const asset = compilation.assets['manifest.json']
      if (!asset) return
      const manifest = JSON.parse(asset.source())
      if (manifest.background?.service_worker) {
        manifest.background = {scripts: [manifest.background.service_worker]}
        const content = JSON.stringify(manifest, null, 2)
        compilation.assets['manifest.json'] = {
          source: () => content,
          size: () => content.length
        }
      }
    })
  }
}

export default {
  browser: {
    chrome: {profile: profile('chrome')},
    chromium: {profile: profile('chromium')},
    edge: {profile: profile('edge')},
    firefox: {profile: profile('firefox')},
    'chromium-based': {profile: profile('chromium-based')},
    'gecko-based': {profile: profile('gecko-based')}
  },
  config: (config) => {
    // Bundle the offscreen script through the same pipeline as the rest of the
    // extension so it can import shared TypeScript modules (e.g. filter-chain.ts).
    // Output key 'offscreen/scripts' → dist/offscreen/scripts.js, matching the
    // src="./scripts.js" reference in public/offscreen/index.html.
    config.entry['offscreen/scripts'] = './src/offscreen/scripts.ts'

    // For Firefox builds, patch manifest to use background.scripts.
    if (config.output?.path?.includes('/firefox/')) {
      config.plugins = config.plugins || []
      config.plugins.push(new FirefoxManifestPlugin())
    }

    return config
  }
}
