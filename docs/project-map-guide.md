# 项目地图与更新方式

[打开交互地图](https://yhonc.github.io/trip-map/project-map/) · [返回 README](../README.md)

TripMap 的项目地图由 [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) 的扫描、导入解析、结构提取和图谱合并工具生成，再补充中文职责说明、架构分层与阅读导览。前端使用其原版 dashboard 的静态模式，增加已提交源码的静态预览。

## 在线浏览

从 README 点击「交互项目地图」，即可查看分层概览、搜索文件/关键函数、检查连接关系或开始十步导览。点击节点详情的「打开代码」可查看对应源码，无需本地服务、登录或 API Key。

GitHub 仓库文件页只展示文件内容；交互网页由 **GitHub Pages** 提供。发布源为 `main` 分支的 `/docs`，地图目录是 `/project-map/`。`docs/.nojekyll` 保证目录和静态资源按原样提供。

## 本次基线

| 项目 | 值 |
| --- | --- |
| 地图内容 | 187 个文件、211 个节点、709 条关系、10 层、10 步导览 |
| 确定性内部导入关系 | 476 条，全部保留 |
| 应用源码基线 | [`fdf637f`](https://github.com/YHonc/trip-map/tree/fdf637f3725a8f09f41cd5bbd3b475e4d915ecbd) |
| 生成日期 | 2026-10-22 |
| Understand-Anything | 包声明 `2.9.7`；固定上游提交 `b8c807c632743ab695ec43cb654a0f1efe216bc8` |
| 图谱文件 | [`.ua/knowledge-graph.json`](../.ua/knowledge-graph.json) |
| 在线文件 | [`project-map/index.html`](project-map/index.html) |
| 机器可读来源记录 | [`provenance.json`](project-map/provenance.json) |

公开地图采用已提交源码快照，不混入本地未提交功能。文件节点覆盖扫描清单，函数节点精选关键入口；它是一份架构阅读地图，不是穷举全部函数的运行时调用追踪。导入关系来自解析器，语义关系、分层和导览来自源码分析。构建、测试脚本的存在不等于它们本次全部运行通过。

## 本地安装

本项目已安装两个技能到 `.agents/skills/`：

- `$understand`：扫描和更新知识图谱。
- `$understand-dashboard`：启动本地查看器。

运行依赖位于 `.tools/understand-anything/understand-anything-plugin/`。技能和工具目录已加入 Git 忽略规则，不随公开地图提交；不改变全局技能配置。本地调用时，使用项目内 runtime 路径执行脚本，避免复制技能目录后的相对导入错误。

在另一台电脑可先运行下面的网页构建命令，它会获取固定上游提交。若还需要重新分析，将上游 `understand-anything-plugin/skills/understand` 和 `understand-dashboard` 安装到本项目的 `.agents/skills/`，并指定该 runtime 路径。

## 更新地图内容

1. 确定要公开的应用源码提交，先审查准备公开的文件。
2. 在该源码快照上运行 `$understand --full --language zh`。读取 [扫描排除规则](../.ua/.understandignore)，保留源码、测试、配置和文档，排除依赖、环境文件、个人数据与构建产物。
3. 复核生成的中文说明、关键函数、关系、分层和导览；保存 `.ua/knowledge-graph.json`。若从独立快照目录分析，将最终图复制回当前仓库。
4. 将 `project.gitCommitHash` 保持为真实扫描的完整提交哈希，不能为了消除新鲜度提示而改成尚未分析的新提交。
5. 重新构建静态查看器、验证并提交地图与网页。提交后 GitHub Pages 自动更新。

源码分析需要 AI 编程代理；下面的命令只构建已经生成的地图，不会重新理解代码。

## 构建、检查和本地浏览

要求 Node.js 22+、pnpm 和 Git，在仓库根目录运行：

```bash
node scripts/build-project-map.mjs
node scripts/verify-project-map.mjs
python -m http.server 32146 --bind 127.0.0.1 --directory docs
```

访问 `http://127.0.0.1:32146/project-map/`。不要直接双击 HTML：静态查看器需要通过 HTTP 读取图谱与源码 JSON。

构建脚本固定查看器上游提交，使用相对资源路径，按图谱基线从 Git 读取源码预览，写出版本来源与许可文件。它不会读取 `.env.local`、用户数据目录或浏览器计划；不会调用高德/AI API。初次构建会下载上游工具与 npm 依赖。

## 许可与适配

上游查看器为 MIT 许可。保留 [Understand-Anything 许可](project-map/UNDERSTAND-ANYTHING-LICENSE.txt)和 [依赖声明](project-map/THIRD-PARTY-LICENSES.txt)。TripMap 源码预览适用本仓库 [MIT 许可](../LICENSE)。

适配只涉及静态资源相对路径、中文页面标题和静态源码预览，代码保存在 [`build-project-map.mjs`](../scripts/build-project-map.mjs)。本机令牌机制继续用于原版动态服务；公开网页只包含已审核的静态文件。
