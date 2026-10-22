# TripMap 总体开发指南

本文是后续开发的总入口：先理解产品和数据边界，再按任务找到源码、修改契约和验证方式。面向接手项目的开发者与 AI 编程助手。

整理日期：2026-10-19。依据当前工作区源码、配置、测试和已有文档；包含未提交的功能改动，不等同于已发布版本。根包声明版本为 `1.4.0`，本地安装的 Next.js 为 `16.3.6`（依赖声明为 `^16.0.0`）。版本变化时以锁文件及实际安装结果为准。

## 1. 项目定位与范围

TripMap 是面向单人本机使用的多日旅行规划工具，提供浏览器界面和 Electron 桌面外壳，共用 Next.js 本机服务与 SQLite 数据。

核心流程：创建计划 → 按天组织地点 → 搜索、收藏或导入 → 调整顺序和交通方式 → 手动计算行程 → 可选 AI 建议与预览 → 保存、导出。

| 领域 | 当前能力 | 开发时要保留的边界 |
| --- | --- | --- |
| 计划编辑 | 多计划、日期与路线分组、拖拽、撤销重做、自动保存 | 地点的一次到访与地点本身不是同一个身份 |
| 地图 | Mock 演示、高德底图、搜索、地图选点、城市与地点确认 | Mock 数据不能冒充真实道路结果；高德坐标为 GCJ-02 |
| 行程计算 | 驾车、步行、骑行、地铁；交通与停留时间 | 用户主动计算；编辑标记待计算，不自动覆盖手填安排 |
| 收藏与浏览 | 收藏篮、当天批量收藏、地图收藏显隐、浏览位置记忆 | 计划内容和浏览器偏好分开存储 |
| AI | 路线顺序优化、文字/JSON 整理、提示词与攻略参考库 | 模型给候选，程序校验，用户预览后应用 |
| 分享 | 行程 JSON、含静态底图的 PNG/SVG | JSON 不是完整数据目录备份；地图批注不随上述导出 |
| 桌面分发 | Windows 安装版、便携版、带 Node 的网页包 | 便携版数据仍在用户目录；不等于随 exe 移动 |

当前不提供实时导航、多用户账号、公网服务鉴权、完整离线底图与离线算路。公交、城际铁路、航班仅可记入备注；不能把路线拆组理解为断开同一天的行程连接。AI 排序输入也不是完整的营业时间、预约与时间窗求解模型。

## 2. 阅读顺序与文档职责

1. 阅读本指南，建立整体认知。
2. 阅读 [README](../README.md) 理解用户操作，再阅读 [文件夹架构说明](../文件夹架构说明.md) 查找目录。
3. 阅读 [`types.ts`](../src/lib/types.ts)、[`use-planner.tsx`](../src/hooks/use-planner.tsx)，理解数据和状态。
4. 沿具体功能进入对应服务与测试；不要先通读所有 UI 文件。
5. 涉及运行、迁移、构建时阅读 [技术与维护说明](technical-guide.md) 和 [桌面版使用说明](../桌面版使用说明.md)。

| 文档 | 负责的内容 |
| --- | --- |
| 本指南 | 全局架构、开发约束、任务入口、验证与待处理问题 |
| [行程格式](itinerary-format.md) | 导入输出字段、兼容整理、AI 整理与匹配规则 |
| [行程计算](itinerary-calculation.md) | 连续行程、派生时间、计算缓存和失效规则 |
| [地铁、优化与收藏](route-options-and-favorites.md) | 三类功能的行为与验收细节 |
| [地图批注](map-annotations.md) | 手势、保存与功能边界 |
| [AI 助手评估](ai-assistant-assessment.md) | AI 设计评估材料；具体实现仍以当前源码为准 |
| [发布核验记录](releases/verification.md) | 历史构建与测试证据，不代表当前工作区已验收 |
| [CHANGELOG](../CHANGELOG.md) | 已整理的版本变化，不替代当前工作区差异 |

出现冲突时，先对照当前源码、相关测试及实际运行结果，再修正文档。旧版说明与兼容文件名不能独立作为现行需求依据。

## 3. 系统架构与职责分层

```text
浏览器 / Electron 窗口
  └─ src/app/page.tsx → TripPlannerPage → PlannerProvider
       ├─ components：侧栏、地图、搜索、收藏、设置、AI 和导入弹窗
       ├─ hooks：编辑历史、保存协调、选择状态、计算结果和布局
       ├─ lib：数据契约、纯业务运算、校验、几何与导出规则
       └─ services：浏览器请求、地图适配、路段缓存、计划读写
            └─ Next.js Route Handlers（src/app/api）
                 └─ services/server
                      ├─ SQLite：计划 / 攻略、地图缓存、API 用量
                      ├─ 用户配置文件与密钥保护
                      ├─ 高德 Web API / 静态地图
                      └─ OpenAI 兼容 AI 接口

高德 JS SDK：浏览器加载底图；部分请求经过 /_AMapService 代理
Electron：启动独立 Node → Next standalone → 本机页面
```

| 层 | 主要入口 | 修改原则 |
| --- | --- | --- |
| 页面与启动 | [`trip-planner.tsx`](../src/components/trip-planner.tsx) | 加载地图配置与计划库，组装工作区；不要混入数据库操作 |
| 编辑状态 | [`use-planner.tsx`](../src/hooks/use-planner.tsx) | 集中处理计划编辑、历史、选择、保存和并发协调 |
| 计算状态 | [`use-itinerary-calculation.ts`](../src/hooks/use-itinerary-calculation.ts) | 管理快照、有效期、签名与异步结果归属 |
| 业务规则 | [`src/lib`](../src/lib) | 优先将可独立验证的规则放在这里，减少 UI 内重复逻辑 |
| 地图适配 | [`map-service.ts`](../src/services/map-service.ts)、[`amap-routing.ts`](../src/services/amap-routing.ts) | 统一交通模式与距离/时间单位；维护 Mock/高德边界 |
| 本机服务 | [`src/services/server`](../src/services/server) | 外部请求、持久化、密钥与限额；不能导入浏览器组件 |
| 桌面生命周期 | [`desktop/app/main.cjs`](../desktop/app/main.cjs)、[`server-launcher.cjs`](../desktop/server-launcher.cjs) | 独立 Node 运行 SQLite，维护启动、端口、单实例与退出清理 |

技术栈还包括 React 19、TypeScript、Tailwind CSS 4、dnd-kit、Radix Select、Lucide、better-sqlite3 和 Electron 44。Next 配置使用 `output: 'standalone'`，将 `better-sqlite3` 作为服务端外部包，构建使用 Webpack。

## 4. 数据模型与必须保持的语义

```text
SavedLibrary { revision, currentId, plans[] }
  └─ PlannerData { version?: 2, trip, favorites[] }
       └─ Trip { id, name, days[] }
            └─ Day { id, date, departureTime?, city?, routes[] }
                 └─ Route { id, mode, visible, city?, color, stops[] }
                      └─ Stop = Place + Schedule + placeId + order + stayMinutes?
```

契约入口：[`types.ts`](../src/lib/types.ts)、[`transfer.ts`](../src/lib/transfer.ts)、[`itinerary-format.ts`](../src/lib/itinerary-format.ts)、[`planner.ts`](../src/lib/planner.ts)。

- `Stop.id` 标识一次到访，`placeId` 表示关联地点；同地点多次到访必须保留不同到访身份、顺序、时间与备注。
- 经纬度允许 `null`，表示待定位。`provider`、`coordinateSystem` 和位置确认状态决定是否能参与真实算路；不能仅凭存在数字坐标就信任来源。
- 空日期表示“日期待定”；跨午夜使用显式 `endDayOffset`，不能因为结束时刻较小就自动推断。
- `startTime/endTime/notes` 是用户计划；预计抵达与离开时间由路段、出发时间、停留时间派生，不能混写。
- 路段距离统一为米、耗时统一为秒；`stayMinutes` 为分钟。新增适配器必须在边界完成单位转换。
- `RouteGeometry.paths` 表示道路分段，`connectors` 表示非道路接驳绘制信息。不能把不连续道路画成已验证的道路，也不能将纯展示连接线重复计费。
- `version: 2` 仍用于当前行程格式；字段演进先考虑旧 JSON 和旧计划库的兼容，不直接批量覆盖用户库。

### 同一天连续行程与旧 Transfer 的区别

[`connectedRoutes(day)`](../src/lib/connected-routes.ts) 在计算时把前一条可见非空路线的末地点临时加入后一条路线开头，使用后一条路线的交通方式，城市优先取路线城市、其次日期城市。隐藏和空路线被跳过，不跨天连接。这是派生视图，不向持久化路线重复插入地点。

[`dayConnections()`](../src/lib/connections.ts) 是返回空数组的旧兼容入口；`Day.transfers` 仅为旧输入兼容，导入时归并到备注。**旧 Transfer 被移除，不代表当前同一天的路线分组之间不算路。** 单地点交通方式或显隐调整可能拆分内部路线组，必须保留到访身份并重新归一化顺序。

## 5. 五条核心调用链

### 5.1 编辑与保存

`页面操作 → use-planner → lib/planner 等业务函数 → 新 PlannerData / 历史 → services/plan-storage → GET/PUT /api/plans → plan-store → data.sqlite`

计划库以带 `revision` 的整体 JSON 保存，不是每个地点独立一行。服务端事务检查版本，保存时递增；版本冲突保留窗口中的编辑并提示处理，不能通过移除版本检查“解决”。计划删除与攻略删除在同一事务中完成，最近 20 次库快照只是辅助恢复手段。

多窗口同步只在适合接收外部版本时更新。修改保存逻辑时同时检查加载、保存中再次编辑、切换计划、删除计划、冲突与重启恢复，而不是只验证一次成功保存。

### 5.2 搜索、选点与道路计算

`搜索/选点 UI → map-service / amap-api / map-picking → /api/amap/* → server/amap → 高德`

`点击计算 → use-itinerary-calculation → connectedRoutes → 地点验证 → amap-routing / map-service → 路段缓存或 /api/amap/route → calculateVisits`

计算用签名、请求运行编号和地图配置作用域防止旧结果覆盖新计划；路段指纹决定道路结果能否复用。只改出发或停留时间可以复用仍有效的道路路段并重新推算时间。改坐标、方向、模式、城市或地图配置时，要检查缓存隔离和失效。

缓存链包含浏览器计算快照/路段缓存、服务内存和 SQLite；有效期默认 3 天，可配置。真实请求失败不能偷偷回退成 Mock 路程。API 用量统计的是本机实际发起的上游请求，不能作为整个高德账号的用量或账单。

### 5.3 AI 路线优化

`ai-dialog → /api/ai/optimize → 输入/约束校验 → 提示词与选中攻略片段 → AI → validateCandidate → 前后道路成本核算 → 预览 → applyCandidate`

候选必须保持地点集合、路线归属、固定起终点和选定的相对顺序。默认不能增删地点或跨路线搬移地点。时间/距离目标检查对应道路成本改善，自定义目标展示成本供判断。应用时比较生成时的完整数据快照，行程变化则拒绝旧建议。

源码重点：[`optimization.ts`](../src/lib/optimization.ts)、[`optimization-cost.ts`](../src/services/optimization-cost.ts)、[`ai-prompt.ts`](../src/lib/ai-prompt.ts)、[`server/ai.ts`](../src/services/server/ai.ts)、[`travel-references.ts`](../src/lib/travel-references.ts)。攻略内容作为数据上下文，不能升级为程序指令。

### 5.4 导入与地点匹配

`transfer-dialog → 本地解析/规范化 → 可选 AI 整理或批量 POI 匹配 → 预览/确认 → 应用至编辑历史 → 自动保存`

普通 JSON 导入、AI 导入和 POI 匹配是不同环节。AI 整理不等于地图确认；有效 JSON 的身份、坐标与已有关键字段由本机规则保护。文字输入的模型输出不能凭空取得高德可信来源。异步匹配期间取消、编辑或切换计划，旧结果不得写回。

普通导入上限为 5 MB、2000 地点；应用内 AI 整理上限为 20000 字符、80 地点。调整限制时同步修改校验、提示词、界面说明、测试和格式文档。

### 5.5 地图展示与导出

`MapView → Mock 地图 / AMapView → 统一路线样式、箭头、图例与地点标记`

`导出 → export / export-map → /api/amap/static-map → 官方静态地图 → PNG/SVG`

高德图片导出需要底图成功返回；SVG 内嵌位图底图并保留矢量路线。不得泄露 Web Key，不移除底图来源标识。收藏显隐、隐藏路线、待定位地点和批注是否参与导出必须分别检查，不能假定导出完全等于屏幕截图。

## 6. 持久化、配置与数据隔离

默认数据位置由 [`data-dir.ts`](../src/services/server/data-dir.ts) 决定：Windows 通常为 `%LOCALAPPDATA%\TripMap`；可用 `TRIP_MAP_DATA_DIR` 覆盖。安装版、源码开发和便携版默认可能共用这个目录。

| 数据 | 存储位置 | 维护注意 |
| --- | --- | --- |
| 计划库、当前计划、快照、攻略 | `data.sqlite` | 带版本事务；攻略按计划 ID 隔离 |
| 地图业务结果 | `map-cache.sqlite` | 可清理缓存，不连带删除计划或用量 |
| 本机 API 请求计数 | `map-usage.sqlite` | 清缓存、重启或换 Key 不应抹掉累计统计 |
| 地图连接设置 | `map-config.json` | 保存未变化配置不应无故使缓存失效 |
| AI 连接设置 | `ai-config.json` | 与提示词分开；注意旧配置迁移 |
| 共用旅行偏好 | `ai-prompt.json` | 不随单计划 JSON 导出 |
| 日期选择、地图视角、图例、批注、计算快照 | 浏览器本地存储 | 受浏览器/端口影响；不等于 SQLite 备份 |

SQLite 使用 WAL、5 秒 busy timeout 和 FULL synchronous。完整文件备份前关闭相关服务，复制整个数据目录；运行期间优先使用计划 JSON 导出，但它不含攻略、密钥配置与浏览器本地数据。

界面保存的配置优先于 `.env.local` 初始值。[`.env.example`](../.env.example) 只放空值或演示默认值。Windows 服务端密钥由当前账户 DPAPI 保护，跨账户迁移通常需重填；JS Key 是浏览器 SDK 所需公开配置，不应与服务端 Key 混用。

HTTP 边界入口为 [`local-http.ts`](../src/services/server/local-http.ts) 和 AI 服务中的对应保护逻辑。增加接口时检查本机 Host/Origin、请求体大小、输入校验、错误输出和秘密字段；这些本机限制不能替代公网用户鉴权。

## 7. API 分组速查

| 路径组 | 用途 | 主要服务实现 |
| --- | --- | --- |
| `/api/plans` | GET 读取、PUT 保存整个计划库 | `plan-store.ts` |
| `/api/health` | 本机服务识别与健康检查 | 对应 `route.ts` |
| `/api/amap/config`、`test`、`cache`、`usage` | 配置、连接验证、缓存与用量 | `map-config.ts`、`map-cache.ts`、`map-usage.ts` |
| `/api/amap/search`、`place`、`regeocode`、`cities` | 搜索、详情、逆地理编码与城市 | `amap.ts`、`cities.ts` |
| `/api/amap/route`、`static-map` | 真实道路与导出底图 | `amap.ts`、`static-map.ts` |
| `/api/ai/config`、`models`、`test` | AI 连接与模型检查 | `ai.ts` |
| `/api/ai/optimize`、`import` | 顺序候选与行程整理 | `ai.ts` + `lib/optimization.ts` / `lib/ai-import.ts` |
| `/api/ai/prompt`、`references` | 共用偏好与按计划攻略 CRUD | `ai-prompt.ts`、`reference-store.ts` |
| `/_AMapService/*` | JS SDK 安全代理 | `src/app/%5FAMapService/[...path]/route.ts` |

实际 HTTP 方法、请求字段、大小和错误状态码以对应 Route Handler 为准；内部 API 不应直接作为对外稳定接口发布。

## 8. 开发环境与常用命令

建议 Node.js 22 LTS（22.12+）和 npm；首次使用 `npm ci` 安装锁定依赖。更换 Node 大版本后检查 better-sqlite3 原生模块 ABI。开始 Next.js 页面/API 改动前，按根目录 `AGENTS.md` 阅读本地 `node_modules/next/dist/docs/` 的相关指南，不照搬旧版 Next.js 习惯。

隔离调试示例（在项目根目录 PowerShell 中执行）：

```powershell
$env:TRIP_MAP_DATA_DIR = Join-Path $PWD '.local\dev-guide\data'
$env:TRIP_MAP_LEGACY_DIR = Join-Path $PWD '.local\dev-guide\legacy'
$env:NEXT_PUBLIC_MAP_PROVIDER = 'mock'
npm run dev -- --port 3001
```

两个目录变量分别隔离用户数据和旧配置迁移来源。环境变量只作用于当前进程及其子进程；新终端需重新设置。`.env.local` 中若有真实凭据仍可能被服务读取；需要验证外部调用时明确使用哪组测试配置，Mock 模式不意味着任何按钮都不会联网。

| 命令/入口 | 用途与前提 |
| --- | --- |
| `npm run dev` | 本机 Web 开发，默认 3000，Webpack |
| `Start-TripMap-Dev.cmd -Port 3001` | Windows 调试启动器，支持复用同项目服务 |
| `npm run typecheck` | TypeScript 静态检查 |
| `npm test` | 执行 `tests/*.test.ts`，由脚本设置临时数据目录与清空服务密钥 |
| `npm run build` / `npm start` | 网页生产构建/启动；使用隔离环境进行验收 |
| `npm run desktop:prepare` | 安装桌面依赖，构建并准备 `.desktop-stage/` |
| `npm run desktop:dev` | 启动 Electron 外壳；先准备暂存服务 |
| `npm run desktop:pack` | 从准备好的资源构建 Windows 包，不自动发布 |
| `npm run desktop:build` | prepare + pack |
| `Start-TripMap.cmd` | 检查源码与构建记录、按需重建并启动桌面版 |

`.next/`、`.desktop-stage/`、`release/` 为生成目录，不作为业务源码编辑。`release/win-unpacked/` 必须整体保留。项目无独立 `lint` npm 脚本，不要在验收报告里写未执行的 lint。

## 9. 按任务定位修改范围与验证

下表是建议的最小回归范围；测试文件名均位于 `tests/`，不是当前任务全部已经验证的声明。

| 开发任务 | 优先修改/阅读入口 | 最小回归重点 |
| --- | --- | --- |
| 拖拽、计划 CRUD、撤销重做 | `use-planner`、`planner`、`sidebar`、`plan-switcher` | `planner.test.ts`、`desktop-storage.test.ts`；跨路线移动、切换和冲突 |
| 新增行程字段/兼容导入 | `types`、`transfer`、`itinerary-format`、`ai-import` | `transfer.test.ts`、`itinerary-format.test.ts`、`basic-itinerary.test.ts`；旧数据往返 |
| 交通模式或计算规则 | `connected-routes`、`itinerary-calculation`、`amap-routing`、`server/amap` | `itinerary-calculation.test.ts`、`amap.test.ts`、`connected-cache.test.ts`；边界路段与缓存 |
| 地图选点、视角和标记 | `map-view`、`amap-view`、`map-picking`、`workspace-memory` | `map-picking.test.ts`、`map-reveal.test.ts`、`workspace.test.ts`；真实浏览器交互 |
| 收藏、单点显隐 | `favorite-drawer`、`favorites`、`use-planner`、地图组件 | `subway-optimization-favorites.test.ts`；去重、已加入状态、标记数量 |
| AI 优化/提示词/攻略 | `ai-dialog`、`optimization`、两侧 `ai-prompt`、`reference-store` | `ai-cache.test.ts`、`ai-references.test.ts`；约束、过期候选与计划隔离 |
| AI 导入与批量匹配 | `transfer-dialog`、`ai-import`、`poi-repair` | `ai-import.test.ts`、`basic-itinerary.test.ts`；字段保留、歧义与取消 |
| 导出与批注 | `export`、`export-map`、`map-annotations` | `export-map.test.ts`、`map-annotations.test.ts`；实际文件/手势验收 |
| 缓存、配置与用量 | `server/map-config`、`map-cache`、`map-usage`、`config-file` | `connected-cache.test.ts`、`map-usage.test.ts`、`desktop-storage.test.ts` |
| 桌面启动与分发 | `desktop/*`、`prepare-desktop.cjs`、启动 PowerShell | 对应 `smoke-*.cjs`；启动、保存、重启读回、退出清理 |

普通功能改动按范围运行相关测试，再完成 typecheck；影响构建边界或交付时追加 build。UI 改动需实际查看目标布局与操作，测试通过不代表视觉、真实 SDK 或安装体验通过。

浏览器脚本 `scripts/browser-*.js` 和成品脚本 `scripts/smoke-*.cjs` 不是 `npm test` 自动覆盖项。部分脚本依赖历史夹具、真实服务或特定产物，先读脚本，再配置独立数据与会话。发布前按 [技术与维护说明](technical-guide.md) 核对产物与版本，按 [发布核验记录](releases/verification.md) 的范围记录新证据。

## 10. 当前问题、未验证项与后续建议

以下是本次梳理发现的事实或建议，不表示已经批准实施的需求。

| 优先级 | 当前状态 | 建议后续动作与完成标准 |
| --- | --- | --- |
| P1 | `/api/health` 硬编码 `1.1.0`，根包为 `1.4.0` | 统一健康接口与发布版本来源，核对启动器/测试对版本字段的依赖 |
| P1 | 当前工作区含未提交的地图、收藏、AI 导入/提示词等改动 | 发布前逐项审查差异、标明归属及验证范围；不要把本指南当发布确认 |
| P1 | 本次未执行真实高德、AI、桌面包和干净系统安装验收 | 需要发布时用独立测试行程补齐真实交互与成品验收 |
| P2 | 旧 `connections.ts` / `Transfer` 与新连续行程同时存在 | 增改行程功能时沿实际调用链判断；若清理兼容层，先查全部调用与旧数据测试 |
| P2 | `run-tests.cjs` 使用 `result.status || 0` | 子进程启动失败/被信号终止时可能以 0 退出；后续补错误退出处理及失败路径验证 |
| P2 | `use-planner.tsx` 同时协调较多功能 | 仅在相关需求触及或回归成本增加时按保存、编辑、交互职责拆分，保留现有测试契约 |
| P2 | 根 `AGENTS.md` 当前被 `.gitignore` 忽略 | 总体指南作为可跟踪的共享入口；若团队需要共享代理规则，再决定调整忽略策略 |
| P3 | 离线底图、本地算路、HTML 阅读器仍非当前能力 | 先定义需求、授权来源与验收，不根据现有缓存推断已经离线可用 |

### 本次实际核验

- 2026-10-19：`npm test` 通过，146 项通过、0 失败、0 跳过；使用脚本的隔离目录与替身测试。
- 2026-10-19：`npm run typecheck` 通过（退出码 0）。
- 本次为开发指南整理，不改变业务源码；未运行生产构建、浏览器联调、真实地图/AI 请求或桌面打包。

## 11. 后续开发执行约定

1. 开始前查看分支、`git status` 和相关文档，确认已有未提交修改；不要覆盖他人/此前工作。
2. 用一句话定义需求和可观察的完成标准，确认是否涉及存储兼容、外部服务或桌面产物。
3. 沿调用链查到业务契约与对应测试后再修改；Next.js 改动先读安装版本的本地指南。
4. 修改接口/字段时同步处理校验、旧数据、提示词、UI 和导出，不只改类型声明。
5. 用独立目录与虚构计划验证。任何真实服务核验单独记录环境、请求范围和结果。
6. 提交前审查 diff 与敏感信息；更新对应专项文档。仅当全局架构、模型或入口变化时更新本指南。
7. 交付说明写明改了什么、执行了什么检查、哪些范围未验证。发布、推送或数据迁移按实际任务授权执行。
