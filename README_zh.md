# TimeTree MCP 服务器

[![版本](https://img.shields.io/badge/版本-0.1.0-blue.svg)](https://github.com/timetree-mcp/timetree-mcp)
[![许可证: MIT](https://img.shields.io/badge/许可证-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![English](https://img.shields.io/badge/README-English-blue.svg)](README.md)

一个 [模型上下文协议（MCP）](https://modelcontextprotocol.io/) 服务器，为 AI 助手提供对 [TimeTree](https://timetree.org) 数据库的访问——这是一个关于生命进化时间尺度的公共知识库。

> **⚠️ 免责声明：** 这是一个**非官方的、社区驱动**的 MCP 服务器。它与 TimeTree、天普大学（Temple University）或 TimeTree 研究团队没有任何隶属关系，也未获得其认可或官方支持。TimeTree 是天普大学提供的公共资源，仅供研究和教育使用。请尊重其[数据使用条款](https://timetree.org)。

> **TimeTree 是什么？** TimeTree 是由天普大学（Temple University）维护的科学数据库，收录了从数千篇已发表的分子进化研究中汇编的物种间分歧时间估计数据。目前包含 **5,072 项研究**，涵盖 **208,740 个物种**。

---

## 目录

- [概述](#概述)
- [功能特性](#功能特性)
- [安装](#安装)
- [配置](#配置)
- [使用方法](#使用方法)
  - [配合 Claude Desktop 使用](#配合-claude-desktop-使用)
  - [配合 MCP Inspector 使用](#配合-mcp-inspector-使用)
  - [直接运行](#直接运行)
- [可用工具](#可用工具)
  - [`search_taxa`](#search_taxa)
  - [`get_divergence_time`](#get_divergence_time)
  - [`get_timeline`](#get_timeline)
  - [`get_timetree_info`](#get_timetree_info)
- [项目结构](#项目结构)
- [开发](#开发)
- [工作原理](#工作原理)
- [引用说明](#引用说明)
- [许可证](#许可证)
- [免责声明](#免责声明)

---

## 概述

TimeTree MCP 将 TimeTree 进化生物学数据库与兼容 MCP 的 AI 客户端连接起来。它使语言模型能够：

1. **搜索和解析分类群名称** — 将俗名或学名转换为 NCBI 分类 ID。
2. **查询分歧时间** — 获取两个分类群从最近共同祖先分歧的估计时间，并附带所有支持该估计的研究数据。
3. **构建进化时间线** — 为单个分类群生成进化事件时间线。
4. **访问数据库元信息** — 获取 TimeTree 数据库的当前统计数据。

这使得用户可以用自然语言提问，例如：

- *"人类和小鼠的共同祖先生活在多久以前？"* → 约 8400 万年前
- *"猫和狗是在多长时间前分歧的？"* → 约 5300 万年前
- *"灵长类动物的进化时间线是怎样的？"*

---

## 功能特性

- ✅ **4 个 MCP 工具**，覆盖 TimeTree 核心搜索功能
- ✅ **成对分歧时间查询**，包含完整的研究级别数据（作者、年份、标题、PubMed ID）
- ✅ **单分类群时间线查询**，包含节点级别的生物多样性指标
- ✅ **分类群名称解析**，支持歧义消解
- ✅ **stdio 传输** — 兼容 Claude Desktop、MCP Inspector 及任何 MCP 客户端
- ✅ **无需 API 密钥** — TimeTree 是免费公共资源
- ✅ **通过环境变量配置**
- ✅ **TypeScript** 编写，附带完整类型定义和源代码映射
- ✅ **除 MCP SDK 和 Zod 外无其他运行时依赖**

---

## 安装

### 前置条件

- **Node.js** ≥ 18.0.0（需要内置的 `fetch` API）
- npm 或兼容的包管理器

### 从源码安装

```bash
git clone <仓库地址>
cd Timetree-MCP
npm install
npm run build
```

编译后的服务器将位于 `dist/index.js`。

### 作为依赖安装（未来）

```bash
npm install timetree-mcp
```

---

## 配置

服务器可通过环境变量进行配置。所有值均为可选：

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `TIMETREE_BASE_URL` | `https://timetree.org` | TimeTree 网络服务的基础 URL |
| `TIMETREE_TIMEOUT` | `30000` | HTTP 请求超时时间（毫秒） |
| `TIMETREE_USER_AGENT` | `timetree-mcp/0.1.0` | 发送请求时使用的 User-Agent 头 |

请参阅 [`.env.example`](.env.example) 获取模板。

---

## 使用方法

### 配合 Claude Desktop 使用

将服务器添加到 Claude Desktop 配置文件中：

**macOS：** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows：** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "timetree": {
      "command": "node",
      "args": ["/绝对路径/到/Timetree-MCP/dist/index.js"]
    }
  }
}
```

重启 Claude Desktop 后，你可以直接提问：
- "人类和黑猩猩是什么时候分歧的？"
- "猫和狗之间的分歧时间是多少？"
- "在 TimeTree 中搜索分类群 '灵长类'"

### 配合 MCP Inspector 使用

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

这将打开一个基于网页的检查器，你可以在其中交互式地列出工具并调用它们。

### 直接运行

```bash
node dist/index.js
```

服务器通过 stdio 使用 MCP JSON-RPC 协议进行通信。你可以直接通过管道发送消息：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```

示例 MCP 客户端配置可在 [`mcp-config.example.json`](mcp-config.example.json) 中找到。

---

## 可用工具

### `search_taxa`

在 TimeTree 数据库中搜索分类群名称，返回所有匹配的分类群。

**参数：**

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taxon` | 字符串 | 是 | 要搜索的分类群名称（如 "human"、"Mus musculus"、"primates"） |

**输出示例：**

```
# 分类群搜索结果："human"

**找到 1 个匹配：**

| # | 标签 | 俗名 | 学名 | NCBI ID | 分类等级 |
|---|---|---|---|---|---|
| 1 | Human (Homo sapiens) | Human | Homo sapiens | 271721 | |

请在后续查询中使用 NCBI ID 或精确标签。
```

---

### `get_divergence_time`

获取两个分类群之间的估计分歧时间。

**参数：**

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taxon_a` | 字符串 | 是 | 第一个分类群名称（如 "human"） |
| `taxon_b` | 字符串 | 是 | 第二个分类群名称（如 "mouse"） |

**输出示例（人类 vs 小鼠）：**

```
# 分歧时间结果

**分类群 A：** human (Homo sapiens) [ID: 9606, 等级: species]
**分类群 B：** mouse (Mus) [ID: 10088, 等级: genus]

## 摘要
- 中值时间：84 MYA（百万年前）
- 置信区间：80.1 – 86.9 MYA
- 调整后时间：84 MYA
- 研究数量：75

## 分子时间估计

| 时间(MYA) | 作者 | 年份 | 标题 | PubMed ID | 引用次数 |
|---|---|---|---|---|---|
| 51.61 | Plessy | 2024 | Extreme genome scrambling... | 38621828 | 5332 |
| 65.2 | Wu | 2012 | Molecular and paleontological evidence... | 23071573 | 3055 |
| ... | ... | ... | ... | ... | ... |
```

结果包含：
- **中值时间（Median Time）** — 所有研究估计值的 Huber 稳健平均值
- **置信区间（Confidence Interval）** — 估计时间的范围
- **调整后时间（Adjusted Time）** — 经过平滑处理确保进化树超度量的时间
- **研究列表** — 每项已发表研究的独立估计值，附带 PubMed 链接

---

### `get_timeline`

为单个分类群构建进化时间线。

**参数：**

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taxon` | 字符串 | 是 | 分类群名称（如 "human"） |

**输出示例：**

```
# 进化时间线

**分类群：** Human (Homo sapiens) [ID: 271721]

**节点数：** 15

| # | 名称 | 分类等级 | 时间(MYA) | 演化支大小 | 系统发育多样性 | 进化独特性 |
|---|---|---|---|---|---|---|
| 1 | Homo sapiens | species | | | | |
| 2 | Homo | genus | 2.5 | | | |
| ... | ... | ... | ... | ... | ... | ... |
```

每个节点包含分歧时间、演化支大小、系统发育多样性和进化独特性指标。

---

### `get_timetree_info`

获取 TimeTree 数据库的常规信息。无需参数。

**输出示例：**

```
# TimeTree 数据库信息

TimeTree 是一个关于生命进化时间尺度的公共知识库。
来自数千篇已发表研究的数据被汇编成一个按时间缩放的可搜索生命树。

**当前统计：**
- 研究数量：5,072
- 物种数量：208,740
- 版本：TimeTree 5

**可用工具：**
1. search_taxa – 搜索/解析分类群名称
2. get_divergence_time – 两个分类群之间的分歧时间
3. get_timeline – 分类群的进化时间线
4. get_timetree_info – 本信息
```

---

## 项目结构

```
Timetree-MCP/
├── src/
│   ├── index.ts              # 入口文件（CLI 可执行文件）
│   ├── server.ts             # MCP 服务器设置与工具注册
│   ├── timetree-client.ts    # TimeTree HTTP API 客户端与 HTML 解析器
│   └── types.ts              # TypeScript 类型定义
├── dist/                     # 编译后的 JavaScript（自动生成）
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── mcp-config.example.json
├── LICENSE
├── README.md                 # 英文文档
└── README_zh.md              # 中文文档（本文件）
```

---

## 开发

### 构建

```bash
npm run build       # 清理 + 编译 TypeScript
npm run dev         # 开发模式，监视文件变化
```

### 脚本说明

| 脚本 | 说明 |
|---|---|
| `npm run build` | 编译 TypeScript 到 `dist/` 目录 |
| `npm run dev` | 监视模式 — 文件变更时自动重新编译 |
| `npm start` | 运行编译后的服务器 |
| `npm run clean` | 删除 `dist/` 目录 |
| `npm run lint` | 运行代码检查（如已配置） |

### 架构

服务器分为三个层次：

1. **`types.ts`** — 定义从 TimeTree 响应中提取的所有结构化数据的类型。

2. **`timetree-client.ts`** — 封装 TimeTree AJAX 端点的 HTTP 客户端。由于 TimeTree 不提供 JSON API，客户端发送 POST 请求并使用正则表达式解析返回的 HTML 片段。关键方法：
   - `searchTaxonPair(a, b)` — 解析两个分类群名称
   - `searchTaxon(taxon)` — 解析单个分类群名称
   - `getDivergenceTime(a, b)` — 获取完整分歧时间数据
   - `getTimeline(taxon)` — 获取进化时间线数据
   - `quickDivergenceTime(a, b)` — 一步到位的便捷方法
   - `quickTimeline(taxon)` — 一步到位的便捷方法

3. **`server.ts`** — MCP 服务器，注册四个工具并将它们连接到客户端。使用 `@modelcontextprotocol/sdk` 中的底层 `Server` 类，通过 stdio 传输进行通信。

---

## 工作原理

TimeTree 网站（https://timetree.org）提供了一个搜索界面，其背后使用返回 HTML 片段（而非 JSON）的内部 AJAX 端点。本 MCP 服务器封装了这些端点：

1. **名称解析** — 当你搜索 "human" 时，服务器向 `/ajax/name/timeline/human` 发送 POST 请求，并解析 HTML 中的 `<select><option>` 元素，提取分类群匹配结果及其 NCBI 分类 ID。

2. **分歧时间** — 要获取人类和小鼠之间的分歧时间，服务器首先将两个名称解析为 NCBI ID，然后向 `/ajax/pairwise/{idA}/{idB}` 发送 POST 请求。响应包含一个 SVG，其中每个研究用一个 `<circle>` 元素表示，摘要统计信息用 `<text>` 元素表示。客户端提取：
   - 中值时间（Huber 估计器）
   - 置信区间上下界
   - 调整后时间（超度量平滑）
   - 各研究独立估计值（时间、作者、年份、标题、PubMed ID、引用次数）

3. **时间线** — 对于单分类群时间线，服务器向 `/ajax/timeline/{id}` 发送 POST 请求，并解析 SVG 树结构中的节点元数据（名称、分类等级、时间、演化支大小、系统发育多样性、进化独特性）。

无需 API 密钥，因为 TimeTree 是用于研究和教育用途的免费公共资源。

---

## 引用说明

如果你在研究中使用了本 MCP 服务器的数据，请引用 TimeTree 资源：

> S. Kumar, M. Suleski, J.E. Craig, A.E. Kasprowicz, M. Sanderford, M. Li, G. Stecher, and S.B. Hedges, 2022. [TimeTree 5: An Expanded Resource for Species Divergence Times](https://academic.oup.com/mbe/advance-article/doi/10.1093/molbev/msac174/6657692). Molecular Biology and Evolution, DOI: 10.1093/molbev/msac174.

---

## 许可证

[MIT](LICENSE) © Timetree-MCP 贡献者

TimeTree 数据由天普大学提供，仅供个人研究和教学使用。数据使用条款请参阅 [TimeTree 网站](https://timetree.org)。

---

## 免责声明

本项目是一个**非官方的、社区驱动**的 MCP 服务器。它与以下机构**没有**任何隶属关系，也**未获得**其认可或官方支持：

- TimeTree (timetree.org)
- 天普大学（Temple University）
- TimeTree 研究团队

本服务器通过访问 TimeTree 的公开网络端点来获取公开可用的科学数据。通过本服务器检索的所有数据和内容版权归 TimeTree 和天普大学所有。用户有责任遵守 TimeTree 的[使用条款](https://timetree.org)。

本项目依据 MIT 许可证提供，不提供任何形式的保证。
