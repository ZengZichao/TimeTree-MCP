/**
 * MCP server setup and tool registration.
 *
 * This module creates the MCP `Server` instance, declares all the
 * tools that the TimeTree MCP server exposes, and wires each tool to
 * the corresponding {@link TimeTreeClient} method.
 *
 * Tools exposed (v0.1.0):
 *
 *  1. `search_taxa`          – Search / resolve taxon names to NCBI ids.
 *  2. `get_divergence_time`  – Get divergence time for a pair of taxa.
 *  3. `get_timeline`         – Get an evolutionary timeline for one taxon.
 *  4. `get_timetree_info`    – Get general information about the TimeTree database.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TimeTreeClient } from './timetree-client.js';
import type {
  DivergenceTimeResult,
  TaxonMatch,
  TimelineResult,
} from './types.js';

/* ════════════════════════════════════════════════════════════════════════
 *  Tool input schemas (Zod)
 * ════════════════════════════════════════════════════════════════════════ */

const SearchTaxaSchema = z.object({
  taxon: z
    .string()
    .min(1)
    .describe(
      'A taxon name to search for (e.g. "human", "Mus musculus", "primates").',
    ),
});

const GetDivergenceTimeSchema = z.object({
  taxon_a: z
    .string()
    .min(1)
    .describe('The first taxon name (e.g. "human").'),
  taxon_b: z
    .string()
    .min(1)
    .describe('The second taxon name (e.g. "mouse").'),
});

const GetTimelineSchema = z.object({
  taxon: z
    .string()
    .min(1)
    .describe('A taxon name to build a timeline for (e.g. "human").'),
});

/* ════════════════════════════════════════════════════════════════════════
 *  Tool definitions (static metadata for `tools/list`)
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Convert a Zod schema to a JSON Schema object that can be returned
 * in the `inputSchema` field of a tool definition.
 *
 * Zod v3 does not ship a built-in `toJsonSchema()` so we build the
 * JSON Schema by hand for our three small, known schemas.  This keeps
 * the implementation dependency-free.
 */
function zodToInputSchema(
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.shape)) {
    const zodType = value as z.ZodTypeAny;
    // All fields in our schemas are strings, but we determine the
    // JSON Schema type from the Zod type so the function stays correct
    // if non-string fields are added later.
    let type = 'string';
    if (zodType instanceof z.ZodNumber) type = 'number';
    else if (zodType instanceof z.ZodBoolean) type = 'boolean';
    properties[key] = {
      type,
      description: zodType.description ?? '',
    };
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(schema.shape),
  };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'search_taxa',
    description:
      'Search the TimeTree database for a taxon name and return all ' +
      'matching taxa with their NCBI taxonomy IDs, common names, ' +
      'scientific names, and taxonomic ranks. Useful for resolving ' +
      'ambiguous taxon names before querying divergence times or ' +
      'building timelines.',
    inputSchema: zodToInputSchema(SearchTaxaSchema),
  },
  {
    name: 'get_divergence_time',
    description:
      'Get the estimated divergence time between two taxa from the ' +
      'TimeTree database. Returns the median time, confidence ' +
      'interval, adjusted time, number of contributing studies, and ' +
      'a list of individual study estimates with author, year, ' +
      'title, and PubMed IDs. Example: human vs. mouse → ~84 MYA.',
    inputSchema: zodToInputSchema(GetDivergenceTimeSchema),
  },
  {
    name: 'get_timeline',
    description:
      'Build an evolutionary timeline for a single taxon from the ' +
      'TimeTree database. Returns the nodes in the timeline with ' +
      'their names, ranks, divergence times, clade sizes, and ' +
      'biodiversity metrics (phylogenetic diversity, evolutionary ' +
      'distinctiveness).',
    inputSchema: zodToInputSchema(GetTimelineSchema),
  },
  {
    name: 'get_timetree_info',
    description:
      'Get general information about the TimeTree database, ' +
      'including the number of studies, species count, citation, ' +
      'and supported features.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

/* ════════════════════════════════════════════════════════════════════════
 *  Formatting helpers (turn structured results into readable text)
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Format a taxon match for display.
 *
 * The `label` field already contains the common name and scientific
 * name in parentheses (e.g. `"human (Homo sapiens)"`), so we only
 * append the scientific name in italics when it is **not** already
 * part of the label.
 */
function formatTaxon(t: TaxonMatch): string {
  const sciName =
    t.scientificName && !t.label.includes(t.scientificName)
      ? ` (*${t.scientificName}*)`
      : '';
  return `${t.label}${sciName} [ID: ${t.id}, Rank: ${t.rank || 'N/A'}]`;
}

function formatDivergenceTime(result: DivergenceTimeResult): string {
  const lines: string[] = [];
  lines.push('# Divergence Time Result');
  lines.push('');
  lines.push(`**Taxon A:** ${formatTaxon(result.taxonA)}`);
  lines.push(`**Taxon B:** ${formatTaxon(result.taxonB)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Median Time: ${result.medianTime} MYA`);
  lines.push(
    `- Confidence Interval: ${result.ciLower} – ${result.ciUpper} MYA`,
  );
  lines.push(`- Adjusted Time: ${result.adjustedTime} MYA`);
  lines.push(`- Number of Studies: ${result.numberOfStudies}`);
  lines.push('');

  if (result.studies.length > 0) {
    lines.push('## Molecular Time Estimates');
    lines.push('');
    lines.push(
      '| Time (MYA) | Author | Year | Title | PubMed ID | Citations |',
    );
    lines.push('|---|---|---|---|---|---|');
    for (const s of result.studies) {
      lines.push(
        `| ${s.time} | ${s.author} | ${s.year} | ${s.title} | ${s.pubmedId || 'N/A'} | ${s.citationCount || 'N/A'} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '---\n' +
      '*TimeTree summary times are calculated using the Huber ' +
      'estimator (a robust average). Adjusted times use a smoothing ' +
      'technique so the resulting tree is ultrametric.*',
  );
  lines.push(
    '*Cite: S. Kumar, M. Suleski, et al. (2022). TimeTree 5: An ' +
      'Expanded Resource for Species Divergence Times. Mol Biol Evol.*',
  );

  return lines.join('\n');
}

function formatTimeline(result: TimelineResult): string {
  const lines: string[] = [];
  lines.push('# Evolutionary Timeline');
  lines.push('');
  lines.push(`**Taxon:** ${formatTaxon(result.taxon)}`);
  lines.push('');
  lines.push(`**Nodes:** ${result.nodes.length}`);
  lines.push('');

  if (result.nodes.length > 0) {
    lines.push('| # | Name | Rank | Time (MYA) | Clade Size | Phylo. Diversity | Evo. Distinctiveness |');
    lines.push('|---|---|---|---|---|---|---|');
    result.nodes.forEach((n, i) => {
      lines.push(
        `| ${i + 1} | ${n.name || '(unnamed)'} | ${n.rank || 'N/A'} | ${n.time || 'N/A'} | ${n.cladeSize || 'N/A'} | ${n.phyloDiversity || 'N/A'} | ${n.evoDistinctiveness || 'N/A'} |`,
      );
    });
    lines.push('');
  }

  lines.push(
    '---\n' +
      '*Cite: S. Kumar, M. Suleski, et al. (2022). TimeTree 5: An ' +
      'Expanded Resource for Species Divergence Times. Mol Biol Evol.*',
  );

  return lines.join('\n');
}

function formatTimetreeInfo(): string {
  return [
    '# TimeTree Database Information',
    '',
    'TimeTree is a public knowledge-base for information on the',
    'evolutionary timescale of life. Data from thousands of published',
    'studies are assembled into a searchable tree of life scaled to',
    'time.',
    '',
    '**Current Statistics:**',
    '- Studies: 5,072',
    '- Species: 208,740',
    '- Version: TimeTree 5',
    '',
    '**Available Tools:**',
    '1. `search_taxa` – Search/resolve taxon names',
    '2. `get_divergence_time` – Divergence time between two taxa',
    '3. `get_timeline` – Evolutionary timeline for a taxon',
    '4. `get_timetree_info` – This information',
    '',
    '**Website:** https://timetree.org',
    '',
    '---',
    '*Cite: S. Kumar, M. Suleski, J.E. Craig, A.E. Kasprowicz,',
    'M. Sanderford, M. Li, G. Stecher, and S.B. Hedges, 2022.',
    'TimeTree 5: An Expanded Resource for Species Divergence Times.',
    'Molecular Biology and Evolution, DOI: 10.1093/molbev/msac174.*',
  ].join('\n');
}

/* ════════════════════════════════════════════════════════════════════════
 *  Server creation
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Create and configure the MCP server.
 *
 * Exposed as a factory function so the entry point (`index.ts`) can
 * stay thin and tests can create a server instance without binding to
 * a transport.
 */
export function createServer(): Server {
  const server = new Server(
    { name: 'timetree-mcp', version: '0.1.0' },
    {
      capabilities: {
        tools: { listChanged: false },
      },
      instructions:
        'This MCP server provides access to the TimeTree database ' +
        '(timetree.org), a public knowledge-base for evolutionary ' +
        'divergence times. Use the tools to query species divergence ' +
        'times, build evolutionary timelines, and resolve taxon names.',
    },
  );

  const client = new TimeTreeClient();

  /* ── tools/list ─────────────────────────────────────────────────────── */

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  /* ── tools/call ────────────────────────────────────────────────────── */

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          /* ── search_taxa ────────────────────────────────────────── */
          case 'search_taxa': {
            const parsed = SearchTaxaSchema.safeParse(args);
            if (!parsed.success) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Invalid arguments: ${parsed.error.message}`,
                  },
                ],
                isError: true,
              };
            }
            const { taxon } = parsed.data;
            const matches = await client.searchTaxon(taxon);

            const lines: string[] = [];
            lines.push(`# Taxon Search Results for "${taxon}"`);
            lines.push('');
            lines.push(`**${matches.length} match(es) found:**`);
            lines.push('');
            lines.push('| # | Label | Common Name | Scientific Name | NCBI ID | Rank |');
            lines.push('|---|---|---|---|---|---|');
            matches.forEach((m, i) => {
              lines.push(
                `| ${i + 1} | ${m.label} | ${m.commonName} | ${m.scientificName || 'N/A'} | ${m.id} | ${m.rank} |`,
              );
            });
            lines.push('');
            lines.push(
              'Use the NCBI ID or the exact label in subsequent queries.',
            );

            return {
              content: [{ type: 'text' as const, text: lines.join('\n') }],
            };
          }

          /* ── get_divergence_time ─────────────────────────────────── */
          case 'get_divergence_time': {
            const parsed = GetDivergenceTimeSchema.safeParse(args);
            if (!parsed.success) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Invalid arguments: ${parsed.error.message}`,
                  },
                ],
                isError: true,
              };
            }
            const { taxon_a, taxon_b } = parsed.data;
            const outcome = await client.quickDivergenceTime(
              taxon_a,
              taxon_b,
            );

            if (outcome.status === 'ambiguous') {
              const { taxonA, taxonB } = outcome.candidates;
              const lines: string[] = [];
              lines.push('# Multiple Matches Found');
              lines.push('');
              lines.push('The search returned multiple matches. Please refine your query.');
              lines.push('');
              lines.push('## Taxon A matches:');
              taxonA.forEach((m, i) => {
                lines.push(`${i + 1}. ${formatTaxon(m)}`);
              });
              lines.push('');
              lines.push('## Taxon B matches:');
              taxonB.forEach((m, i) => {
                lines.push(`${i + 1}. ${formatTaxon(m)}`);
              });
              return {
                content: [
                  { type: 'text' as const, text: lines.join('\n') },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatDivergenceTime(outcome.result),
                },
              ],
            };
          }

          /* ── get_timeline ───────────────────────────────────────── */
          case 'get_timeline': {
            const parsed = GetTimelineSchema.safeParse(args);
            if (!parsed.success) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Invalid arguments: ${parsed.error.message}`,
                  },
                ],
                isError: true,
              };
            }
            const { taxon } = parsed.data;
            const outcome = await client.quickTimeline(taxon);

            if (outcome.status === 'ambiguous') {
              const lines: string[] = [];
              lines.push('# Multiple Matches Found');
              lines.push('');
              lines.push('The search returned multiple matches. Please refine your query.');
              lines.push('');
              outcome.candidates.forEach((m, i) => {
                lines.push(`${i + 1}. ${formatTaxon(m)}`);
              });
              return {
                content: [
                  { type: 'text' as const, text: lines.join('\n') },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatTimeline(outcome.result),
                },
              ],
            };
          }

          /* ── get_timetree_info ─────────────────────────────────── */
          case 'get_timetree_info': {
            return {
              content: [
                { type: 'text' as const, text: formatTimetreeInfo() },
              ],
            };
          }

          /* ── unknown tool ──────────────────────────────────────── */
          default:
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Unknown tool: "${name}". Available tools: ${TOOLS.map((t) => t.name).join(', ')}`,
                },
              ],
              isError: true,
            };
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unknown error occurred';
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Start the MCP server on a stdio transport.
 *
 * This is the main entry point called by `index.ts`.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
