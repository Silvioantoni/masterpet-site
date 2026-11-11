// MasterPET: service worker. Deixa o painel do tutor, a carteirinha e o perfil do pet abrirem sem internet.
// Regras: páginas vêm sempre da rede quando há conexão (publicações novas aparecem na hora) e do aparelho
// quando não há. Chamadas ao servidor (Apps Script) nunca passam por aqui.
const V='mp-v1', SHELL=V+'-shell', STATIC=V+'-static', IMG=V+'-img', IMG_MAX=24;
const PAGES=['/tutor/','/tutor/carteirinha/','/tutor/cartaz/','/404.html'];
const ASSETS=['/fonts/inter-var.woff2','/fonts/space-grotesk-var.woff2','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/manifest.webmanifest'];
const CDN=['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const shell=await caches.open(SHELL), stat=await caches.open(STATIC);
    // Cada item é independente: uma falha não impede a instalação.
    await Promise.all([
      ...PAGES.map(u=>fetch(u,{cache:'reload'}).then(r=>r.ok&&shell.put(u,r)).catch(()=>{})),
      ...ASSETS.map(u=>fetch(u).then(r=>r.ok&&stat.put(u,r)).catch(()=>{})),
      ...CDN.map(u=>fetch(u,{mode:'no-cors'}).then(r=>stat.put(u,r)).catch(()=>{}))
    ]);
    self.skipWaiting();
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(!k.startsWith(V+'-')) await caches.delete(k);
    await self.clients.claim();
  })());
});

function pageKey(url){
  const p=url.pathname.replace(/index\.html$/,'').replace(/\/?$/,'/');
  if(PAGES.includes(p)) return p;
  if(url.pathname==='/404.html') return '/404.html';
  return '';
}
const isTagPath=url=>/^\/p\/[^/]+\/?$/i.test(url.pathname)||/^\/MP-[A-Z0-9-]+\/?$/i.test(url.pathname);

async function navigate(req,url){
  const shell=await caches.open(SHELL), key=pageKey(url);
  try{
    const res=await fetch(req);
    if(key&&res.ok) shell.put(key,res.clone());
    return res;
  }catch(err){
    // Sem internet: página salva; o endereço de uma tag (/p/MP-0001) é atendido pelo roteador 404.html.
    const hit=await shell.match(key||(isTagPath(url)?'/404.html':'')||'/__nada__');
    if(hit) return hit;
    throw err;
  }
}
// Entrega o que está salvo e atualiza em segundo plano.
async function staleWhileRevalidate(req,cacheName,max){
  const c=await caches.open(cacheName), hit=await c.match(req,{ignoreVary:true});
  const net=fetch(req).then(async res=>{
    if(res.ok||res.type==='opaque'){ await c.put(req,res.clone()); if(max){ const ks=await c.keys(); for(const k of ks.slice(0,Math.max(0,ks.length-max))) await c.delete(k); } }
    return res;
  });
  if(hit){ net.catch(()=>{}); return hit; }
  return net;
}

self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){ if(url.origin===location.origin) e.respondWith(navigate(req,url)); return; }
  if(url.origin===location.origin){
    if(/\.(woff2|png|webmanifest)$/.test(url.pathname)) e.respondWith(staleWhileRevalidate(req,STATIC));
    return;
  }
  if(url.hostname==='cdnjs.cloudflare.com'){ e.respondWith(staleWhileRevalidate(req,STATIC)); return; }
  // Fotos dos pets (Google Drive): ficam salvas para a carteirinha e o perfil abrirem sem internet.
  if(req.destination==='image'&&(url.hostname==='drive.google.com'||url.hostname.endsWith('.googleusercontent.com'))) e.respondWith(staleWhileRevalidate(req,IMG,IMG_MAX));
});
