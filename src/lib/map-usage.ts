export const mapUsageEndpoints = {
  search: '地点搜索',
  detail: '地点详情',
  regeo: '坐标地址查询',
  city: '城市查询',
  driving: '驾车路线',
  walking: '步行路线',
  riding: '骑行路线',
  subway: '地铁路线',
  staticmap: '导出静态底图',
  test: 'Web 服务连接测试',
  'sdk-init': 'SDK 初始化代理',
  'sdk-style': 'SDK 样式代理',
} as const;

export type MapUsageEndpoint = keyof typeof mapUsageEndpoints;
export interface MapUsageStats {
  day: string;
  since: string | null;
  today: number;
  total: number;
  unrecorded: number;
  endpoints: { endpoint: MapUsageEndpoint; today: number; total: number }[];
}
