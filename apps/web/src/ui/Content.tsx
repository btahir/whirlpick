// Renders content modules (content/types.ts): paragraphs with the tiny inline markup, lists,
// steps, code and tables; FAQ as visible <details>-free Q&A (so crawlers and readers see it all).
import type { ReactNode } from "react";
import { REPO_URL, SITE_URL } from "../config/site";
import type { Block, FaqItem, Section } from "../content/types";

export function subst(s: string): string {
  return s.replaceAll("{SITE_URL}", SITE_URL).replaceAll("{REPO_URL}", REPO_URL);
}

/** [text](/path/), `code`, **bold**. Everything else is text (React escapes it). */
export function inline(src: string, key = "i"): ReactNode[] {
  const s = subst(src);
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) {
      const href = m[2]!;
      const external = /^https?:/.test(href);
      out.push(
        <a key={k} href={href} {...(external ? { rel: "noopener" } : {})}>
          {inline(m[1], k)}
        </a>,
      );
    } else if (m[3] !== undefined) out.push(<code key={k}>{m[3]}</code>);
    else if (m[4] !== undefined) out.push(<strong key={k}>{m[4]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function BlockView({ b, k }: { b: Block; k: string }) {
  if (typeof b === "string") return <p>{inline(b, k)}</p>;
  if ("list" in b)
    return (
      <ul>
        {b.list.map((x, i) => (
          <li key={i}>{inline(x, `${k}-${i}`)}</li>
        ))}
      </ul>
    );
  if ("steps" in b)
    return (
      <ol>
        {b.steps.map((x, i) => (
          <li key={i}>{inline(x, `${k}-${i}`)}</li>
        ))}
      </ol>
    );
  if ("code" in b)
    return (
      <pre className="code" tabIndex={0} aria-label={b.lang ? `${b.lang} example` : "Example"}>
        <code>{subst(b.code)}</code>
      </pre>
    );
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Table">
      <table>
        <thead>
          <tr>
            {b.table.head.map((h, i) => (
              <th key={i} scope="col">
                {inline(h, `${k}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{inline(c, `${k}-${i}-${j}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <section key={i} className="prose-section" id={s.id} aria-labelledby={`sec-${s.id ?? i}`}>
          <h2 id={`sec-${s.id ?? i}`}>{s.h2}</h2>
          {s.body.map((b, j) => (
            <BlockView key={j} b={b} k={`s${i}-${j}`} />
          ))}
        </section>
      ))}
    </>
  );
}

export function Faq({ items, title = "Questions" }: { items: FaqItem[]; title?: string }) {
  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">{title}</h2>
      <dl>
        {items.map((f, i) => (
          <div key={i} className="faq-item">
            <dt>{inline(f.q, `q${i}`)}</dt>
            <dd>{inline(f.a, `a${i}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Plain text of blocks (word counts and JSON-LD). */
export function blocksText(blocks: Block[]): string {
  const strip = (s: string) => subst(s).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");
  return blocks
    .map((b) => (typeof b === "string" ? strip(b) : "list" in b ? b.list.map(strip).join(" ") : "steps" in b ? b.steps.map(strip).join(" ") : "code" in b ? "" : b.table.rows.flat().map(strip).join(" ")))
    .join(" ");
}

export function plain(s: string): string {
  return subst(s).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");
}
