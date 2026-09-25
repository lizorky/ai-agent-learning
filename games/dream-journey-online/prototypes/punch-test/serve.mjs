import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.json':'application/json','.webp':'image/webp'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let p=decodeURIComponent(url.pathname);if(p==='/')p='/prototypes/punch-test/index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep))throw Error('Invalid path');const data=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(4174,'127.0.0.1',()=>console.log('Punch test: http://127.0.0.1:4174/'));
