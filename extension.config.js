/** @type {import('extension').FileConfig} */
// Extension.js uses a fresh profile on every run.
// Prefer that default? Remove the profile config below.
const profile = (name) => `./dist/extension-profile-${name}`

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
    return config
  }
}
