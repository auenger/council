const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const electron = require('electron');
const result = spawnSync(electron, [join(__dirname, 'native-db-smoke.cjs')], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60000
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
