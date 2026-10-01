import { Day, Place, PlannerData, Stop } from './types';
export const COLORS = ['#2563eb', '#c026d3', '#0f766e', '#7c3aed', '#be123c', '#0369a1'];
export const places: Place[] = [
  {
    id: 'hotel',
    name: '酒店',
    address: '上海市黄浦区南京东路680号',
    lng: 121.475,
    lat: 31.244,
    category: '酒店',
  },
  {
    id: 'bund',
    name: '上海外滩',
    address: '上海市黄浦区中山东一路',
    lng: 121.49,
    lat: 31.25,
    category: '风景名胜',
    color: COLORS[0],
  },
  {
    id: 'nanjing',
    name: '南京东路',
    address: '上海市黄浦区南京东路步行街',
    lng: 121.481,
    lat: 31.242,
    category: '步行街',
  },
  {
    id: 'yuyuan',
    name: '豫园',
    address: '上海市黄浦区福佑路168号',
    lng: 121.493,
    lat: 31.225,
    category: '古典园林',
    color: COLORS[1],
  },
  {
    id: 'xintiandi',
    name: '新天地',
    address: '上海市黄浦区马当路245号',
    lng: 121.475,
    lat: 31.218,
    category: '休闲街区',
    color: COLORS[2],
  },
  {
    id: 'museum',
    name: '上海博物馆',
    address: '上海市黄浦区人民大道201号',
    lng: 121.466,
    lat: 31.233,
    category: '博物馆',
    color: COLORS[0],
  },
  {
    id: 'wukang',
    name: '武康路',
    address: '上海市徐汇区武康路',
    lng: 121.435,
    lat: 31.214,
    category: '历史街区',
    color: COLORS[2],
  },
  {
    id: 'tianzifang',
    name: '田子坊',
    address: '上海市黄浦区泰康路210弄',
    lng: 121.468,
    lat: 31.208,
    category: '艺术街区',
    color: '#ea5261',
  },
  {
    id: 'tower',
    name: '上海中心',
    address: '上海市浦东新区银城中路501号',
    lng: 121.52,
    lat: 31.22,
    category: '城市地标',
    color: COLORS[3],
  },
  {
    id: 'pearl',
    name: '东方明珠',
    address: '上海市浦东新区世纪大道1号',
    lng: 121.513,
    lat: 31.242,
    category: '城市地标',
  },
  {
    id: 'lujiazui',
    name: '陆家嘴',
    address: '上海市浦东新区陆家嘴环路',
    lng: 121.53,
    lat: 31.231,
    category: '城市地标',
    color: COLORS[3],
  },
  {
    id: 'riverside',
    name: '滨江大道',
    address: '上海市浦东新区滨江大道',
    lng: 121.515,
    lat: 31.211,
    category: '滨江步道',
  },
  {
    id: 'platform',
    name: '外滩观景平台',
    address: '上海市黄浦区中山东一路',
    lng: 121.495,
    lat: 31.247,
    category: '观景台',
  },
  {
    id: 'origin',
    name: '外滩源',
    address: '上海市黄浦区圆明园路',
    lng: 121.487,
    lat: 31.259,
    category: '历史街区',
  },
  {
    id: 'jingan',
    name: '静安寺',
    address: '上海市静安区南京西路1686号',
    lng: 121.445,
    lat: 31.24,
    category: '历史建筑',
  },
];
places.forEach(place => { place.provider = 'mock'; place.coordinateSystem = 'demo'; });
export const makeId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export function asStop(place: Place, order: number, id = makeId('stop')): Stop {
  return { ...place, id, placeId: 'placeId' in place ? String(place.placeId) : place.id, order };
}
const stops = (ids: string[], routeId: string) =>
  ids.map((id, i) =>
    asStop(
      places.find((p) => p.id === id)!,
      i,
      `${routeId}-${id}`,
    ),
  );
const days: Day[] = [
  {
    id: 'day-1',
    name: 'Day 1',
    date: '2026-04-12',
    color: COLORS[0],
    routes: [
      {
        id: 'route-1',
        name: '上午路线',
        mode: 'driving',
        visible: true,
        color: COLORS[0],
        stops: stops(['hotel', 'bund', 'nanjing'], 'r1'),
      },
      {
        id: 'route-2',
        name: '下午路线',
        mode: 'walking',
        visible: true,
        color: COLORS[0],
        stops: stops(['yuyuan', 'xintiandi'], 'r2'),
      },
    ],
  },
  {
    id: 'day-2',
    name: 'Day 2',
    date: '2026-04-13',
    color: COLORS[1],
    routes: [
      {
        id: 'route-3',
        name: '城市漫步',
        mode: 'walking',
        visible: true,
        color: COLORS[1],
        stops: stops(['museum', 'wukang', 'tianzifang'], 'r3'),
      },
    ],
  },
  {
    id: 'day-3',
    name: 'Day 3',
    date: '2026-04-14',
    color: COLORS[2],
    routes: [
      {
        id: 'route-4',
        name: '浦东天际线',
        mode: 'driving',
        visible: true,
        color: COLORS[2],
        stops: stops(['pearl', 'riverside', 'tower', 'lujiazui'], 'r4'),
      },
    ],
  },
  { id: 'day-4', name: 'Day 4', date: '2026-04-15', color: COLORS[3], routes: [] },
];
export const initialData: PlannerData = {
  version: 2,
  trip: { id: 'shanghai-trip', name: '上海 4 日游', days },
  favorites: ['yuyuan', 'museum', 'wukang', 'tianzifang', 'tower'].map((id) =>
    places.find((p) => p.id === id)!,
  ),
};
