// 画面に渡すのは「更新トークンの保存」だけ。Node の機能は渡さない
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kkStore', {
  get: (k) => ipcRenderer.invoke('store:get', k),
  set: (k, v) => ipcRenderer.invoke('store:set', k, v),
  del: (k) => ipcRenderer.invoke('store:del', k),
});
