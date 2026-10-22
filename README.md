<div align="center">

# TripMap

**把想去的地方，连成一段旅程。**

在地图上安排多日旅行：收集地点、调整顺序、计算路程，再把行程带走。

[下载使用](https://github.com/YHonc/trip-map/releases/latest) · [交互项目地图](https://yhonc.github.io/trip-map/project-map/) · [开发指南](docs/development-guide.md) · [反馈问题](https://github.com/YHonc/trip-map/issues)

</div>

## 一张地图，安排整段旅行

TripMap 是一款本地旅行规划应用。左侧按天整理地点与时间，右侧在地图上查看位置和道路；调整行程后，点击「计算行程」即可查看距离、交通耗时和预计到达时间。

提供 **Windows 安装版、免安装便携版和本地网页版**。计划自动保存，下次打开继续编辑。

| 想做什么 | TripMap 可以帮你 |
| --- | --- |
| 收集想去的地方 | 搜索高德地点、单击地标查看详情、双击地图选点，先收藏再安排行程 |
| 整理多日旅行 | 按日期和路线分组，拖动地点调整顺序，管理多个旅行计划，支持撤销与重做 |
| 看清每天的安排 | 连续的地点时间线，设置出发时间和停留时长，统一计算预计到达与离开时间 |
| 比较交通方式 | 驾车、步行、骑行或地铁，查看相邻地点的距离与耗时 |
| 让 AI 提供建议 | 按时间、距离或自定义要求优化顺序，指定起终点、保留先后关系，预览后应用 |
| 利用已有攻略 | 导入精简 JSON、整理文字攻略、批量匹配地点，建立各计划独立的 TXT 攻略参考库 |
| 在地图上记想法 | 画线、圈选、换色、擦除和撤回，批注按计划保存在当前浏览器 |
| 保存与分享 | 导出行程 JSON，或生成含地图底图的 PNG / SVG；复用地图缓存并查看本机 API 用量 |

## 开始使用

### 下载成品

前往 [Releases](https://github.com/YHonc/trip-map/releases/latest)，选择适合的版本。所有下载包均内置运行时，无需安装 Node.js。

| 下载文件 | 启动方式 |
| --- | --- |
| `TripMap-Setup-*-x64.exe` | 安装后从桌面快捷方式打开 |
| `TripMap-Portable-*-x64.exe` | 双击运行，免安装 |
| `TripMap-Web-*-x64.zip` | 解压，运行 `Start-Web.cmd`，访问 `http://127.0.0.1:32145` |

桌面版也可通过「文件 → 在浏览器中打开」访问同一个计划库。版本变化见 [更新记录](CHANGELOG.md)，启动、升级与迁移见 [桌面版使用说明](桌面版使用说明.md)。

### 配置地图与 AI

首次打开即可体验无需密钥的 Mock 演示。使用真实地图时，在「地图设置」中选择高德并保存以下配置：

| 配置 | 用途 |
| --- | --- |
| 高德 JS API Key | 加载交互底图 |
| 对应的安全密钥 | 配合本机代理使用 JS API |
| 高德 Web 服务 Key | 搜索、地点详情、道路计算与图片导出 |

申请方式见 [高德 JS API 文档](https://lbs.amap.com/api/jsapi-v2/guide/abc/load)与 [Web 服务文档](https://lbs.amap.com/api/webservice/summary)。

使用 AI 功能时，在「AI 路线助手 → AI 配置」中填写 OpenAI 兼容接口地址、模型和 API Key。常用旅行偏好可保存到「自定义提示词」，本次要求可在自定义优化目标中单独填写。

## 从地点清单到完整行程

**1. 收集地点。** 新建旅行计划，按天设置城市。通过搜索或地图选点加入地点，也可先放入收藏篮，或直接导入已有 JSON、文字攻略。

**2. 调整与计算。** 拖动地点排列顺序，选择交通方式，设置当天出发时间和各站停留时长。点击「计算行程」，查看道路、距离和预计时间。同一天的可见地点按顺序连接，隐藏或空分组会被跳过。

**3. 比较与分享。** 让 AI 生成另一种顺序，结合道路成本预览决定是否应用。完成后导出 JSON 备份，或分享 PNG / SVG 规划图。导入规则和示例见 [行程格式说明](docs/itinerary-format.md)。

计划、攻略和连接配置保存在本机，默认目录为 `%LOCALAPPDATA%\TripMap`；地图视角和批注等浏览偏好保存在当前浏览器。换电脑时按 [备份与迁移说明](桌面版使用说明.md#数据与缓存)操作。

## 交互项目地图

**[打开 TripMap 项目地图 →](https://yhonc.github.io/trip-map/project-map/)**

想了解代码从哪里开始读，可以直接浏览由 **Understand-Anything** 生成的中文项目地图：

- 按架构分层查看界面、状态管理、行程规则、地图服务、AI、存储和桌面分发。
- 搜索文件或函数，查看职责、依赖关系与源码。
- 跟随中文导览，从页面入口走到计划保存、道路计算和 AI 建议。

地图是独立的静态网页，打开即可浏览，无需安装技能或配置 API Key。[地图数据](.ua/knowledge-graph.json)与网页一同保存在本仓库；生成来源、版本和更新方式见 [地图维护说明](docs/project-map-guide.md)。

## 从源码开发

准备 **Node.js 22 LTS（22.12+）** 和 npm：

```bash
git clone https://github.com/YHonc/trip-map.git
cd trip-map
npm ci
npm run dev
```

访问 `http://127.0.0.1:3000`。Windows 也可运行 `Start-TripMap-Dev.cmd`；桌面启动入口为 `Start-TripMap.cmd`。

```bash
npm run typecheck       # 类型检查
npm test                # 隔离环境下的单元与集成测试
npm run build           # 网页生产构建
npm run desktop:build   # Windows 桌面打包
```

项目采用 **Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Electron · SQLite**。网页和桌面共用本机服务及数据模型。

| 文档 | 阅读内容 |
| --- | --- |
| [总体开发指南](docs/development-guide.md) | 架构、数据契约、调用链、功能修改入口和验证范围 |
| [文件夹架构说明](文件夹架构说明.md) | 目录职责、启动器和源码入口 |
| [技术与维护说明](docs/technical-guide.md) | 配置、存储、缓存、构建和发布 |
| [行程计算](docs/itinerary-calculation.md) | 连续行程、预计时间与缓存复用 |
| [地图批注](docs/map-annotations.md) | 操作手势与保存方式 |
| [地铁、优化与收藏](docs/route-options-and-favorites.md) | 交通方案、AI 约束及收藏行为 |

## 许可与贡献

TripMap 采用 [MIT License](LICENSE)。第三方组件和地图服务说明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。欢迎提交 [Issue](https://github.com/YHonc/trip-map/issues) 或 Pull Request。
