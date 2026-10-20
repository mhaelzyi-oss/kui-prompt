import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
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
} from "../src/android/desk-api.ts";
import { Session } from "../src/engine/session.ts";
import { withHangFixture } from "../src/fixture/hang.ts";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "dist/renderer");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const session = new Session();
const inject = `<script>window.kui={
  run:(line)=>fetch("/run",{method:"POST",headers:{"content-type":"text/plain"},body:line}).then((r)=>r.json()),
  open:(url)=>{if(url==="https://github.com/sponsors/mhaelzyi-oss")window.open(url,"_blank","noopener")},
  listPhones:()=>post("list"),
  leftovers:(serials)=>post("leftovers",{serials}),
  files:(serials)=>post("files",{serials}),
  inside:(serial,path)=>post("inside",{serial,path}),
  setAside:(serial,path)=>post("setAside",{serial,path}),
  deleteForever:(serial,path)=>post("deleteForever",{serial,path}),
  saveCopy:(serial,path)=>post("saveCopy",{serial,path}),
  readFile:(serial,path)=>post("readFile",{serial,path}),
  writeFile:(serial,path,text)=>post("writeFile",{serial,path,text}),
  hangPhone:(serial)=>post("hang",{serial}),
  reportPhone:(serial)=>post("report",{serial})
};
function post(op, extra){return fetch("/desk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({op,...(extra||{})})}).then((r)=>r.json())}</script>`;

const copies = join(process.cwd(), "kui-desk-copies");

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/run") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const line = Buffer.concat(chunks).toString("utf8");
    const result = session.run(line);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  if (req.method === "POST" && req.url === "/desk") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
      op?: string;
      serials?: string[];
      serial?: string;
      path?: string;
      text?: string;
    };
    const serials = Array.isArray(body.serials) ? body.serials.map(String) : [];
    const serial = String(body.serial ?? "");
    const path = String(body.path ?? "");
    let result: unknown;
    switch (body.op) {
      case "list":
        result = deskListPhones(true);
        break;
      case "leftovers":
        result = deskLeftovers(serials, true);
        break;
      case "files":
        result = deskFiles(serials, true);
        break;
      case "inside":
        result = deskInside(serial, path, true);
        break;
      case "setAside":
        result = deskSetAside(serial, path, true);
        break;
      case "deleteForever":
        result = deskDeleteForever(serial, path, true);
        break;
      case "saveCopy":
        mkdirSync(copies, { recursive: true });
        result = deskSaveCopy(serial, path, copies, true);
        break;
      case "readFile":
        result = deskReadFile(serial, path, true);
        break;
      case "writeFile":
        result = deskWriteFile(serial, path, String(body.text ?? ""), true);
        break;
      case "hang":
        result = deskHang(serial, true);
        break;
      case "report":
        result = deskReport(serial, true);
        break;
      default:
        result = { ok: false, text: "Unknown desk action." };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }
  const url = req.url === "/" ? "/index.html" : (req.url ?? "/index.html");
  const path = join(root, decodeURIComponent(url.split("?")[0] ?? "/index.html"));
  if (!path.startsWith(root) || !existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = readFileSync(path);
  if (url === "/index.html" || url === "/") {
    body = Buffer.from(body.toString("utf8").replace("<head>", `<head>${inject}`));
  }
  res.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream" });
  res.end(body);
});

await new Promise<void>((resolve) => server.listen(4173, "127.0.0.1", resolve));
process.stdout.write("KUI_PROMPT_PREVIEW=http://127.0.0.1:4173\n");

await withHangFixture(async (pid) => {
  process.stdout.write(`KUI_PROMPT_HANG_PID=${pid}\n`);
  await new Promise(() => undefined);
});
