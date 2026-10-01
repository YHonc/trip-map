'use client';
import { useEffect, useState } from 'react';
import { mapUsageEndpoints, type MapUsageStats } from '@/lib/map-usage';

export function MapUsagePanel() {
  const [stats, setStats] = useState<MapUsageStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    void fetch('/api/amap/usage', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'API 用量读取失败');
        if (!controller.signal.aborted) setStats(value);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'API 用量读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [refresh]);
  return <>
    <p className="ai-note">记录本机服务发起的请求尝试，包含网络失败和服务报错。缓存命中、请求合并及发送前被拒绝的请求不计入。</p>
    {stats && <>
      <div className="cache-counters"><span>今日请求 <b>{stats.today.toLocaleString()}</b></span><span>累计请求 <b>{stats.total.toLocaleString()}</b></span></div>
      <p className="ai-note">今日按北京时间 {stats.day} 统计；{stats.since ? `首条记录：${new Date(stats.since).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}。` : '尚无请求记录。'}重启和清空地图缓存不会清除用量。</p>
      <table className="map-usage-table"><caption>本机记录的 API 调用</caption><thead><tr><th scope="col">接口</th><th scope="col">今日</th><th scope="col">累计</th></tr></thead><tbody>{stats.endpoints.map(row => <tr key={row.endpoint}><th scope="row">{mapUsageEndpoints[row.endpoint]}</th><td>{row.today.toLocaleString()}</td><td>{row.total.toLocaleString()}</td></tr>)}</tbody></table>
      {stats.unrecorded > 0 && <p className="ai-message" role="status">本次运行有 {stats.unrecorded} 次请求未能写入，用量记录不完整。</p>}
    </>}
    <p className="ai-note">不含浏览器直接加载的底图瓦片、SDK 脚本等请求；SDK 两项仅统计经过本机的初始化与样式代理。累计范围为此数据目录中的所有 Key 和服务地址，自记录启用后开始统计。</p>
    <p className="ai-note">官方免费额度、剩余次数和计费状态未知，请以高德控制台为准。本地统计不能保证不超额，也不代表离线下载授权。</p>
    <div className="ai-actions"><button disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? '读取中…' : '刷新 API 用量'}</button><a href="https://console.amap.com/" target="_blank" rel="noreferrer">查看高德控制台</a></div>
    {error && <p className="ai-message" role="alert">{error}{stats ? '；上方保留上次读取结果。' : ''}</p>}
  </>;
}
