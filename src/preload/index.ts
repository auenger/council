import { contextBridge, ipcRenderer } from 'electron'
import type { CouncilBridge } from '../shared/types'
const bridge: CouncilBridge = {
 platform: process.platform,
 refreshMessage: input=>ipcRenderer.invoke('council:refreshMessage',input),
 reloadProvider: input=>ipcRenderer.invoke('council:reloadProvider',input),
 nativeLayout: input=>ipcRenderer.invoke('council:nativeLayout',input),
 copyText: text => ipcRenderer.invoke('council:copyText',text),
 windowAction: action => ipcRenderer.invoke('council:windowAction', action),
 getState: () => ipcRenderer.invoke('council:getState'),
 deleteGroup: input => ipcRenderer.invoke('council:deleteGroup', input),
 saveGroup: group => ipcRenderer.invoke('council:saveGroup', group),
 saveSettings: settings => ipcRenderer.invoke('council:saveSettings', settings),
 send: input => ipcRenderer.invoke('council:send', input),
 cancel: input => ipcRenderer.invoke('council:cancel', input),
 openMessageVideo: input => ipcRenderer.invoke('council:openMessageVideo',input),
 openProvider: input => ipcRenderer.invoke('council:openProvider', input),
 reconcile: input => ipcRenderer.invoke('council:reconcile', input),
 onState: callback => { const listener = (_event:Electron.IpcRendererEvent,state:Parameters<typeof callback>[0]) => callback(state); ipcRenderer.on('council:state',listener); return () => ipcRenderer.removeListener('council:state',listener) }
}
contextBridge.exposeInMainWorld('council', bridge)
