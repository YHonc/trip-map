# 第三方软件与服务声明

TripMap 的 MIT License 适用于本项目原创代码与文档，不替代第三方组件、地图数据、SDK、服务或商标所适用的许可与条款。

## 主要直接依赖

以下依据当前锁定版本的包声明整理，属于便于查阅的索引，不是全部传递依赖的许可证清单。完整条款、版权与附加声明以对应包中的 LICENSE／NOTICE 文件为准。

| 组件 | 版本 | 包声明的许可证 |
| --- | --- | --- |
| Next.js | 16.3.6 | MIT |
| React / React DOM | 19.3.0 | MIT |
| Electron | 44.4.5 | MIT；内含 Chromium、Node.js 等另附声明 |
| electron-builder | 26.15.3 | MIT |
| electron-log | 5.4.3 | MIT |
| better-sqlite3 | 11.10.0 | MIT |
| dnd-kit core / sortable / utilities | 6.3.1 / 10.0.0 / 3.2.2 | MIT |
| Radix React Select | 2.3.7 | MIT |
| Tailwind CSS / PostCSS 插件 | 4.3.3 | MIT |
| lucide-react | 0.468.0 | ISC；部分源自 Feather 的图标另保留 MIT 来源声明 |
| openai | 6.49.0 | Apache-2.0 |
| lru-cache | 11.5.3 | BlueOak-1.0.0 |
| TypeScript | 5.9.3 | Apache-2.0 |
| Playwright Test | 1.63.0 | Apache-2.0 |
| tsx | 4.23.15 | MIT |

源码依赖版本与完整性由 `package-lock.json`、`desktop/app/package-lock.json` 记录。构建工具将可用的服务依赖 LICENSE／NOTICE 文件复制到 standalone 依赖目录，并附带内置 Node 的 `NODE-LICENSE.txt`。重新分发成品时应保留 Electron 及其第三方组件声明、Node 许可证与各依赖所要求的声明；本索引不能代替这些文件。

## 高德地图

高德地图及开放平台由其权利人提供。API Key、访问配额、显示要求、数据保存与缓存、导出或商业使用等受[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)及具体产品授权约束。

本项目不将高德底图、瓦片、POI 或道路数据重新许可为 MIT，不分发离线底图，也不通过开源许可授予地图 SDK 或地图数据的额外使用权。SQLite 缓存能力本身不代表服务商允许保存相应数据，应按取得的授权配置或关闭缓存。

## AI 服务

`openai` npm 包是采用 Apache-2.0 的客户端库。使用 OpenAI 或其他兼容 API 服务仍需遵守实际服务商条款，并自行配置账号、密钥及模型；SDK 的开源许可不授予服务访问权。用户选择的路线信息会发送给配置的服务商。

## 名称与商标

第三方名称用于说明兼容性与依赖关系，不表示这些权利人对 TripMap 的认可或担保。
