import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/lib/data';
import { parsePlannerData, serializePlannerData, validatePlannerData } from '../src/lib/transfer';
import { minimumPan, toScreen } from '../src/lib/map-geometry';
import { createRouteMapSvg, safeFilename } from '../src/lib/export';

test('existing JSON backups round-trip without changing data',()=>{
  assert.deepEqual(parsePlannerData(serializePlannerData(initialData)).data,initialData);
});
test('invalid JSON and incomplete structures are rejected, empty arrays are valid',()=>{
  assert.throws(()=>parsePlannerData('{'),/JSON 格式/);
  assert.throws(()=>validatePlannerData({trip:{...initialData.trip,days:null},favorites:[]}),/trip.days/);
  assert.throws(()=>validatePlannerData({trip:initialData.trip}),/favorites/);
  assert.deepEqual(validatePlannerData({trip:{id:'empty',name:'空行程',days:[]},favorites:[]}).data.trip.days,[]);
});
test('duplicate stop and route identities are rejected without mutating source',()=>{
  const data=structuredClone(initialData);data.trip.days[0].routes[0].stops[1].id=data.trip.days[0].routes[0].stops[0].id;
  assert.throws(()=>validatePlannerData(data),/ID.*重复/);
  assert.notEqual(initialData.trip.days[0].routes[0].stops[0].id,initialData.trip.days[0].routes[0].stops[1].id);
  const duplicate=structuredClone(initialData);duplicate.trip.days[1].routes[0].id=duplicate.trip.days[0].routes[0].id;
  assert.throws(()=>validatePlannerData(duplicate),/ID.*重复/);
});
test('import rejects coordinates, impossible dates, and unsupported modes',()=>{
  const data=structuredClone(initialData);data.favorites[0].lat=NaN;assert.throws(()=>validatePlannerData(data),/纬度/);
  data.favorites[0].lat=31.2;data.trip.days[0].date='2026-02-30';assert.throws(()=>validatePlannerData(data),/有效/);
  data.trip.days[0].date='2026-02-20';(data.trip.days[0].routes[0] as {mode:string}).mode='fly';assert.throws(()=>validatePlannerData(data),/driving/);
});
test('import normalizes order, preserves hidden routes and repeated places',()=>{
  const data=structuredClone(initialData);const route=data.trip.days[0].routes[0];route.stops[0].order=50;route.visible=false;
  route.stops.push({...route.stops[0],id:'another-visit'});
  const result=validatePlannerData(data);assert.deepEqual(result.data.trip.days[0].routes[0].stops.map(s=>s.order),[0,1,2,3]);
  assert.equal(result.data.trip.days[0].routes[0].visible,false);assert.equal(result.data.trip.days[0].routes[0].stops[3].placeId,route.stops[0].placeId);
});
test('popover stays still if visible and uses the minimum translation near edges',()=>{
  const bounds={x:10,y:10,width:1000,height:650};
  assert.deepEqual(minimumPan({x:400,y:200,width:280,height:220},bounds),{x:0,y:0});
  assert.deepEqual(minimumPan({x:-20,y:-30,width:280,height:220},bounds),{x:30,y:40});
  assert.deepEqual(minimumPan({x:850,y:550,width:280,height:220},bounds),{x:-120,y:-110});
});
test('popover avoids search overlay with the smallest legal translation',()=>{
  const result=minimumPan({x:700,y:40,width:280,height:220},{x:10,y:10,width:1000,height:700},[{x:690,y:20,width:300,height:100}]);
  assert.deepEqual(result,{x:0,y:90});
});
test('marker projection includes SVG slice offset at different viewport ratios',()=>{
  const coordinate={lng:121.485,lat:31.235};
  const a=toScreen(coordinate,{x:0,y:0,scale:1},{width:1200,height:880});
  const b=toScreen(coordinate,{x:0,y:0,scale:1},{width:1600,height:800});
  assert.ok(Math.abs(a.x-600)<.001&&Math.abs(a.y-440)<.001);
  assert.ok(Math.abs(b.x-800)<.001&&Math.abs(b.y-400)<.001);
});
test('route export includes collapsed or hidden routes and escapes imported labels',()=>{
  const data=structuredClone(initialData);data.trip.days[1].routes[0].visible=false;data.trip.name='旅行 <script> & 地图';
  const svg=createRouteMapSvg(data);assert.ok(svg.includes('武康路'));assert.ok(svg.includes('&lt;script&gt; &amp;'));assert.ok(!svg.includes('<script>'));
  assert.equal(safeFilename('路线/图:1'),'路线-图-1');
});
