// In-memory UI fixture: every API is handled here; only app assets come from dev.
// No user files, saved plans, credentials or external map/AI services are accessed.
const http = require('node:http');
const port = Number(process.env.BASIC_FIXTURE_PORT || 32149);
const place = (id, name, address, lng) => ({ id: `amap:${id}`, poiId: id, provider: 'amap', coordinateSystem: 'GCJ-02', name, address, category: '地点', lng, lat: 30 });
const pois = [place('paper', '纸湾书房（东桥店）', '纸湾市东桥路18号', 110), place('hall', '小舟展馆', '纸湾市南街8号', 110.01)];
const visit = (poi, id) => ({ ...poi, id, placeId: poi.id, order: 0 });
let library = { revision: 0, currentId: 'fixture-trip', plans: [{ version: 2, trip: { id: 'fixture-trip', name: '独立测试行程', days: [{ id: 'fixture-day', name: '纸湾散步', date: '', color: '#2563eb', routes: pois.map((p, i) => ({ id: `fixture-route-${i}`, name: `单点路线 ${i + 1}`, mode: 'walking', visible: true, color: '#2563eb', stops: [visit(p, `fixture-stop-${i}`)] })) }] }, favorites: [] }] };
const stats = { searches: 0, routes: 0, writes: 0, modes: [] };
const config = { provider: 'amap', jsKey: 'fixture', hasWebKey: true, hasSecurityCode: true, baseURL: 'https://fixture.invalid', revision: 'fixture', ready: true, missing: [], cache: { enabled: false, maxMB: 128, ttl: { city: 60, search: 60, driving: 15, walking: 60, riding: 60, subway: 4320 } }, dataDirectory: 'in-memory-fixture' };
if (process.env.BASIC_SCHEDULE_FIXTURE === '1') {
  const day = library.plans[0].trip.days[0];
  day.departureTime = '09:00';
  day.routes = [{ ...day.routes[0], stops: [visit(pois[0], 'fixture-stop-0'), visit(pois[1], 'fixture-stop-1'), visit(place('park', '青帆公园', '纸湾市北街12号', 110.02), 'fixture-stop-2')] }];
  day.routes[0].stops.forEach((s, i) => s.stayMinutes = [30,45,15][i]);
}
if (process.env.BASIC_CACHE_FIXTURE === '1') {
  config.cache.enabled = true;
  config.cacheEpoch = 'connected-cache-fixture';
  for (const kind of Object.keys(config.cache.ttl)) config.cache.ttl[kind] = 4320;
  Object.assign(library.plans[0].trip.days[0].routes[0].stops[0], { startTime: '16:45', endTime: '17:15', notes: '重点看建筑、院落及开放区域内的石雕；这是用于核验文字布局的虚构备注。' });
}
if (process.env.BASIC_UPDATED_UI_FIXTURE === '1') {
  library.plans[0].trip.days[0].city = { name: '纸湾市', adcode: '350200', lng: 110, lat: 30, provider: 'amap', coordinateSystem: 'GCJ-02' };
  library.plans[0].favorites = [place('tea', '青帆茶室', '纸湾市东桥路36号', 110.03)];
}
if (process.env.BASIC_ANNOTATION_FIXTURE === '1') {
  config.provider = 'mock';
  library.plans[0].trip.days[0].routes.forEach((route, index) => {
    Object.assign(route.stops[0], { lng: 121.47 + index * .01, lat: 31.235 + index * .005, provider: 'mock', coordinateSystem: 'demo' });
  });
  const second = structuredClone(library.plans[0]);
  second.trip.id = 'fixture-trip-2'; second.trip.name = '另一份测试行程';
  library.plans.push(second);
}
const sdk = `class Overlay { constructor(o){this.options=o;this.el=document.createElement('div');} on(){} }
class Marker extends Overlay { constructor(o){super(o);if(o.content)this.el.append(o.content);this.el.dataset.fixtureMarker='true';} }
class Polyline extends Overlay { constructor(o){super(o);this.el.dataset.fixtureLine=o.strokeStyle==='dashed'?'connector':'road';this.el.dataset.direction=String(!!o.showDir);this.el.style.cssText='margin:8px;border-top:3px solid '+o.strokeColor;this.el.textContent=o.showDir?'→':'';} }
class Map {
  constructor(container,o){this.container=container;this.center=o.center;this.zoom=o.zoom;this.listeners={};this.overlays=[];this.frame=0;}
  on(e,f){(this.listeners[e]??=[]).push(f);if(e==='complete')setTimeout(f,50);}
  off(e,f){this.listeners[e]=(this.listeners[e]||[]).filter(v=>v!==f);}
  emit(e){for(const f of this.listeners[e]||[])f({});}
  render(){for(const o of this.overlays){if(!o.options.position)continue;const p=this.lngLatToContainer(o.options.position);o.el.style.cssText='position:absolute;left:'+p.x+'px;top:'+p.y+'px;transform:translate(-50%,-100%);';}}
  add(overlays){this.overlays.push(...overlays);overlays.forEach(o=>this.container.append(o.el));this.render();}
  remove(overlays){this.overlays=this.overlays.filter(o=>!overlays.includes(o));overlays.forEach(o=>o.el.remove());}
  getCenter(){return {lng:this.center[0],lat:this.center[1]};} getZoom(){return this.zoom;}
  setCenter(p,immediate=true,duration=0){cancelAnimationFrame(this.frame);const start=this.center,began=performance.now();const tick=(now)=>{const t=immediate||!duration?1:Math.min(1,(now-began)/duration),ease=1-(1-t)**3;this.center=p.map((n,i)=>start[i]+(n-start[i])*ease);this.render();this.emit('mapmove');if(t<1)this.frame=requestAnimationFrame(tick);else this.emit('moveend');};tick(performance.now());}
  setZoom(z){this.zoom=z;this.render();this.emit('zoomchange');this.emit('zoomend');} setFitView(){} zoomIn(){this.setZoom(this.zoom+1);} zoomOut(){this.setZoom(this.zoom-1);} panBy(){}
  lngLatToContainer(p){return {x:this.container.clientWidth/2+(p[0]-this.center[0])*10000,y:this.container.clientHeight/2-(p[1]-this.center[1])*10000};}
  containerToLngLat(p){return {lng:this.center[0]+(p.x-this.container.clientWidth/2)/10000,lat:this.center[1]-(p.y-this.container.clientHeight/2)/10000};}
  destroy(){cancelAnimationFrame(this.frame);this.listeners={};this.container.replaceChildren();}
}
window.AMap={Map,Marker,Polyline,Pixel:class{constructor(x,y){this.x=x;this.y=y;}}};`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const body = async () => { let value = ''; for await (const chunk of req) value += chunk; return JSON.parse(value || '{}'); };
  if (url.pathname === '/fixture-sdk.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`(() => { ${sdk} })();`); }
  if (url.pathname === '/fixture-stats') return json(stats);
  if (url.pathname === '/api/plans') { if (req.method === 'PUT') { library = await body(); library.revision++; stats.writes++; } return json(library); }
  if (url.pathname === '/api/amap/config') return json(config);
  if (url.pathname === '/api/amap/cache') return json({ groups: [], counters: {}, fileBytes: 0, basemap: 'fixture' });
  if (url.pathname === '/api/amap/usage') return json({ today: 0, total: 0, endpoints: [], day: '2026-10-02', unrecorded: 0 });
  if (url.pathname === '/api/ai/config') return json({ protocol: 'openai', baseURL: 'http://fixture.invalid', model: 'fixture', hasKey: process.env.BASIC_UPDATED_UI_FIXTURE === '1' });
  if (url.pathname === '/api/ai/optimize' && process.env.BASIC_UPDATED_UI_FIXTURE === '1') {
    const b = await body();
    return json({ routes: b.routes.map(route => ({ id: route.id, stopIds: [b.options.fixedStart ? b.options.startStopId : null, ...route.stops.map(s => s.id).filter(id => !(b.options.fixedStart && id === b.options.startStopId) && !(b.options.fixedEnd && id === b.options.endStopId)).reverse(), b.options.fixedEnd ? b.options.endStopId : null].filter(Boolean) })), explanation: '这是隔离测试建议：按所选起点与终点排列，其余地点集中游览。', referenceExcerpts: [], unmatchedReferenceNames: [] });
  }
  if (url.pathname === '/api/ai/prompt') return json({ prompt: '虚构测试提示词', defaultPrompt: '虚构测试提示词' });
  if (url.pathname === '/api/ai/references') return json({ references: [] });
  if (url.pathname === '/api/amap/search') { stats.searches++; const q = url.searchParams.get('q') || ''; return json({ places: pois.filter(p => q.includes(p.name)) }); }
  if (url.pathname === '/api/amap/route') { stats.routes++; const b = await body(); stats.modes.push(b.mode); return json({ source: 'amap', calculatedAt: Date.now(), expiresAt: Date.now() + 3 * 86400000, path: [b.origin, b.destination], paths: [[b.origin, b.destination]], connectors: [[b.origin, { lng: b.origin.lng + .001, lat: 30.001 }]], distance: 600, duration: process.env.BASIC_SCHEDULE_FIXTURE === '1' ? ({ walking: 420, riding: 180, driving: 120, subway: 240 }[b.mode]) : 420 }); }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_AMapService')) return json({ error: 'Not part of this isolated fixture' }, 404);
  if (req.method !== 'GET' || !(url.pathname === '/' || url.pathname.startsWith('/_next/') || url.pathname === '/favicon.ico')) return json({}, 404);
  const upstream = http.get({ hostname: '127.0.0.1', port: 3000, path: req.url, headers: { 'accept-encoding': 'identity' } }, incoming => {
    if (url.pathname === '/') { let html = ''; incoming.setEncoding('utf8'); incoming.on('data', c => html += c); incoming.on('end', () => { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(html.replace('<head>', '<head><script src="/fixture-sdk.js"></script>')); }); }
    else { res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res); }
  });
  upstream.on('error', () => { if (!res.headersSent) json({ error: 'Start dev on port 3000 first' }, 502); else res.end(); });
}).listen(port, '127.0.0.1', () => process.stdout.write(`Isolated basic itinerary fixture: http://127.0.0.1:${port}\n`));
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/_next/')) return socket.destroy();
  const upstream = require('node:net').connect(3000, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${req.rawHeaders.reduce((lines, value, i) => i % 2 ? lines : [...lines, `${value}: ${req.rawHeaders[i + 1]}`], []).join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
});
