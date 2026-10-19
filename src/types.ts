/**
 * Type definitions for the TimeTree MCP server.
 *
 * These interfaces describe the structured data we extract from
 * TimeTree's HTML responses, so that downstream code (tools, etc.)
 * can work with strongly-typed objects instead of raw HTML strings.
 */

/* ── Taxon search (name resolution) ─────────────────────────────────── */

/**
 * A single taxon match returned by the name-resolution endpoints
 * (e.g. `/ajax/names/{a}/{b}` or `/ajax/name/timeline/{taxon}`).
 *
 * The TimeTree web app returns a `<select>` with `<option>` entries;
 * each option's `value` is the NCBI taxonomy id and its `rank` attribute
 * gives the taxonomic rank.
 */
export interface TaxonMatch {
  /** NCBI taxonomy id of the matched taxon. */
  id: string;
  /** Human-readable label, e.g. `"human (Homo sapiens)"`. */
  label: string;
  /** Common-name portion (before the parentheses), e.g. `"human"`. */
  commonName: string;
  /** Scientific-name portion (inside the parentheses), e.g. `"Homo sapiens"`. */
  scientificName: string;
  /** Taxonomic rank, e.g. `"species"`, `"genus"`, `"family"`. */
  rank: string;
}

/* ── Pairwise divergence-time results ───────────────────────────────── */

/**
 * A single published molecular time estimate for a pair of taxa.
 *
 * TimeTree renders every study as a `<circle>` element inside the
 * results SVG; the attributes of that circle carry all the metadata
 * for the study.
 */
export interface StudyTime {
  /** Estimated divergence time in millions of years ago (MYA). */
  time: number;
  /** First author surname of the study. */
  author: string;
  /** Publication year. */
  year: string;
  /** Article title. */
  title: string;
  /** PubMed id (may be `0` or empty when not available). */
  pubmedId: string;
  /** TimeTree internal reference id. */
  refId: string;
  /** Citation count (number of times the study has been cited). */
  citationCount: string;
}

/**
 * Full divergence-time result for a pair of taxa.
 */
export interface DivergenceTimeResult {
  /** The resolved taxa that were actually compared. */
  taxonA: TaxonMatch;
  taxonB: TaxonMatch;
  /** Median divergence time in MYA (Huber-estimator robust average). */
  medianTime: number;
  /** Lower bound of the confidence interval in MYA. */
  ciLower: number;
  /** Upper bound of the confidence interval in MYA. */
  ciUpper: number;
  /** Adjusted time in MYA (smoothed so the tree is ultrametric). */
  adjustedTime: number;
  /** Number of studies contributing to the estimate. */
  numberOfStudies: number;
  /** Individual study time estimates. */
  studies: StudyTime[];
}

/* ── Timeline / timetree results ────────────────────────────────────── */

/**
 * A node in an evolutionary timeline or timetree.
 *
 * Each node corresponds to a `<circle>` element in the tree SVG;
 * its attributes carry the node's biological metadata.
 */
export interface TreeNode {
  /** Node id (position in the tree). */
  id: string;
  /** Name of the taxon at this node. */
  name: string;
  /** Taxonomic rank of the node. */
  rank: string;
  /** Estimated divergence time in MYA (empty string for tip nodes). */
  time: string;
  /** Whether this node is a tip (leaf / OTU). */
  isTip: boolean;
  /** Clade size (number of descendant leaves). */
  cladeSize: string;
  /** Phylogenetic diversity metric. */
  phyloDiversity: string;
  /** Evolutionary distinctiveness metric. */
  evoDistinctiveness: string;
}

/**
 * A timeline result, containing the list of nodes and a summary.
 */
export interface TimelineResult {
  /** The taxon that was queried. */
  taxon: TaxonMatch;
  /** All nodes in the timeline. */
  nodes: TreeNode[];
}

/* ── Generic API helper types ──────────────────────────────────────── */

/**
 * Configuration object for the TimeTree client.
 */
export interface TimeTreeClientConfig {
  /** Base URL of the TimeTree service. */
  baseUrl: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** User-Agent header value. */
  userAgent: string;
}
