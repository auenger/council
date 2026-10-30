import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { AppState } from '../shared/types'
export class StateDatabase {
  private worker: Worker
  private sequence = 0
  private failure: Error | null = null
  private exited = false
  private pending = new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
  constructor(path:string) {
    this.worker = new Worker(join(__dirname, 'db.worker.js'), {workerData:{path}})
    this.worker.on('message', ({id,value,error}) => { const p=this.pending.get(id); this.pending.delete(id); if(error) p?.reject(new Error(error)); else p?.resolve(value) })
    this.worker.on('error', error => { this.failure=error; for(const p of this.pending.values()) p.reject(error); this.pending.clear() })
    this.worker.on('exit', code => { this.exited=true; const error=this.failure || new Error(`Database worker exited (${code})`); for(const p of this.pending.values())p.reject(error);this.pending.clear() })
  }
  private call(method:string,value?:unknown):Promise<any> { if(this.failure||this.exited)return Promise.reject(this.failure||new Error('Database closed')); return new Promise((resolve,reject)=>{ const id=++this.sequence; this.pending.set(id,{resolve,reject}); this.worker.postMessage({id,method,value}) }) }
  read():Promise<AppState|null> { return this.call('read') }
  write(state:AppState):Promise<void> { return this.call('write',structuredClone(state)) }
  async close() { await this.call('close'); await this.worker.terminate() }
}
