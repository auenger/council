const { spawnSync } = require('node:child_process');
const target = process.argv[2];
const host = { mac: 'darwin', win: 'win32' }[target];
if (!host || (target==='mac' && process.platform!=='darwin')) {
  console.error('mac requires macOS; supported targets are mac and win.');process.exit(1);
}
if(target==='win'){
  // better-sqlite3 13 ships N-API prebuilds for Windows, independent of Electron ABI.
  // Fail before packaging if the actual target DLL is absent or the wrong architecture.
  const fs=require('node:fs'),path=require('node:path');
  const arch=process.argv.includes('--arm64')?'arm64':'x64';
  const binary=fs.readFileSync(path.join(path.dirname(require.resolve('better-sqlite3/package.json')),'prebuilds',`win32-${arch}.node`));
  const pe=binary.readUInt32LE(0x3c);
  if(binary.toString('ascii',0,2)!=='MZ'||binary.readUInt32LE(pe)!==0x4550||binary.readUInt16LE(pe+4)!==(arch==='arm64'?0xaa64:0x8664))throw Error('Invalid Windows SQLite prebuild');
}
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
// Local unsigned builds never use inherited signing credentials.
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete env[key];
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--' + target,
  ...process.argv.slice(3), ...(target==='win'?['-c.npmRebuild=false']:[]), '--publish', 'never'], { stdio: 'inherit', env });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
