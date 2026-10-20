import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deskDeleteForever,
  deskFiles,
  deskHang,
  deskInside,
  deskLeftovers,
  deskListPhones,
  deskReadFile,
  deskReport,
  deskSaveCopy,
  deskSetAside,
  deskWriteFile,
} from "../android/desk-api.js";
import { Session } from "../engine/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const session = new Session();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: "#f7f4ee",
    title: "KUI Desk",
    icon: join(here, "../../branding/icon-prompt.png"),
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(join(here, "../renderer/index.html"));
}

ipcMain.handle("run", (_e, line: string) => session.run(String(line ?? "")));
ipcMain.handle("open-url", (_e, url: string) => {
  if (url === "https://github.com/sponsors/mhaelzyi-oss") return shell.openExternal(url);
});
ipcMain.handle("phones:list", () => deskListPhones(false));
ipcMain.handle("phones:leftovers", (_e, serials: string[]) => deskLeftovers(Array.isArray(serials) ? serials.map(String) : [], false));
ipcMain.handle("phones:files", (_e, serials: string[]) => deskFiles(Array.isArray(serials) ? serials.map(String) : [], false));
ipcMain.handle("phones:inside", (_e, serial: string, path: string) => deskInside(String(serial), String(path), false));
ipcMain.handle("phones:setAside", (_e, serial: string, path: string) => deskSetAside(String(serial), String(path), false));
ipcMain.handle("phones:deleteForever", (_e, serial: string, path: string) => deskDeleteForever(String(serial), String(path), false));
ipcMain.handle("phones:saveCopy", async (e, serial: string, path: string) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const picked = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]!, {
    title: "Save a copy on this PC",
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, text: "Pick a folder on this PC." };
  return deskSaveCopy(String(serial), String(path), picked.filePaths[0], false);
});
ipcMain.handle("phones:readFile", (_e, serial: string, path: string) => deskReadFile(String(serial), String(path), false));
ipcMain.handle("phones:writeFile", (_e, serial: string, path: string, text: string) =>
  deskWriteFile(String(serial), String(path), String(text ?? ""), false),
);
ipcMain.handle("phones:hang", (_e, serial: string) => deskHang(String(serial), false));
ipcMain.handle("phones:report", (_e, serial: string) => deskReport(String(serial), false));

if (process.platform !== "win32") {
  app.exit(1);
} else {
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
