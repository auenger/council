const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve('release/win-unpacked');
function checkPE(file,machine){const b=fs.readFileSync(file),pe=b.readUInt32LE(0x3c);assert.equal(b.toString('ascii',0,2),'MZ');assert.equal(b.readUInt32LE(pe),0x4550);assert.equal(b.readUInt16LE(pe+4),machine);return {b,pe}}
const {b,pe}=checkPE(path.join(root,'Council.exe'),0x8664);checkPE(path.join(root,'resources/app.asar.unpacked/node_modules/better-sqlite3/prebuilds/win32-x64.node'),0x8664);
// Check the executable contains both icon-image and icon-group resources.
const optional=pe+24,sectionStart=optional+b.readUInt16LE(pe+20),sections=b.readUInt16LE(pe+6);const rva=b.readUInt32LE(optional+112+16);let resource;
for(let i=0;i<sections;i++){const p=sectionStart+i*40,va=b.readUInt32LE(p+12),size=b.readUInt32LE(p+8);if(rva>=va&&rva<va+size)resource=b.readUInt32LE(p+20)+rva-va}
assert.ok(resource);const types=[];for(let i=0;i<b.readUInt16LE(resource+12)+b.readUInt16LE(resource+14);i++)types.push(b.readUInt32LE(resource+16+i*8));assert.ok(types.includes(3)&&types.includes(14),'Executable must contain custom icon resources');
const archive=path.join(root,'resources/app.asar'),files=asar.listPackage(archive);assert.ok(files.includes('/out/main/db.worker.js'));assert.ok(!files.some(f=>/council\.sqlite|\/Partitions\/|\/Cookies$|\/\.env$|\/evidence\//.test(f)));
assert.deepEqual(fs.readFileSync(path.join(root,'resources/icon.png')),fs.readFileSync('build/icon.png'));
for(const file of ['out/main/index.js','out/preload/index.js','out/main/db.worker.js'])assert.deepEqual(asar.extractFile(archive,file),fs.readFileSync(file),'Packaged file differs: '+file);
const html=asar.extractFile(archive,'out/renderer/index.html').toString();const asset=html.match(/src="\.\/assets\/([^"\s]+\.js)"/)?.[1]||html.match(/src="\/assets\/([^"\s]+\.js)"/)?.[1];if(asset)assert.deepEqual(asar.extractFile(archive,'out/renderer/assets/'+asset),fs.readFileSync('out/renderer/assets/'+asset));
console.log('PASS: Windows x64 executable, SQLite DLL, icon resources, latest renderer and DB worker; no user data in package');
