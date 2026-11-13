'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  remotes: () => ipcRenderer.invoke('rclone:remotes'),
  lsRemote: (remote, p) => ipcRenderer.invoke('rclone:ls', remote, p),
  lsLocal: (p) => ipcRenderer.invoke('local:ls', p),
  pickLocal: (start) => ipcRenderer.invoke('local:pick', start),
  start: (o) => ipcRenderer.invoke('copy:start', o),
  cancel: () => ipcRenderer.invoke('copy:cancel'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  onCopy: (cb) => ipcRenderer.on('copy:event', (_e, d) => cb(d)),

  // conexões (assistente de configuração do rclone)
  confList: () => ipcRenderer.invoke('conf:list'),
  confProviders: () => ipcRenderer.invoke('conf:providers'),
  confProvider: (name) => ipcRenderer.invoke('conf:provider', name),
  confStep: (o) => ipcRenderer.invoke('conf:step', o),
  confCancel: (deleteName) => ipcRenderer.invoke('conf:cancel', deleteName),
  confOpen: (url) => ipcRenderer.invoke('conf:open', url),
  confDelete: (name) => ipcRenderer.invoke('conf:delete', name),
  confFingerprint: (name) => ipcRenderer.invoke('conf:fingerprint', name),
  confTest: (name) => ipcRenderer.invoke('conf:test', name),
  confImportPick: (p) => ipcRenderer.invoke('conf:import-pick', p),
  confImportApply: (o) => ipcRenderer.invoke('conf:import-apply', o),
  confExport: () => ipcRenderer.invoke('conf:export'),
  confImportClear: () => ipcRenderer.invoke('conf:import-clear'),
  onConf: (cb) => ipcRenderer.on('conf:event', (_e, d) => cb(d)),
});
