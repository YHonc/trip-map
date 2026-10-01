import { project as projectDemo } from './map-geometry';
import { exportMapPoint, type ExportBasemap } from './export-map';
import { dayStopOffset } from './planner';
import { dayConnections } from './connections';
import type { PlannerData, RouteResult } from './types';

const escapeXml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
    );
export const safeFilename = (name: string) =>
  name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100) || '行程';
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
/** Complete itinerary map, independent of the current pan, zoom, collapsed days, or visibility. */
export function createRouteMapSvg(data: PlannerData, basemap: string | ExportBasemap = '', results: Record<string, RouteResult> = {}, transfers: Record<string, RouteResult> = {}): string {
  const raster = typeof basemap === 'object' ? basemap : undefined;
  if (raster && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raster.dataUrl)) throw new Error('底图图片格式无效');
  const project = raster ? (point: Parameters<typeof projectDemo>[0]) => exportMapPoint(point, raster) : projectDemo;
  const width = 1600,
    mapHeight = 850,
    legendRows = Math.max(1, Math.ceil(data.trip.days.length / 5)),
    height = mapHeight + 130 + legendRows * 42;
  const routes = data.trip.days.flatMap((day) =>
    day.routes.map((route) => ({ day, route, geometry: results[route.id]?.status === 'ready' ? results[route.id].geometry : undefined })),
  );
  const connections = data.trip.days.flatMap(dayConnections).filter(c => c.enabled);
  const geometries = [...routes.map(r => r.geometry), ...connections.map(c => transfers[c.id]?.status === 'ready' ? transfers[c.id].geometry : undefined)];
  // Include detours and non-road connectors, including transfer-only itineraries.
  const points = [...routes.flatMap(item => item.route.stops), ...geometries.flatMap(g => g ? [...(g.paths ?? [g.path]).flat(), ...(g.connectors ?? []).flat()] : [])].map(project);
  const bounds = points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const { minX, maxX, minY, maxY } = points.length ? bounds : { minX: 100, maxX: 1100, minY: 100, maxY: 780 };
  const scale = raster ? 1 : Math.min(
    basemap ? 1.6 : Infinity,
    (width - 600) / Math.max(10, maxX - minX),
    (mapHeight - 170) / Math.max(10, maxY - minY),
  );
  const tx = raster ? 0 : width / 2 - ((minX + maxX) / 2) * scale,
    ty = raster ? 0 : mapHeight / 2 - ((minY + maxY) / 2) * scale;
  const lines = routes
    .map(({ day, geometry, route }) => {
      if (route.stops.length < 2 || !geometry) return '';
      return (geometry.paths ?? [geometry.path]).map(segment => {
      const path = segment
        .map(project)
        .map((p) => `${p.x},${p.y}`)
        .join(' ');
      return `<polyline points="${path}" fill="none" stroke="white" stroke-width="8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><polyline points="${path}" fill="none" stroke="${escapeXml(day.color)}" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`;
      }).join('');
    })
    .join('');
  const markerGroups = new Map<string, { point: { x: number; y: number }; color: string; name: string; numbers: number[] }>();
  routes.forEach(({ day, route }) => route.stops.forEach((stop, index) => {
    const key = JSON.stringify([day.id, stop.lng, stop.lat, stop.name]);
    const group = markerGroups.get(key) ?? { point: project(stop), color: day.color, name: stop.name, numbers: [] };
    group.numbers.push(dayStopOffset(day, route.id) + index + 1);
    markerGroups.set(key, group);
  }));
  const markers = [...markerGroups.values()].map(({ point, color, name, numbers }) => {
    // Repeated visits share a location, but all their itinerary numbers remain visible.
    const label = numbers.join(' / '), radius = Math.max(17, label.length * 5 + 8);
    const lines = Array.from(name).reduce<string[]>((result, char, index) => {
      const line = Math.floor(index / 18); result[line] = (result[line] ?? '') + char; return result;
    }, []);
    return `<g transform="translate(${point.x} ${point.y}) scale(${1 / scale})"><rect x="${-radius}" y="-17" width="${radius * 2}" height="34" rx="17" fill="${escapeXml(color)}" stroke="white" stroke-width="3"/><text y="6" text-anchor="middle" font-size="16" font-weight="600" fill="white">${label}</text><text font-size="13" font-weight="600" fill="#29415e" stroke="white" stroke-width="4" paint-order="stroke">${lines.map((line, index) => `<tspan x="${radius + 8}" y="${5 + (index - (lines.length - 1) / 2) * 16}">${escapeXml(line)}</tspan>`).join('')}</text></g>`;
  }).join('');
  const connectionLines = connections.map(c => {
    const result = transfers[c.id];
    if (result?.status !== 'ready' || !result.geometry) return '';
    return (result.geometry.paths ?? [result.geometry.path]).map(path => `<polyline points="${path.map(project).map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#7890ad" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"><title>转场</title></polyline>`).join('');
  }).join('');
  const connectors = geometries
    .flatMap(geometry => geometry?.connectors ?? []).map(path => `<polyline points="${path.map(project).map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#b7a088" stroke-width="1.5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"><title>非道路接驳，不计入路程</title></polyline>`).join('');
  const sources = new Set(geometries.filter(g => g?.path.length).map(g => g?.source));
  const sourceLabel = `${raster ? '底图 © 高德地图 · ' : ''}${sources.has('amap') ? `高德道路几何${raster ? '' : ' · 不含高德底图'}${sources.has('mock') ? ' · 含 Mock 演示几何' : ''}` : sources.has('mock') ? 'Mock 演示几何' : '无已就绪道路几何'}`;
  const missing = routes.filter(r => r.route.stops.length > 1 && !r.geometry).length + connections.filter(c => transfers[c.id]?.status !== 'ready').length;
  const footer = `${sourceLabel} · 虚线：转场／非道路接驳 · ${missing} 段未就绪未绘制`;
  const legend = data.trip.days
    .map((day, index) => {
      const x = 48 + (index % 5) * 302,
        y = mapHeight + 133 + Math.floor(index / 5) * 42;
      return `<circle cx="${x}" cy="${y}" r="7" fill="${escapeXml(day.color)}"/><text x="${x + 17}" y="${y + 5}" font-size="14" fill="#58708e">${escapeXml(day.name)} · ${escapeXml(day.date)} · ${day.routes.reduce((n, r) => n + r.stops.length, 0)} 个地点</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:'Segoe UI','Microsoft YaHei',sans-serif}.district-labels{fill:#8293a8;font-size:21px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3}.street-labels{fill:#a1b1bd;font-size:9px}</style><defs><clipPath id="export-map-clip"><rect x="0" y="0" width="${width}" height="${mapHeight}"/></clipPath></defs><rect width="100%" height="100%" fill="#f6faff"/><text x="40" y="50" font-size="28" fill="#172a4b" font-weight="650">${escapeXml(data.trip.name)}</text><text x="42" y="78" font-size="13" fill="#879ab0">完整路线图 · ${data.trip.days.length} 天 · ${routes.length} 条路线 · ${escapeXml(footer)}</text><g transform="translate(0 98)" clip-path="url(#export-map-clip)"><rect width="${width}" height="${mapHeight}" fill="#eef3f2"/><g transform="translate(${tx} ${ty}) scale(${scale})">${raster ? `<image width="${width}" height="${mapHeight}" href="${raster.dataUrl}"/>` : basemap}${lines}${connectionLines}${connectors}${markers}</g></g>${legend}</svg>`;
}
function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('路线图渲染失败，请重试。'));
    };
    image.src = url;
  });
}
function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (char === '\n' || context.measureText(line + char).width > maxWidth) {
      lines.push(line);
      line = char === '\n' ? '' : char;
    } else line += char;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
export async function createPlanningPng(data: PlannerData, basemap: string | ExportBasemap = '', results: Record<string, RouteResult> = {}, transfers: Record<string, RouteResult> = {}): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成 PNG 图片。');
  const width = 2000,
    leftWidth = 590,
    gap = 44,
    dayLayouts = data.trip.days.map((day) => {
      let height = 90;
      if (!day.routes.length) height += 44;
      const routes = day.routes.map((route) => {
        const stops = route.stops.map((stop) => {
          context.font = '500 22px "Microsoft YaHei",sans-serif';
          const lines = wrapText(context, stop.name, leftWidth - 140);
          context.font = '16px "Microsoft YaHei",sans-serif';
          const addressLines = stop.address ? wrapText(context, stop.address, leftWidth - 140) : [];
          const height = lines.length * 30 + addressLines.length * 23 + 20;
          return { stop, lines, addressLines, height };
        });
        const routeHeight = 50 + (stops.length ? stops.reduce((n, s) => n + s.height, 0) : 34) + 14;
        height += routeHeight;
        return { route, stops };
      });
      return { day, routes, height };
    });
  const height = Math.max(1280, 170 + dayLayouts.reduce((n, d) => n + d.height + 18, 0) + 70);
  if (height > 16000)
    throw new Error('行程过长，无法生成单张 PNG。请导出 JSON 或完整路线图，或将行程分段。');
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#ecf4ff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#172a4b';
  context.font = '650 38px "Microsoft YaHei",sans-serif';
  context.fillText(data.trip.name, 44, 72, width - 88);
  context.font = '20px "Microsoft YaHei",sans-serif';
  context.fillStyle = '#8296b2';
  context.fillText(
    `${data.trip.days.length} 天 · ${data.trip.days.reduce((n, d) => n + d.routes.length, 0)} 条路线 · 完整行程规划`,
    46,
    111,
  );
  let y = 158;
  if (!dayLayouts.length) {
    context.fillStyle = '#8a9cb3';
    context.font = '24px "Microsoft YaHei",sans-serif';
    context.fillText('还没有安排地点', 64, y + 55);
  }
  for (const { day, routes, height: cardHeight } of dayLayouts) {
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.roundRect(gap, y, leftWidth, cardHeight, 20);
    context.fill();
    context.fillStyle = day.color;
    context.beginPath();
    context.arc(gap + 34, y + 39, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1b3150';
    context.font = '600 25px "Microsoft YaHei",sans-serif';
    context.fillText(day.name, gap + 56, y + 47, leftWidth - 90);
    context.fillStyle = '#8a9cb3';
    context.font = '17px "Microsoft YaHei",sans-serif';
    context.fillText(day.date, gap + 26, y + 77);
    let lineY = y + 107;
    if (!routes.length) {
      context.fillText('自由安排', gap + 26, lineY);
    }
    for (const { route, stops } of routes) {
      context.font = '600 20px "Microsoft YaHei",sans-serif';
      context.fillStyle = '#526a8b';
      context.fillText(
        `${route.name} · ${{ driving: '驾车', walking: '步行', riding: '骑行' }[route.mode]}`,
        gap + 26,
        lineY,
        leftWidth - 52,
      );
      lineY += 36;
      if (!stops.length) {
        context.font = '17px "Microsoft YaHei",sans-serif';
        context.fillStyle = '#9baac0';
        context.fillText('待安排地点', gap + 55, lineY);
        lineY += 34;
      }
      for (const { lines, addressLines, height: stopHeight } of stops) {
        const index = dayStopOffset(day, route.id) + stops.findIndex((item) => item.lines === lines);
        context.fillStyle = day.color;
        context.beginPath();
        context.arc(gap + 36, lineY - 7, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'white';
        context.font = '600 16px sans-serif';
        context.textAlign = 'center';
        context.fillText(String(index + 1), gap + 36, lineY - 1);
        context.textAlign = 'left';
        context.fillStyle = '#243c5b';
        context.font = '500 22px "Microsoft YaHei",sans-serif';
        lines.forEach((line, i) => context.fillText(line, gap + 64, lineY + i * 30));
        context.fillStyle = '#90a1b7';
        context.font = '16px "Microsoft YaHei",sans-serif';
        addressLines.forEach((line, i) =>
          context.fillText(line, gap + 64, lineY + lines.length * 30 + i * 23),
        );
        lineY += stopHeight;
      }
      lineY += 28;
    }
    y += cardHeight + 18;
  }
  const map = await loadSvg(createRouteMapSvg(data, basemap, results, transfers)),
    mapX = gap + leftWidth + 28,
    mapWidth = width - mapX - gap;
  const mapHeight = (map.height / map.width) * mapWidth;
  context.drawImage(map, mapX, 158, mapWidth, mapHeight);
  context.font = '17px "Microsoft YaHei",sans-serif';
  context.fillStyle = '#8fa3bf';
  context.fillText(typeof basemap === 'object' ? '包含所有路线与地点 · 底图 © 高德地图' : '包含所有路线与地点 · 地图为行程示意', mapX, 158 + mapHeight + 36);
  context.fillText('多日行程路线地图', gap, height - 30);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 生成失败，请重试。'))),
      'image/png',
    ),
  );
}
