import type { PlannerData, Schedule, TravelMode } from './types';

export const modeLabels: Record<TravelMode, string> = { driving: '驾车', walking: '步行', riding: '骑行', subway: '地铁' };
export function readSchedule(raw: Record<string, unknown>, path: string): Schedule {
  const result: Schedule = {};
  for (const key of ['startTime', 'endTime'] as const) {
    const value = raw[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${path}.${key}：时间须为 HH:mm（00:00–23:59）`);
    result[key] = value;
  }
  if (raw.endDayOffset !== undefined) {
    if (raw.endDayOffset !== 0 && raw.endDayOffset !== 1) throw new Error(`${path}.endDayOffset：只支持 0 或 1`);
    if (raw.endDayOffset === 1 && !result.endTime) throw new Error(`${path}：跨日安排须填写结束时间`);
    result.endDayOffset = raw.endDayOffset;
  }
  if (result.startTime && result.endTime && !result.endDayOffset && result.endTime < result.startTime) throw new Error(`${path}：结束时间早于开始时间，跨日请勾选“次日结束”`);
  if (raw.notes != null && raw.notes !== '') {
    if (typeof raw.notes !== 'string' || raw.notes.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw.notes)) throw new Error(`${path}.notes：备注须为不超过 2000 字符的文本`);
    result.notes = raw.notes.trim();
  }
  return result;
}
export function scheduleLabel(value: Schedule) {
  if (!value.startTime && !value.endTime) return '';
  return `${value.startTime || '待定'}–${value.endDayOffset ? '次日 ' : ''}${value.endTime || '待定'}`;
}
/** Only separate an explicit pipe-delimited legacy schedule. Keep the full source in notes. */
export function itineraryLabel<T extends Schedule & { name: string }>(item: T): T & Schedule {
  const parts = item.name.split(/[|｜]/).map(s => s.trim());
  if (parts.length < 2) return item;
  const timeIndex = parts.findIndex(part => /^\d{1,2}:\d{2}\s*[–—~-]\s*\d{1,2}:\d{2}/.test(part));
  if (timeIndex < 0 || timeIndex > 1) return item;
  const match = parts[timeIndex].match(/^(\d{1,2}:\d{2})\s*[–—~-]\s*(\d{1,2}:\d{2})/)!;
  const name = timeIndex === 0 ? parts[1] : parts[0];
  if (!name) return item;
  const notes = [item.notes, `原始安排：${item.name}`].filter(Boolean).join('\n');
  if (notes.length > 2000) return item;
  const startTime = match[1].padStart(5, '0'), endTime = match[2].padStart(5, '0');
  let inferred: Schedule = {};
  if (!item.startTime && !item.endTime) {
    try { inferred = readSchedule({ startTime, endTime }, '原始安排'); } catch { /* Ambiguous overnight times stay in the source note. */ }
  }
  return { ...item, ...inferred, name, notes };
}
export function structureItinerary(data: PlannerData): PlannerData {
  return { ...data, trip: { ...data.trip, days: data.trip.days.map(day => {
    const { transfers, ...basic } = itineraryLabel(day);
    const legacy = (transfers ?? []).map(t => {
      const from = day.routes.find(r => r.id === t.fromRouteId)?.name ?? t.fromRouteId;
      const to = day.routes.find(r => r.id === t.toRouteId)?.name ?? t.toRouteId;
      return [`原移动安排：${from} → ${to}`, modeLabels[t.mode], scheduleLabel(t), t.notes].filter(Boolean).join(' · ');
    });
    const notes = [basic.notes, ...legacy].filter(Boolean).join('\n');
    if (notes.length > 2000) throw new Error('旧移动安排与当天备注超过 2000 字符，请缩短备注后再导入');
    return { ...basic, ...(notes ? { notes } : {}), routes: day.routes.map(itineraryLabel) };
  }) } };
}

const example = {
  version: 2,
  trip: { name: '青帆城上午散步（虚构示例）', days: [{
    name: '书屋与展馆', date: '',
    routes: [
      { name: '上午散步', mode: 'walking', startTime: '09:30', endTime: '11:00', stops: [
        { name: '雾灯书屋（桥北店）', address: '青帆市桥北路18号', startTime: '09:30', endTime: '10:00' },
        { name: '小舟展馆', address: '', startTime: '10:20', endTime: '11:00' },
      ] },
    ],
  }] },
  favorites: [],
};
export const itineraryPrompt = `请将我随后提供的旅行需求或攻略整理为可直接导入 TripMap 的 JSON 行程。只输出一个 JSON 对象，不用 Markdown 代码围栏或额外解释。

格式规则：
1. 只规划地点、时间、路线。顶层为 version:2、trip:{name,days}、favorites:[]。每一天为 {name,date,routes}；date 用 YYYY-MM-DD，日期未知用空字符串，不自行指定日期。
2. 路线包含 name、mode、stops。name 只写简短标题；每天按 routes 和 stops 的数组顺序连续连接地点，也会连接相邻路线的末地点与首地点，使用后一条路线的 mode。不跨天连接，不生成 transfers 或额外转场结构。
3. 每个 stop 必须分别填写 name 和 address。name 只放真实地点名称及必要的分店、入口名称，不能混入详细地址、时间、行程说明或多个地点。address 只放原文明确提供的省市区、道路、门牌等详细地址；未知填空字符串。不要把名称与地址拼成一个字段，不要猜地址。例：name:"雾灯书屋（桥北店）", address:"青帆市桥北路18号"。
4. day、route、stop 可用 startTime、endTime（24小时 HH:mm）、endDayOffset（0当天/1次日）。没有依据的时间省略。stop 时间表示抵达至离开；路线时间表示整段安排。00:00 配合 endDayOffset:1 表示次日零点，不使用 24:00。“24点前”等约束原样放可选 notes（最多2000字符），不要擅自指定具体分钟。
5. mode 只支持 driving（驾车/出租车）、walking（步行）、riding（骑行）、subway（地铁，含步行接驳，需在应用内设置当天城市）。换交通方式可拆路线；公交、火车、航班等不支持的移动只记入 notes，将两侧地点放在不同路线，不用驾车路线替代。单点路线允许，不生成道路。
6. id、placeId、order、color、visible、category 均可省略，由应用补齐；如原文已有 ID 则保留。重复到访保留多个 stop，stop ID 各不相同；地点次序以数组为准。未知 lng/lat 省略或同时为 null；绝不编造经纬度、poiId、provider、coordinateSystem、locationSource 或城市坐标。
7. 如填写 ID，只能使用文字、数字、点、短横线、下划线、冒号，不使用 __proto__、constructor、prototype；day/route/stop ID 各自全行程唯一。最多100天、每天100路线、全行程2000地点。颜色如填写用 #RRGGBB，同天同色。
8. 保留用户提供的全部地点、访问顺序、预订时间和重要信息，不凭空增删地点。必要补充写可选 notes；不把长攻略放入标题。导入后可按名称与地址一键批量匹配地图地点，歧义项待人工确认。下面是完全虚构的格式示例，绝不能混入实际输出。

完整示例：
${JSON.stringify(example, null, 2)}

我的旅行需求/原始资料：
【在此粘贴需求或攻略】`;
