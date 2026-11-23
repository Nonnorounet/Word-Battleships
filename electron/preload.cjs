const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wbNative', { fetchText: (url) => ipcRenderer.invoke('wb:fetchText', url) });
