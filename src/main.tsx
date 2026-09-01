import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { writeAppManifest } from './lib/appManifest'
import { BUS_VERSION } from './lib/sharedBus'
import { getVersion as getMistlibVersion } from './vendor/mistlib/wrappers/web/index.js'

void getMistlibVersion()
  .then((version) => console.log(`[tc-translate] mistlib ${version}`))
  .catch((error) => console.warn('[tc-translate] failed to read mistlib version', error))

render(<App />, document.getElementById('app')!)

writeAppManifest({
  app: 'tc-translate',
  busVersion: BUS_VERSION,
  publishes: ['translations-inbox', 'lingo-card-inbox'],
  consumes: [],
  reads: [],
})
