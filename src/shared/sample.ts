import { androidRoot, type PhoneChip, type PhoneItem } from "./leftovers-core.js";

export const SAMPLE_PHONES: PhoneChip[] = [
  { serial: "R58M36ABC", state: "device", model: "Pixel 6", product: "oriole" },
  { serial: "34120D7A8B9C", state: "device", model: "Pixel 7", product: "panther" },
];

export const SAMPLE_ITEMS: PhoneItem[] = [
  {
    serial: "R58M36ABC",
    path: `${androidRoot("data")}/com.example.old`,
    name: "com.example.old",
    packageName: "com.example.old",
    root: "data",
    kind: "leftover",
    hidden: false,
    directory: true,
    reason: "The app is gone.",
  },
  {
    serial: "R58M36ABC",
    path: `${androidRoot("media")}/.com.example.old`,
    name: ".com.example.old",
    packageName: "com.example.old",
    root: "media",
    kind: "leftover",
    hidden: true,
    directory: true,
    reason: "Hidden leftover. The app is gone.",
  },
  {
    serial: "R58M36ABC",
    path: `${androidRoot("data")}/com.maps.live`,
    name: "com.maps.live",
    packageName: "com.maps.live",
    root: "data",
    kind: "still",
    hidden: false,
    directory: true,
    reason: "Still on the phone.",
  },
  {
    serial: "R58M36ABC",
    path: `${androidRoot("data")}/Cache`,
    name: "Cache",
    root: "data",
    kind: "unknown",
    hidden: false,
    directory: true,
    reason: "Not an app name.",
  },
  {
    serial: "34120D7A8B9C",
    path: `${androidRoot("obb")}/com.old.game`,
    name: "com.old.game",
    packageName: "com.old.game",
    root: "obb",
    kind: "leftover",
    hidden: false,
    directory: true,
    reason: "The app is gone.",
  },
  {
    serial: "34120D7A8B9C",
    path: `${androidRoot("SetAside")}/com.gone.chat/data`,
    name: "data",
    packageName: "com.gone.chat",
    root: "SetAside",
    kind: "set-aside",
    hidden: false,
    directory: true,
    reason: "Set aside.",
  },
  {
    serial: "34120D7A8B9C",
    path: `${androidRoot("SetAside")}/com.gone.chat/data/note.txt`,
    name: "note.txt",
    packageName: "com.gone.chat",
    root: "SetAside",
    kind: "set-aside",
    hidden: false,
    directory: false,
    reason: "Set aside.",
  },
];

export const SAMPLE_NOTE = "Camera closed. A screen opened with nothing in it.\nNothing was uploaded.\n";

export const SAMPLE_HANG = [
  "HANG phone Pixel 6",
  "com.example.camera crashed: java.lang.NullPointerException: view was null",
  "Evidence: logcat on an authorized phone.",
  "Nothing was uploaded.",
].join("\n");
