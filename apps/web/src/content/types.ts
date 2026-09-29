// Content module shapes. Landing pages, the about page and the agent docs are plain data so the
// prerender script can count words, check FAQs, build JSON-LD and guard banned claims.
//
// Inline markup inside any text string (kept deliberately tiny):
//   [link text](/path/)   → <a href="/path/">link text</a>   (internal paths only, trailing slash)
//   `code`                → <code>code</code>
//   **bold**              → <strong>bold</strong>
// Nothing else is interpreted. No HTML in strings.

/** A block of body content. A string is one paragraph. */
export type Block =
  | string
  | { list: string[] } // bulleted list
  | { steps: string[] } // numbered list
  | { code: string; lang?: string } // preformatted block (docs only)
  | { table: { head: string[]; rows: string[][] } }; // simple table (docs only)

export interface Section {
  h2: string;
  /** Optional anchor id (for example "algorithm" on the about page). */
  id?: string;
  body: Block[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface LandingContent {
  /** URL slug without slashes, for example "random-name-picker". The page lives at /<slug>/. */
  slug: string;
  /** Preset id from @whirlpick/core PRESETS (PLAN §6.10). */
  preset: string;
  /** Extra preset params, for example { min: "1", max: "100" } for "numbers". */
  presetParams?: Record<string, string>;
  /** Settings the page opens the tool with, on top of the preset (mode, team size, fair draw...). */
  open?: {
    mode?: "normal" | "elimination" | "multi" | "teams";
    count?: number | "all";
    reveal?: "sequential" | "instant";
    teamsBy?: "count" | "size";
    teams?: number;
    size?: number;
    fairDraw?: boolean;
  };
  /** <title>, at most 60 characters, unique across the site. */
  title: string;
  /** Meta description, 70–160 characters, unique across the site. */
  description: string;
  h1: string;
  /** One paragraph shown above the tool. */
  intro: string;
  /** At least 300 words in total across sections (FAQ not counted). */
  sections: Section[];
  /** 3–5 items, shown visibly and emitted as FAQPage JSON-LD. */
  faq: FaqItem[];
  /** 2–3 related landing slugs. */
  related: string[];
  /** Short label used in footers and "related" links, for example "Random name picker". */
  navLabel: string;
  /** ISO date (YYYY-MM-DD) of the last content edit; used for sitemap lastmod. */
  updated: string;
}

export interface DocPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: Section[];
  faq?: FaqItem[];
  updated: string;
}
