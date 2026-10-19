# TimeTree MCP Server

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/timetree-mcp/timetree-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![中文文档](https://img.shields.io/badge/README-中文-red.svg)](README_zh.md)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with access to the [TimeTree](https://timetree.org) database — a public knowledge-base for the evolutionary timescale of life.

> **⚠️ Disclaimer:** This is an **unofficial, community-driven** MCP server. It is not affiliated with, endorsed by, or officially connected to TimeTree, Temple University, or the TimeTree research team. TimeTree is a public resource provided by Temple University for research and educational use. Please respect their [data usage terms](https://timetree.org).

> **What is TimeTree?** TimeTree is a scientific database maintained by Temple University that contains divergence time estimates between species, compiled from thousands of published molecular evolution studies. It currently includes data from **5,072 studies** covering **208,740 species**.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [With Claude Desktop](#with-claude-desktop)
  - [With MCP Inspector](#with-mcp-inspector)
  - [Direct Execution](#direct-execution)
- [Available Tools](#available-tools)
  - [`search_taxa`](#search_taxa)
  - [`get_divergence_time`](#get_divergence_time)
  - [`get_timeline`](#get_timeline)
  - [`get_timetree_info`](#get_timetree_info)
- [Project Structure](#project-structure)
- [Development](#development)
- [How It Works](#how-it-works)
- [Citation](#citation)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## Overview

TimeTree MCP bridges the TimeTree evolutionary biology database and MCP-compatible AI clients. It allows language models to:

1. **Search and resolve taxon names** — Convert common or scientific names into NCBI taxonomy IDs.
2. **Query divergence times** — Get the estimated time two taxa diverged from their most recent common ancestor, along with all supporting studies.
3. **Build evolutionary timelines** — Generate a timeline of evolutionary events for a single taxon.
4. **Access database metadata** — Get current statistics about the TimeTree database.

This enables natural-language questions like:

- *"When did humans and mice share a common ancestor?"* → ~84 million years ago
- *"How long ago did cats and dogs diverge?"* → ~53 million years ago
- *"What is the evolutionary timeline of primates?"*

---

## Features

- ✅ **4 MCP tools** covering the core TimeTree search capabilities
- ✅ **Pairwise divergence time** queries with full study-level data (author, year, title, PubMed ID)
- ✅ **Single-taxon timeline** queries with node-level biodiversity metrics
- ✅ **Taxon name resolution** with disambiguation support
- ✅ **Stdio transport** — compatible with Claude Desktop, MCP Inspector, and any MCP client
- ✅ **Zero external API key required** — TimeTree is a free public resource
- ✅ **Configurable** via environment variables
- ✅ **TypeScript** with full type definitions and source maps
- ✅ **No runtime dependencies** beyond the MCP SDK and Zod

---

## Installation

### Prerequisites

- **Node.js** ≥ 18.0.0 (for the global `fetch` API)
- npm or a compatible package manager

### From source

```bash
git clone <repository-url>
cd Timetree-MCP
npm install
npm run build
```

The compiled server will be available at `dist/index.js`.

### As a dependency (future)

```bash
npm install timetree-mcp
```

---

## Configuration

The server can be configured via environment variables. All values are optional:

| Variable | Default | Description |
|---|---|---|
| `TIMETREE_BASE_URL` | `https://timetree.org` | Base URL of the TimeTree web service |
| `TIMETREE_TIMEOUT` | `30000` | HTTP request timeout in milliseconds |
| `TIMETREE_USER_AGENT` | `timetree-mcp/0.1.0` | User-Agent header sent with requests |

See [`.env.example`](.env.example) for a template.

---

## Usage

### With Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "timetree": {
      "command": "node",
      "args": ["/absolute/path/to/Timetree-MCP/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, and you can now ask questions like:
- "When did humans and chimpanzees diverge?"
- "What is the divergence time between cats and dogs?"
- "Search for the taxon 'primates' in TimeTree"

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a web-based inspector where you can interactively list tools and call them.

### Direct Execution

```bash
node dist/index.js
```

The server communicates over stdio using the MCP JSON-RPC protocol. You can pipe messages directly:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```

A sample MCP client configuration is provided in [`mcp-config.example.json`](mcp-config.example.json).

---

## Available Tools

### `search_taxa`

Search the TimeTree database for a taxon name and return all matching taxa.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taxon` | string | Yes | A taxon name to search for (e.g. "human", "Mus musculus", "primates") |

**Example output:**

```
# Taxon Search Results for "human"

**1 match found:**

| # | Label | Common Name | Scientific Name | NCBI ID | Rank |
|---|---|---|---|---|---|
| 1 | Human (Homo sapiens) | Human | Homo sapiens | 271721 | |

Use the NCBI ID or the exact label in subsequent queries.
```

---

### `get_divergence_time`

Get the estimated divergence time between two taxa.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taxon_a` | string | Yes | The first taxon name (e.g. "human") |
| `taxon_b` | string | Yes | The second taxon name (e.g. "mouse") |

**Example output (human vs. mouse):**

```
# Divergence Time Result

**Taxon A:** human (Homo sapiens) [ID: 9606, Rank: species]
**Taxon B:** mouse (Mus) [ID: 10088, Rank: genus]

## Summary
- Median Time: 84 MYA
- Confidence Interval: 80.1 – 86.9 MYA
- Adjusted Time: 84 MYA
- Number of Studies: 75

## Molecular Time Estimates

| Time (MYA) | Author | Year | Title | PubMed ID | Citations |
|---|---|---|---|---|---|
| 51.61 | Plessy | 2024 | Extreme genome scrambling... | 38621828 | 5332 |
| 65.2 | Wu | 2012 | Molecular and paleontological evidence... | 23071573 | 3055 |
| ... | ... | ... | ... | ... | ... |
```

The result includes:
- **Median Time** — The Huber-estimator robust average of all study estimates
- **Confidence Interval** — The range of estimated times
- **Adjusted Time** — A smoothed time ensuring the tree is ultrametric
- **Study list** — Individual estimates from each published study with PubMed links

---

### `get_timeline`

Build an evolutionary timeline for a single taxon.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `taxon` | string | Yes | A taxon name (e.g. "human") |

**Example output:**

```
# Evolutionary Timeline

**Taxon:** Human (Homo sapiens) [ID: 271721]

**Nodes:** 15

| # | Name | Rank | Time (MYA) | Clade Size | Phylo. Diversity | Evo. Distinctiveness |
|---|---|---|---|---|---|---|
| 1 | Homo sapiens | species | | | | |
| 2 | Homo | genus | 2.5 | | | |
| ... | ... | ... | ... | ... | ... | ... |
```

Each node includes divergence time, clade size, phylogenetic diversity, and evolutionary distinctiveness metrics.

---

### `get_timetree_info`

Get general information about the TimeTree database. Takes no parameters.

**Example output:**

```
# TimeTree Database Information

TimeTree is a public knowledge-base for information on the
evolutionary timescale of life. Data from thousands of published
studies are assembled into a searchable tree of life scaled to time.

**Current Statistics:**
- Studies: 5,072
- Species: 208,740
- Version: TimeTree 5

**Available Tools:**
1. search_taxa – Search/resolve taxon names
2. get_divergence_time – Divergence time between two taxa
3. get_timeline – Evolutionary timeline for a taxon
4. get_timetree_info – This information
```

---

## Project Structure

```
Timetree-MCP/
├── src/
│   ├── index.ts              # Entry point (CLI executable)
│   ├── server.ts             # MCP server setup & tool registration
│   ├── timetree-client.ts    # TimeTree HTTP API client & HTML parser
│   └── types.ts              # TypeScript type definitions
├── dist/                     # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── mcp-config.example.json
├── LICENSE
├── README.md                 # This file (English)
└── README_zh.md              # Chinese documentation
```

---

## Development

### Build

```bash
npm run build       # Clean + compile TypeScript
npm run dev         # Watch mode for development
```

### Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode — recompiles on file changes |
| `npm start` | Run the compiled server |
| `npm run clean` | Remove the `dist/` directory |
| `npm run lint` | Run the linter (if configured) |

### Architecture

The server is organized into three layers:

1. **`types.ts`** — Type definitions for all structured data extracted from TimeTree responses.

2. **`timetree-client.ts`** — HTTP client that wraps TimeTree's AJAX endpoints. Since TimeTree does not expose a JSON API, the client sends POST requests and parses the returned HTML fragments using regular expressions. Key methods:
   - `searchTaxonPair(a, b)` — Resolve two taxon names
   - `searchTaxon(taxon)` — Resolve a single taxon name
   - `getDivergenceTime(a, b)` — Get full divergence-time data
   - `getTimeline(taxon)` — Get evolutionary timeline data
   - `quickDivergenceTime(a, b)` — One-shot convenience method
   - `quickTimeline(taxon)` — One-shot convenience method

3. **`server.ts`** — MCP server that registers four tools and wires them to the client. Uses the low-level `Server` class from `@modelcontextprotocol/sdk` with stdio transport.

---

## How It Works

TimeTree's website (https://timetree.org) provides a search interface backed by internal AJAX endpoints that return HTML fragments rather than JSON. This MCP server wraps those endpoints:

1. **Name resolution** — When you search for "human", the server POSTs to `/ajax/name/timeline/human` and parses the `<select><option>` HTML to extract taxon matches with their NCBI taxonomy IDs.

2. **Divergence time** — To get the divergence time between human and mouse, the server first resolves both names to NCBI IDs, then POSTs to `/ajax/pairwise/{idA}/{idB}`. The response contains an SVG with `<circle>` elements for each study and `<text>` elements with summary statistics. The client extracts:
   - Median time (Huber estimator)
   - Confidence interval bounds
   - Adjusted time (ultrametric smoothing)
   - Individual study estimates (time, author, year, title, PubMed ID, citation count)

3. **Timeline** — For a single taxon timeline, the server POSTs to `/ajax/timeline/{id}` and parses the SVG tree structure for node metadata (name, rank, time, clade size, phylogenetic diversity, evolutionary distinctiveness).

No API key is required because TimeTree is a free public resource for research and educational use.

---

## Citation

If you use data from this MCP server in your work, please cite the TimeTree resource:

> S. Kumar, M. Suleski, J.E. Craig, A.E. Kasprowicz, M. Sanderford, M. Li, G. Stecher, and S.B. Hedges, 2022. [TimeTree 5: An Expanded Resource for Species Divergence Times](https://academic.oup.com/mbe/advance-article/doi/10.1093/molbev/msac174/6657692). Molecular Biology and Evolution, DOI: 10.1093/molbev/msac174.

---

## License

[MIT](LICENSE) © Timetree-MCP Contributors

TimeTree data is provided by Temple University for personal research and teaching use. See the [TimeTree website](https://timetree.org) for data usage terms.

---

## Disclaimer

This project is an **unofficial, community-driven** MCP server. It is **not** affiliated with, endorsed by, or officially connected to:

- TimeTree (timetree.org)
- Temple University
- The TimeTree research team

This server accesses TimeTree's public web endpoints to retrieve publicly available scientific data. All data and content retrieved through this server belong to TimeTree and Temple University. Users are responsible for complying with TimeTree's [terms of use](https://timetree.org).

The project is provided "as is" under the MIT License, without any warranty of any kind.
