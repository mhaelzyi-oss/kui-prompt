# KUI Desk

This computer and the phones you plug in. Hang or crash dump on this PC. Leftover app folders on phones you authorize. English plus evidence. Nothing is uploaded.

Krypton Ultimate Inc II. MIT.

## Install

Windows installer (after `npm run dist:win`): run `release/KUI Desk Setup 0.1.0.exe`. Portable: `release/KUI Desk Portable 0.1.0.exe`. First launch asks you to acknowledge the TERMS file.

```bash
npm install
npm test
npm run build
npm run dist:win
```

Terminal:

```bash
npm run cli
npm run cli -- help
npm run cli -- list
```

Window:

```bash
npm start
```

## This PC

help, list, focus, status, handles, who-has, stacks, dump, hang, report, save, quit.

`hang` is the first job. Focus a process Windows will open, or `dump open <file.dmp>` with no live process. `handles`, `who-has`, and `stacks` print the rows in the prompt.

## Phones

Tabs: This PC, Phones, Tips. On Phones: Leftovers, Files, Debug.

Every authorized phone from `adb devices -l` shows as a chip. Select one or several. Actions apply to each selected ready phone. Unauthorized phones say to accept the RSA prompt.

Leftovers are app folders still on the phone under `/storage/emulated/0/Android/{data,obb,media}` after the app is gone, including hidden `.<package>` names. Cache and `.thumbnails` are never leftover. Set aside moves a leftover. Delete forever is only from set aside, with two confirms. Save a copy pulls files onto this PC. Edit writes a small leftover, set-aside, or copy text file back to that phone. Root is not required.

## Tips

Optional. $5, $9, or $19 via [GitHub Sponsors](https://github.com/sponsors/mhaelzyi-oss). The window has a Tips wall. There is no cart and no paid debugger SKU.

## Not this

Kernel debugging, time travel, decompilers, unknown-binary reverse engineering, cheats, DRM, protected processes.
