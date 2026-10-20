const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kui", {
  run: (line) => ipcRenderer.invoke("run", line),
  open: (url) => ipcRenderer.invoke("open-url", url),
  listPhones: () => ipcRenderer.invoke("phones:list"),
  leftovers: (serials) => ipcRenderer.invoke("phones:leftovers", serials),
  files: (serials) => ipcRenderer.invoke("phones:files", serials),
  inside: (serial, path) => ipcRenderer.invoke("phones:inside", serial, path),
  setAside: (serial, path) => ipcRenderer.invoke("phones:setAside", serial, path),
  deleteForever: (serial, path) => ipcRenderer.invoke("phones:deleteForever", serial, path),
  saveCopy: (serial, path) => ipcRenderer.invoke("phones:saveCopy", serial, path),
  readFile: (serial, path) => ipcRenderer.invoke("phones:readFile", serial, path),
  writeFile: (serial, path, text) => ipcRenderer.invoke("phones:writeFile", serial, path, text),
  hangPhone: (serial) => ipcRenderer.invoke("phones:hang", serial),
  reportPhone: (serial) => ipcRenderer.invoke("phones:report", serial),
});
