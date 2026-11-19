/* Local-only static preview server. Insecure legacy authentication APIs are retired. */
'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const ROOT=path.join(__dirname,'assets');
const files=new Map([['/','index.html'],['/index.html','index.html'],['/supabase-config.js','supabase-config.js'],['/vault-refresh.css','vault-refresh.css'],['/vault-enhancements.js','vault-enhancements.js'],['/manifest.webmanifest','manifest.webmanifest'],['/vault-icon.svg','vault-icon.svg'],['/sw.js','sw.js']]);
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const file=files.get(new URL(req.url,'http://127.0.0.1').pathname);
  if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const bytes=await fs.readFile(path.join(ROOT,file));res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes)}catch{res.writeHead(500);res.end('Asset unavailable')}
});
if(require.main===module)server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+server.address().port));
module.exports=server;
