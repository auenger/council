import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
const db = new Database(workerData.path)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = FULL')
db.exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
parentPort?.on('message', ({ id, method, value }) => {
  try {
    if (method === 'read') {
      const row = db.prepare('SELECT value FROM app_state WHERE id=1').get() as {value:string}|undefined
      parentPort?.postMessage({id, value: row ? JSON.parse(row.value) : null})
    } else if (method === 'write') {
      db.prepare('INSERT INTO app_state (id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value))
      parentPort?.postMessage({id, value:true})
    } else if (method === 'close') { db.close(); parentPort?.postMessage({id,value:true}); parentPort?.close() }
  } catch (error) { parentPort?.postMessage({id,error: error instanceof Error ? error.message : 'Database error'}) }
})
