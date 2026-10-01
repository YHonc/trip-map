# 技术与维护说明

本文保留构建、配置、数据处理及发布核验细节。功能介绍和上手流程见 [README](../README.md)，桌面启动、数据备份与迁移见[桌面版使用说明](../桌面版使用说明.md)。

## 架构与运行环境

```text
Electron 桌面窗口             普通浏览器
          └──────────┬──────────┘
             Next.js 本机服务
          ┌──────────┼──────────┐
       行程存储    地图服务层    AI 服务
          │          │          │
       SQLite   内存 / SQLite   OpenAI 兼容 API
                     │
                高德 Web API

地图底图：前端高德 JS SDK + 浏览器正常 HTTP 缓存
```

技术栈为 Next.js 16、React 19、TypeScript、Tailwind CSS 4、Electron 44、better-sqlite3、dnd-kit、Radix UI 与 Lucide。源码入口见[文件夹架构说明](../文件夹架构说明.md)。

Electron 启动独立 Node 进程承载 Next.js standalone 服务。SQLite 原生模块与该 Node 使用相同 ABI，不加载到 Electron 的 Node 环境中。建议使用 Node.js 22 LTS（22.12+）和 npm，在 Windows x64 上构建桌面版；Electron 44 的安装工具要求 Node.js 22.12+。切换 Node 大版本后应重新安装依赖，SQLite 没有对应预编译包时需要本机 C++ 构建工具。

服务默认仅监听 `127.0.0.1`，面向单人本机使用，没有多用户登录与公网访问鉴权。如需对外部署，应先增加相应机制。

## 构建与分发

网页生产模式：

```bash
npm run build
npm start
```

生成 Windows 安装版和便携版：

```bash
npm run desktop:build
```

`desktop:prepare` 构建服务、复制静态文件和当前 Node 运行时，并检查 SQLite；`desktop:pack` 生成 Windows x64 安装版和便携版。构建需要联网下载依赖及 Node 许可证。源码仓库不包含生成的二进制文件。

| 产物 | 用途 |
| --- | --- |
| `release/TripMap-Setup-1.2.1-x64.exe` | Windows 安装包 |
| `release/TripMap-Portable-1.2.1-x64.exe` | 免安装便携包 |
| `release/win-unpacked/` | 完整桌面程序，可通过根目录 `Start-TripMap.cmd` 启动 |
| `.desktop-stage/` | 包含 Node 的独立网页运行目录 |

单独分发网页包时，在 PowerShell 中打包完整目录：

```powershell
npm run desktop:prepare
New-Item -ItemType Directory -Force release | Out-Null
Compress-Archive -Path .desktop-stage/* -DestinationPath release/TripMap-Web-1.2.1-x64.zip -Force
```

解压后运行 `Start-Web.cmd`，访问 `http://127.0.0.1:32145`。保持服务窗口开启，按 Ctrl+C 停止。桌面与网页独立启动时各自需要可用端口，可通过 `TRIP_MAP_PORT` 修改，或关闭前一个服务后再启动。源码开发默认端口为 3000。

下载的成品可用 Release 同页的 `SHA256SUMS.txt` 校验。当前 Windows 程序没有代码签名或自动更新；安装／卸载尚未在干净 Windows 虚拟机完成验收，启动速度尚未进行正式基准测试。

## 地图与 AI 配置

高德 JS API Key 由浏览器使用，需要配置对应域名权限；安全密钥由本机服务代理使用。Web 服务 Key 用于地点搜索、地标详情、坐标地址解析、城市查询与道路规划。

「高级服务地址」只接受高德兼容 Web 服务网关，不代表可直接切换到其他厂商底图。连接测试执行一次真实城市查询，JS Key 与域名权限仍需通过实际底图加载验证。参考[高德 JS API 安全配置](https://lbs.amap.com/api/jsapi-v2/guide/abc/load)和[高德 Web 服务 API](https://lbs.amap.com/api/webservice/summary)。

源码运行可复制 [`.env.example`](../.env.example) 为 `.env.local`，填入初始默认值，界面保存的用户设置优先。不要提交 `.env.local` 或真实密钥。Windows 上服务密钥使用当前账户 DPAPI 加密，复制到其他账户后需重新填写；其他系统使用账户文件权限保护配置。JS Key 由官方 SDK 使用，会提供给浏览器。

AI 助手支持 OpenAI 兼容接口地址、模型与 API Key。请求会将选中路线的地点、坐标和约束发送给所配置的 AI 服务。AI 生成顺序候选，真实道路成本由高德核算；预览列出变化，只有改善且当前行程未发生变化时才可应用。

Mock 地点和路线是演示数据；高德模式使用 GCJ-02 坐标。演示／未知来源地点需通过搜索确认后才参与真实道路规划。请求失败或道路不可达时显示错误，不用演示路程替代。项目用于行程规划，不提供实时导航。

PNG／SVG 导出通过[高德官方静态地图接口](https://lbs.amap.com/api/webservice/guide/api/staticmaps)获取整个行程范围的底图。SVG 内嵌 PNG 底图，并保留矢量路线和地点标记；PNG 规划图包含同一幅完整地图。底图使用 Web 服务 Key，在服务端请求，导出文件不包含密钥，保留底图自带的来源标识。请求失败时显示原因并允许重试，不生成缺失底图的高德图片。静态地图需要对应账号权限与额度；兼容网关需要支持该接口和高清图尺寸。

底图仅按导出请求获取，不写入地图磁盘缓存，也不下载离线瓦片。导出与分享须遵守静态地图产品的授权和展示要求。导入配色只作用于导入预览和应用，不改变一般数据校验或保存；已导入的同色行程可在「导入 / 导出」中重新导入当前行程完成配色，并可撤销。

## 保存、迁移与浏览记忆

安装版、便携版与源码网页默认共用 `%LOCALAPPDATA%\TripMap`。便携版指免安装，数据仍位于统一用户目录。`TRIP_MAP_DATA_DIR` 可改用其他目录；非 Windows 源码运行默认使用 `~/.local/share/TripMap`。

计划和当前计划 ID 保存在 SQLite，日期／路线选择、地图中心、缩放与图例偏好保存在当前浏览器或桌面会话。不同浏览器、不同端口的视图记忆分别保存。

旧版浏览器 localStorage 数据在空库首次打开时迁移，原记录保留。已有 SQLite 数据时，可在原浏览器、原地址打开「地图设置 → 缓存与数据 → 导入此浏览器的旧版计划」，也可通过 JSON 导入导出跨浏览器迁移。

同一服务下多个窗口定期同步已保存版本，发生并发冲突时保留当前编辑并提示处理。文件级备份前应关闭所有服务，再复制整个数据目录；运行中优先使用 JSON 导出。最近 20 次库快照不能替代独立备份。具体目录与操作见[桌面版使用说明](../桌面版使用说明.md#数据与缓存)。

## 地图缓存与底图

成功的城市、搜索与道路结果保存到 SQLite。默认策略如下，可在设置中修改或关闭：

| 类别 | 默认有效期 |
| --- | --- |
| 城市查询 | 7 天 |
| 地点搜索 | 1 天 |
| 驾车路线 | 15 分钟 |
| 步行／骑行路线 | 1 天 |

默认缓存内容容量为 128 MB。缓存按服务配置、请求参数、坐标系、方向与交通方式隔离；有效期内复用，过期请求重新获取，失败结果不缓存。设置页展示命中、未命中、请求合并与容量统计，清理缓存不会删除计划。

已展示的路线不会按有效期自动刷新为实时路况，侧栏会标明计算时间；需要更新时可使用「清空缓存并重新获取」。缓存统计不等于服务商账单。

底图不进入 SQLite 缓存。高德 JS SDK 的底图只使用浏览器正常 HTTP 缓存，由上游响应头与浏览器决定复用时间，不提供离线瓦片下载或区域预加载。地图服务和数据受[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)约束，缓存的启用、保存范围与期限须符合取得的授权。项目代码的 MIT 许可不授予高德数据或 SDK 的使用权。

## 开发检查与问题反馈

```bash
npm run typecheck
npm test
npm run build
```

`npm test` 使用隔离临时目录与替身响应，不调用真实高德／AI 服务。覆盖行程操作、导入导出、路线缓存、SQLite 持久化、并发冲突、配置保护、地图选点与浏览记忆。

成品检查入口为 `scripts/smoke-electron.cjs`、`scripts/smoke-portable.cjs` 和 `scripts/smoke-web-package.cjs`，检查启动、SQLite 保存、重启读回及退出清理。各版本实际验证范围见[发布构建与核验记录](releases/verification.md)。

部分 `scripts/browser-*.js` 是旧版浏览器验收脚本，可能使用真实服务或旧 localStorage 夹具。运行前阅读对应脚本，并使用独立数据目录与浏览器会话。替身测试不代表真实服务联调或完整安装／卸载验收。

反馈问题时请移除密钥、个人行程和日志中的敏感信息；提交功能改动时附上复现步骤与相关核验结果。第三方依赖仍适用各自许可证，地图／AI 服务仍适用对应服务条款，详见[第三方声明](../THIRD_PARTY_NOTICES.md)。
