# TripMap · 多日行程路线地图

在地图上安排多日旅行：按天编辑路线、拖动地点排序、收藏目的地，比较驾车／步行／骑行路程，并导出行程。提供 **Windows 桌面安装版、免安装便携版和本地网页方案**，共用同一套 Next.js 服务与 SQLite 数据。

无需 API Key 即可使用 Mock 演示模式；配置高德后启用真实地图、地点搜索和道路规划。AI 路线建议为可选功能。

## 功能

- **行程编辑**：多计划、新建／重命名／删除，Day → Route → Stop 层级，拖动排序、跨路线移动、城市设置、路线显隐及撤销／重做。
- **地点与地图**：高德搜索、单击地图地标查看地点、双击选取精确坐标，支持收藏和加入行程；驾车／步行／骑行路线及同一天相邻路线之间的转场。
- **浏览记忆与加载反馈**：恢复上次计划、日期／路线及地图位置；并行读取启动数据，按需加载弹窗，显示加载阶段与进度条。
- **本地保存**：SQLite 自动保存、版本冲突检测、最近 20 次库快照；同一服务下的桌面与浏览器共享已保存计划。
- **持久地图缓存**：SQLite 磁盘缓存、分类有效期、请求合并、缓存容量与命中统计，重启后复用未过期结果。
- **图形化配置**：地图模式、高德 Key、安全密钥、高德兼容 Web 服务地址、连接测试及缓存设置。
- **可选 AI 助手**：连接 OpenAI 兼容接口生成地点顺序建议，通过高德比较前后道路成本，预览后应用。
- **导入与导出**：行程 JSON、PNG 清单与路线图、SVG 路线图；高德底图不包含在图片导出中。

## 快速开始

本地已有桌面构建时，可双击项目根目录的 `Start-TripMap.cmd`。目录职责、桌面快速启动链路与维护入口见[文件夹架构说明](文件夹架构说明.md)。

### 从源码启动网页

本地已安装依赖时，可双击项目根目录的 `Start-TripMap-Dev.cmd`：服务就绪后自动打开浏览器，支持源码热更新，按 Ctrl+C 停止。如已创建桌面的 `调试地图.cmd` 快捷脚本，也可从桌面启动。

建议使用 **Node.js 22 LTS（22.12 或更高）** 和 npm，在 Windows x64 上构建桌面版。Electron 44 的安装工具要求 Node.js 22.12+。SQLite 包含原生模块；切换 Node 大版本后应重新安装依赖，若没有对应预编译包，需要本机 C++ 构建工具。

```bash
git clone https://github.com/YHonc/trip-map.git
cd trip-map
npm ci
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。没有已有数据时创建空白计划，无需密钥即可使用 Mock 地图。配置高德后，地图优先恢复上次浏览位置，再定位计划城市或已确认地点；没有位置记录时显示全国视图。

生产模式：

```bash
npm run build
npm start
```

服务默认仅监听 `127.0.0.1`，面向单人本机使用。当前没有多用户登录与公网访问鉴权；如需对外部署，应先增加相应机制。

### Windows 桌面与便携版

前往 [GitHub Releases](https://github.com/YHonc/trip-map/releases/latest) 下载：`Setup` 为安装版，`Portable` 为免安装版，`Web` ZIP 为独立本地网页包。下载后可用同页的 `SHA256SUMS.txt` 校验完整性。当前 Windows 程序尚未进行代码签名。

源码仓库不包含构建后的大体积二进制文件。使用下面的构建命令可生成安装包与便携包：

```bash
npm run desktop:build
```

| 产物 | 用法 |
| --- | --- |
| `release/TripMap-Setup-1.2.0-x64.exe` | 安装后从桌面快捷方式启动 |
| `release/TripMap-Portable-1.2.0-x64.exe` | 双击启动，免安装 |
| `.desktop-stage/` | 独立网页运行目录，内含 Node；运行 `Start-Web.cmd` |

成品内置运行时，使用者无需安装 Node.js。桌面菜单「文件 → 在浏览器中打开」可连接桌面正在使用的同一个本机服务。

如需单独分发本地网页包，在 PowerShell 中将准备好的完整目录打包：

```powershell
npm run desktop:prepare
New-Item -ItemType Directory -Force release | Out-Null
Compress-Archive -Path .desktop-stage/* -DestinationPath release/TripMap-Web-1.2.0-x64.zip -Force
```

解压后运行 `Start-Web.cmd`，访问 [http://127.0.0.1:32145](http://127.0.0.1:32145)；保持服务窗口开启，按 `Ctrl+C` 停止。桌面与网页独立启动时各自需要可用端口，可通过 `TRIP_MAP_PORT` 修改，或关闭前一个服务后再启动。

详见[桌面版使用说明](桌面版使用说明.md)。

## 1.2.0 使用变化

- 点击左上角计划名称展开列表，每行右侧可重命名或删除。删除需确认，包含该计划的路线与收藏；删除最后一个计划会创建空白计划。
- 高德地图单击有标志的地标，显示官方地点详情；单击空白区域不选点。双击地图选取精确坐标，再从紧凑详情卡片中收藏或加入行程；双击不再缩放地图。
- 路线图例可关闭，并通过地图上的「图例」按钮重新打开。
- 当前计划保存在本机计划库；日期／路线选择、地图中心与缩放、图例偏好保存在当前浏览器或桌面会话中。不同浏览器、不同端口的视图记忆分别保存。

完整变更见 [CHANGELOG](CHANGELOG.md) 和 [v1.2.0 Release](https://github.com/YHonc/trip-map/releases/tag/v1.2.0)。

## 架构

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

技术栈：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Electron 44、better-sqlite3、dnd-kit、Radix UI 与 Lucide。

Electron 启动独立 Node 进程承载 Next.js standalone 服务。SQLite 原生模块与该 Node 使用相同 ABI，不加载到 Electron 的 Node 环境中。`desktop:prepare` 会构建服务、复制静态文件和当前 Node 运行时，并检查 SQLite；`desktop:pack` 生成 Windows x64 安装版和便携版。构建过程需要联网下载依赖及 Node 许可证。

## 地图与 AI 设置

点击顶部「地图设置」，选择高德模式并填写：

| 配置 | 用途 |
| --- | --- |
| JS API Key | 高德 Web 端 JS API 2.0；由浏览器使用，需配置对应域名权限 |
| 安全密钥 | JS API Key 对应的安全密钥，由本机服务代理使用 |
| Web 服务 Key | 地点搜索、地标详情、坐标地址解析、城市查询与道路规划 |
| 高级服务地址 | 高德兼容 Web 服务网关；不代表可直接切换到其他厂商底图 |

保存后应用配置，无需重新打包。连接测试会执行一次真实城市查询；JS Key 与域名权限仍需通过实际底图加载验证。参考[高德 JS API 安全配置](https://lbs.amap.com/api/jsapi-v2/guide/abc/load)及[高德 Web 服务 API](https://lbs.amap.com/api/webservice/summary)。

源码运行也可复制 [`.env.example`](.env.example) 为 `.env.local`，填入初始默认值。界面保存的用户设置优先。不要提交 `.env.local` 或真实密钥。

「AI 路线助手 → AI 配置」支持 OpenAI 兼容接口地址、模型与 API Key。AI 仅生成顺序候选，真实道路成本由高德核算；预览列出变化，只有改善且当前行程未发生变化时才可应用。请求会将选中路线的地点、坐标和约束发送给所配置的 AI 服务。

Mock 地点和路线是演示数据；高德模式使用 GCJ-02 坐标。演示／未知来源地点需通过搜索确认后才参与真实道路规划。请求失败或道路不可达时显示错误，不用演示路程替代。项目用于行程规划，不提供实时导航。

## 数据目录与迁移

安装版、便携版与源码网页默认共用 **`%LOCALAPPDATA%\TripMap`**；便携版的含义是免安装，数据仍位于统一用户目录。设置 `TRIP_MAP_DATA_DIR` 可改用其他目录。非 Windows 源码运行默认使用 `~/.local/share/TripMap`。

```text
TripMap/
├── data.sqlite        行程、收藏及最近 20 次库快照
├── map-cache.sqlite   可清理的地图请求缓存
├── map-config.json    地图及缓存配置
├── ai-config.json     AI 配置
├── browser/           Electron 会话与 HTTP 缓存
└── logs/              本机服务日志
```

Windows 上服务密钥使用当前账户 DPAPI 加密；复制到其他账户后需重新填写。JS Key 由官方 SDK 使用，会提供给浏览器。其他系统使用账户文件权限保护配置。

旧版浏览器 localStorage 数据在空库首次打开时迁移，原记录保留。已有 SQLite 数据时，可在原浏览器、原地址打开「地图设置 → 缓存与数据 → 导入此浏览器的旧版计划」。也可通过 JSON 导入导出跨浏览器迁移。

同一服务下多个窗口定期同步已保存版本；发生并发冲突时保留当前编辑并提示处理。文件级备份前应关闭所有服务，再复制整个数据目录；运行中优先使用 JSON 导出。SQLite 中的快照不能替代独立备份。

## 地图缓存与底图边界

成功的城市、搜索与道路结果保存到 SQLite，默认策略如下，可在设置中修改或关闭：

| 类别 | 默认有效期 |
| --- | --- |
| 城市查询 | 7 天 |
| 地点搜索 | 1 天 |
| 驾车路线 | 15 分钟 |
| 步行／骑行路线 | 1 天 |

默认缓存内容容量为 128 MB。缓存按服务配置、请求参数、坐标系、方向与交通方式隔离；有效期内复用，过期请求重新获取，失败结果不缓存。设置页展示命中、未命中、请求合并与容量统计，清理缓存不会删除计划。

已展示的路线不会按有效期自动刷新为实时路况，侧栏会标明计算时间；需要更新时可使用「清空缓存并重新获取」。缓存统计不等于服务商账单。

**底图不进入上述 SQLite 缓存。** 高德 JS SDK 的底图只使用浏览器正常 HTTP 缓存，由上游响应头与浏览器决定复用时间，不提供离线瓦片下载或区域预加载。地图服务和数据受[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)约束；缓存的启用、保存范围与期限须符合取得的授权。项目代码的 MIT 许可不授予高德数据或 SDK 的使用权。

## 开发与核验

```bash
npm run typecheck
npm test
npm run build
```

`npm test` 使用隔离临时目录与替身响应，不调用真实高德／AI 服务。当前覆盖行程操作、导入导出、路线缓存、SQLite 持久化、并发冲突、配置保护、地图选点与浏览记忆。成品冒烟入口为 `scripts/smoke-electron.cjs`、`smoke-portable.cjs`、`smoke-web-package.cjs`，验证启动、SQLite 保存、重启读回及退出清理；各版本实际验证范围见 [Release 说明](https://github.com/YHonc/trip-map/releases)。

部分 `scripts/browser-*.js` 是旧版浏览器验收脚本，可能使用真实服务或旧 localStorage 夹具；运行前阅读对应脚本，并使用独立数据目录与浏览器会话。当前桌面版没有代码签名或自动更新，安装／卸载尚未在干净 Windows 虚拟机完成验收，启动速度尚未进行基准测试。

| 目录 | 职责 |
| --- | --- |
| `src/components/`、`src/hooks/` | 行程界面、地图交互与编辑状态 |
| `src/lib/` | 数据模型、路线约束、导入导出 |
| `src/services/` | 地图 SDK、请求复用与客户端存储接口 |
| `src/services/server/` | SQLite、地图缓存、配置、AI 与本机访问检查 |
| `src/app/api/` | 本机 HTTP API |
| `desktop/` | Electron 主进程、本机服务启动与打包配置 |
| `scripts/`、`tests/` | 构建工具、隔离测试与验收脚本 |

欢迎通过 [Issues](https://github.com/YHonc/trip-map/issues) 反馈问题或提交 Pull Request。反馈时请移除密钥、个人行程和日志中的敏感信息；提交功能改动时附上复现步骤与相关核验结果。

## 开源许可

项目原创代码采用 [MIT License](LICENSE)，允许使用、修改、商用和再分发，需保留版权与许可声明。第三方依赖仍适用各自许可证，地图／AI 服务仍适用对应服务条款，详见[第三方声明](THIRD_PARTY_NOTICES.md)。
