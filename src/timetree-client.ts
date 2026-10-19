/**
 * TimeTree API client.
 *
 * The TimeTree web site (https://timetree.org) does not expose a
 * machine-readable JSON API.  Instead, the front-end uses a set of
 * internal AJAX endpoints that return **HTML fragments**.  This
 * module wraps those endpoints with a thin HTTP client and parses
 * the returned HTML into the structured types declared in `types.ts`.
 *
 * The following endpoints are used:
 *
 * | Endpoint                                    | Method | Purpose                                    |
 * |--------------------------------------------|--------|--------------------------------------------|
 * | `/ajax/names/{a}/{b}`                      | POST   | Resolve two taxon names to taxonomy ids    |
 * | `/ajax/pairwise/{idA}/{idB}`               | POST   | Get the divergence-time result for a pair  |
 * | `/ajax/name/timeline/{taxon}`              | POST   | Resolve a single taxon for timeline search |
 * | `/ajax/timeline/{id}`                      | POST   | Get an evolutionary timeline for one taxon |
 * | `/ajax/name/timetree/{taxon}`              | POST   | Resolve a taxon group for timetree build   |
 * | `/ajax/taxonomy/{id}`                      | POST   | Get available taxonomic ranks for a group  |
 *
 * All HTML parsing is done with lightweight regular expressions – the
 * fragments are small and well-structured, so pulling in a full DOM
 * parser would be overkill.  The regexes are deliberately conservative
 * and documented.
 */

import type {
  DivergenceTimeResult,
  StudyTime,
  TaxonMatch,
  TimelineResult,
  TreeNode,
  TimeTreeClientConfig,
} from './types.js';

/* ════════════════════════════════════════════════════════════════════════
 *  Default configuration
 * ════════════════════════════════════════════════════════════════════════ */

const DEFAULT_BASE_URL = 'https://timetree.org';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_USER_AGENT = 'timetree-mcp/0.1.0';

/* ════════════════════════════════════════════════════════════════════════
 *  Small HTML utility helpers
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Decode the handful of HTML entities that TimeTree uses in its
 * responses (`&amp;`, `&#x27;` / `&#39;` for apostrophes, `&quot;`,
 * `&lt;`, `&gt;`, and numeric entities like `&#xF6;`).
 */
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

/**
 * Strip all HTML tags from a string, keeping only the inner text.
 */
function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ''));
}

/* ════════════════════════════════════════════════════════════════════════
 *  TimeTreeClient
 * ════════════════════════════════════════════════════════════════════════ */

export class TimeTreeClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly userAgent: string;

  constructor(config?: Partial<TimeTreeClientConfig>) {
    this.baseUrl = (
      config?.baseUrl ??
      process.env.TIMETREE_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, ''); // strip trailing slashes
    this.timeout = Number(
      config?.timeout ??
        process.env.TIMETREE_TIMEOUT ??
        DEFAULT_TIMEOUT,
    );
    this.userAgent =
      config?.userAgent ??
      process.env.TIMETREE_USER_AGENT ??
      DEFAULT_USER_AGENT;
  }

  /* ── low-level HTTP ─────────────────────────────────────────────────── */

  /**
   * Perform a POST request to a TimeTree AJAX endpoint and return the
   * response body as text (HTML).
   *
   * TimeTree expects `application/x-www-form-urlencoded` POST bodies.
   */
  private async post(path: string, body: Record<string, string> = {}): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const encoded = new URLSearchParams(body).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html, */*; q=0.8',
          'User-Agent': this.userAgent,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: encoded,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(
          `TimeTree request failed: ${res.status} ${res.statusText} for ${url}`,
        );
      }

      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── name resolution ───────────────────────────────────────────────── */

  /**
   * Parse the `<select>` HTML fragment returned by the name-resolution
   * endpoints into an array of {@link TaxonMatch} objects.
   *
   * `<option>` elements look like:
   * ```html
   * <option value="9606" rank="species">human (Homo sapiens)</option>
   * ```
   * but the `rank` attribute may be absent (e.g. timeline search results):
   * ```html
   * <option value="271721">Human (Homo sapiens)</option>
   * ```
   */
  static parseTaxonOptions(html: string): TaxonMatch[] {
    const options: TaxonMatch[] = [];
    // Match each <option ...>...</option> individually, then extract
    // attributes from the tag so the order of attributes does not matter.
    const optionRe = /<option\b([^>]*)>(.*?)<\/option>/gis;
    let m: RegExpExecArray | null;
    while ((m = optionRe.exec(html)) !== null) {
      const attrs = m[1];
      const raw = m[2];
      const valueAttr = attrs.match(/\bvalue="([^"]*)"/i);
      if (!valueAttr) continue; // skip options without a value
      const id = valueAttr[1];
      const rankAttr = attrs.match(/\brank="([^"]*)"/i);
      const rank = rankAttr ? rankAttr[1] : '';
      const label = stripTags(raw).trim();
      // Split "common name (Scientific name)"
      const parenMatch = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      let commonName = label;
      let scientificName = '';
      if (parenMatch) {
        commonName = parenMatch[1].trim();
        scientificName = parenMatch[2].trim();
      }
      options.push({ id, label, commonName, scientificName, rank });
    }
    return options;
  }

  /**
   * Search for two taxon names and return the resolved matches for each.
   *
   * This calls `/ajax/names/{taxonA}/{taxonB}`, which returns an HTML
   * fragment containing **two** `<select>` elements: the first for
   * *Taxon 1* and the second for *Taxon 2*.
   */
  async searchTaxonPair(
    taxonA: string,
    taxonB: string,
  ): Promise<{ taxonA: TaxonMatch[]; taxonB: TaxonMatch[] }> {
    const safeA = encodeURIComponent(taxonA.trim());
    const safeB = encodeURIComponent(taxonB.trim());
    const html = await this.post(
      `/ajax/names/${safeA}/${safeB}`,
      {},
    );

    // The fragment contains two <select> blocks. We split on the
    // second "Taxon 2:" label to separate them.
    const splitIdx = html.indexOf('Taxon 2');
    let htmlA = html;
    let htmlB = '';
    if (splitIdx !== -1) {
      htmlA = html.slice(0, splitIdx);
      htmlB = html.slice(splitIdx);
    }

    const matchesA = TimeTreeClient.parseTaxonOptions(htmlA);
    const matchesB = TimeTreeClient.parseTaxonOptions(htmlB);

    if (matchesA.length === 0 && matchesB.length === 0) {
      throw new Error(
        `No matches found for "${taxonA}" and "${taxonB}". ` +
          'Please check the spelling or try a broader taxon name.',
      );
    }

    return { taxonA: matchesA, taxonB: matchesB };
  }

  /**
   * Search for a single taxon name (used by timeline / timetree queries).
   *
   * Calls `/ajax/name/timeline/{taxon}` which returns an HTML fragment
   * with a single `<select>`.
   */
  async searchTaxon(taxon: string): Promise<TaxonMatch[]> {
    const safe = encodeURIComponent(taxon.trim());
    const html = await this.post(
      `/ajax/name/timeline/${safe}`,
      { select_tag_id: 'timeline-resolve-target' },
    );
    const matches = TimeTreeClient.parseTaxonOptions(html);
    if (matches.length === 0) {
      throw new Error(
        `No matches found for "${taxon}". ` +
          'Please check the spelling or try a broader taxon name.',
      );
    }
    return matches;
  }

  /* ── divergence time ───────────────────────────────────────────────── */

  /**
   * Parse the pairwise divergence-time HTML result.
   *
   * The result page contains:
   * 1. An SVG with `<circle>` elements for each study (carrying `time`,
   *    `author`, `year`, `title`, `pubmed-id`, `ref-id`, `cit-number`).
   * 2. SVG `<text>` elements with "Median Time:", "CI: (...)", and
   *    "Adjusted Time:" values.
   * 3. A `<table id="time-estimates">` with rows for each study.
   */
  static parseDivergenceTime(
    html: string,
    taxonA: TaxonMatch,
    taxonB: TaxonMatch,
  ): DivergenceTimeResult {
    // ── Median time ──────────────────────────────────────────────────
    // e.g. <text ...>Median Time:</text>
    //      <text ...>84 MYA</text>
    const medianMatch = html.match(
      /Median Time:.*?>([\d.]+)\s*MYA/is,
    );
    const medianTime = medianMatch
      ? parseFloat(medianMatch[1])
      : NaN;

    // ── Confidence interval ─────────────────────────────────────────
    // e.g. CI: (80.1 - 86.9 MYA)
    const ciMatch = html.match(
      /CI:\s*\(\s*([\d.]+)\s*-\s*([\d.]+)\s*MYA\s*\)/i,
    );
    const ciLower = ciMatch ? parseFloat(ciMatch[1]) : NaN;
    const ciUpper = ciMatch ? parseFloat(ciMatch[2]) : NaN;

    // ── Adjusted time ───────────────────────────────────────────────
    // e.g. <text ...>Adjusted Time:</text>
    //      <text ...>84 MYA</text>
    // The adjusted time follows the "Adjusted Time:" label.
    const adjustedMatch = html.match(
      /Adjusted Time:.*?>([\d.]+)\s*MYA/is,
    );
    const adjustedTime = adjustedMatch
      ? parseFloat(adjustedMatch[1])
      : NaN;

    // ── Number of studies ───────────────────────────────────────────
    // e.g. "Molecular Time Estimates (75 Studies)" or
    //      "(Median and adjusted times were derived from 75 studies)"
    const studiesCountMatch = html.match(
      /(?:derived from|Time Estimates\s*\()\s*(\d+)\s*(?:Studies|studies)/i,
    );
    const numberOfStudies = studiesCountMatch
      ? parseInt(studiesCountMatch[1], 10)
      : 0;

    // ── Individual study estimates ──────────────────────────────────
    // Each study is a <circle ... time="51.61" author="Plessy"
    //   year="2024" title="..." pubmed-id="38621828" ref-id=""
    //   cit-number="5332" ... />
    const studies: StudyTime[] = [];
    const circleRe =
      /<circle\b[^>]*\btime="([\d.]+)"[^>]*\bauthor="([^"]*)"[^>]*\byear="([^"]*)"[^>]*\btitle="([^"]*)"[^>]*\bpubmed-id="([^"]*)"[^>]*\bref-id="([^"]*)"[^>]*\bcit-number="([^"]*)"[^>]*\/>/gis;
    // Also handle attributes in different order
    const circleRe2 =
      /<circle\b([^>]*?)\/>/gis;

    // First try the ordered regex; if it finds results, use them
    let cm: RegExpExecArray | null;
    while ((cm = circleRe.exec(html)) !== null) {
      studies.push({
        time: parseFloat(cm[1]),
        author: decodeHtml(cm[2]),
        year: cm[3],
        title: decodeHtml(cm[4]),
        pubmedId: cm[5],
        refId: cm[6],
        citationCount: cm[7],
      });
    }

    // If the ordered regex didn't match, try a more flexible approach:
    // parse each <circle> and extract attributes individually.
    if (studies.length === 0) {
      let cm2: RegExpExecArray | null;
      while ((cm2 = circleRe2.exec(html)) !== null) {
        const attrs = cm2[1];
        // Only consider circles that have a "time" attribute
        const timeAttr = attrs.match(/\btime="([\d.]+)"/i);
        if (!timeAttr) continue;
        const authorAttr = attrs.match(/\bauthor="([^"]*)"/i);
        const yearAttr = attrs.match(/\byear="([^"]*)"/i);
        const titleAttr = attrs.match(/\btitle="([^"]*)"/i);
        const pmidAttr = attrs.match(/\bpubmed-id="([^"]*)"/i);
        const refAttr = attrs.match(/\bref-id="([^"]*)"/i);
        const citAttr = attrs.match(/\bcit-number="([^"]*)"/i);
        studies.push({
          time: parseFloat(timeAttr[1]),
          author: authorAttr ? decodeHtml(authorAttr[1]) : '',
          year: yearAttr ? yearAttr[1] : '',
          title: titleAttr ? decodeHtml(titleAttr[1]) : '',
          pubmedId: pmidAttr ? pmidAttr[1] : '',
          refId: refAttr ? refAttr[1] : '',
          citationCount: citAttr ? citAttr[1] : '',
        });
      }
    }

    return {
      taxonA,
      taxonB,
      medianTime,
      ciLower,
      ciUpper,
      adjustedTime,
      numberOfStudies: numberOfStudies || studies.length,
      studies,
    };
  }

  /**
   * Get the full divergence-time result for two resolved taxa.
   *
   * Calls `/ajax/pairwise/{idA}/{idB}`.
   *
   * If only one match exists for each taxon (the common case), this
   * method is called directly.  When multiple matches exist the caller
   * should pick one id from each list returned by `searchTaxonPair`.
   */
  async getDivergenceTime(
    taxonA: TaxonMatch,
    taxonB: TaxonMatch,
  ): Promise<DivergenceTimeResult> {
    const html = await this.post(
      `/ajax/pairwise/${taxonA.id}/${taxonB.id}`,
      {
        'taxon-a': taxonA.commonName,
        'taxon-b': taxonB.commonName,
      },
    );

    return TimeTreeClient.parseDivergenceTime(html, taxonA, taxonB);
  }

  /* ── timeline ──────────────────────────────────────────────────────── */

  /**
   * Parse the timeline HTML result into a {@link TimelineResult}.
   *
   * The timeline result contains an SVG tree with `<circle>` elements
   * carrying `name`, `rank`, `time`, `otu`, `lncount`, `phylodiv`, and
   * `evodistinctiveness` attributes.
   */
  static parseTimeline(html: string, taxon: TaxonMatch): TimelineResult {
    const nodes: TreeNode[] = [];

    // Match all <circle> elements that have a "class" of "node" or
    // that carry taxon attributes.
    const circleRe = /<circle\b([^>]*?)\/>/gis;
    let m: RegExpExecArray | null;
    while ((m = circleRe.exec(html)) !== null) {
      const attrs = m[1];
      // Only consider circles with a name or id attribute
      const nameAttr = attrs.match(/\bname="([^"]*)"/i);
      const idAttr = attrs.match(/\bid="([^"]*)"/i);
      if (!nameAttr && !idAttr) continue;

      const rankAttr = attrs.match(/\brank="([^"]*)"/i);
      const timeAttr = attrs.match(/\btime="([^"]*)"/i);
      const otuAttr = attrs.match(/\botu="([^"]*)"/i);
      const lncountAttr = attrs.match(/\blncount="([^"]*)"/i);
      const phylodivAttr = attrs.match(/\bphylodiv="([^"]*)"/i);
      const evoAttr = attrs.match(/\bevodistinctiveness="([^"]*)"/i);

      // TimeTree's timeline SVG also contains geological event
      // markers (e.g. meteorite impact craters like "Vredefort",
      // "Chicxulub") rendered as <circle> elements.  These carry a
      // `name` attribute but lack any taxonomic metadata (`rank`,
      // `otu`, `lncount`, `phylodiv`, `evodistinctiveness`).  We
      // skip them so the result only contains actual tree-of-life
      // nodes.
      const hasTaxonMeta =
        rankAttr || otuAttr || lncountAttr || phylodivAttr || evoAttr;
      if (!hasTaxonMeta) continue;

      nodes.push({
        id: idAttr ? idAttr[1] : '',
        name: nameAttr ? decodeHtml(nameAttr[1]) : '',
        rank: rankAttr ? rankAttr[1] : '',
        time: timeAttr ? timeAttr[1] : '',
        isTip: otuAttr ? otuAttr[1] === 'true' : false,
        cladeSize: lncountAttr ? lncountAttr[1] : '',
        phyloDiversity: phylodivAttr ? phylodivAttr[1] : '',
        evoDistinctiveness: evoAttr ? evoAttr[1] : '',
      });
    }

    return { taxon, nodes };
  }

  /**
   * Get an evolutionary timeline for a single taxon.
   *
   * Calls `/ajax/timeline/{id}`.
   */
  async getTimeline(taxon: TaxonMatch): Promise<TimelineResult> {
    const html = await this.post(`/ajax/timeline/${taxon.id}`, {
      taxon: taxon.commonName,
      selected: taxon.id,
    });

    return TimeTreeClient.parseTimeline(html, taxon);
  }

  /* ── convenience helpers ───────────────────────────────────────────── */

  /**
   * One-shot helper: search for a pair of taxa and, when exactly one
   * match is found for each, immediately fetch the divergence time.
   *
   * When multiple matches are found the function returns the candidate
   * lists so the caller can disambiguate.
   */
  async quickDivergenceTime(
    taxonAName: string,
    taxonBName: string,
  ): Promise<
    | { status: 'ok'; result: DivergenceTimeResult }
    | { status: 'ambiguous'; candidates: { taxonA: TaxonMatch[]; taxonB: TaxonMatch[] } }
  > {
    const { taxonA, taxonB } = await this.searchTaxonPair(
      taxonAName,
      taxonBName,
    );

    // When exactly one match is found for each taxon, fetch the
    // divergence time right away.
    if (taxonA.length === 1 && taxonB.length === 1) {
      const result = await this.getDivergenceTime(taxonA[0], taxonB[0]);
      return { status: 'ok', result };
    }

    // When multiple matches exist for either side, return the
    // candidate lists so the caller can disambiguate.
    return {
      status: 'ambiguous',
      candidates: { taxonA, taxonB },
    };
  }

  /**
   * One-shot helper: search for a single taxon and, when exactly one
   * match is found, immediately fetch its timeline.
   */
  async quickTimeline(
    taxonName: string,
  ): Promise<
    | { status: 'ok'; result: TimelineResult }
    | { status: 'ambiguous'; candidates: TaxonMatch[] }
  > {
    const matches = await this.searchTaxon(taxonName);

    // When exactly one match is found, fetch its timeline.
    if (matches.length === 1) {
      const result = await this.getTimeline(matches[0]);
      return { status: 'ok', result };
    }

    // When multiple matches are found, return the candidate list so
    // the caller can disambiguate.
    return { status: 'ambiguous', candidates: matches };
  }
}
