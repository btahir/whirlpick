// Content pages: /about/, /support/, /docs/agents/ and the 404.
import { DONATION_LINKS, SUPPORT_URL } from "../config/site";
import { ABOUT } from "../content/docs/about";
import { AGENTS_DOC } from "../content/docs/agents";
import { SUPPORT_DOC } from "../content/docs/support";
import type { DocPage } from "../content/types";
import { Faq, inline, Sections } from "../ui/Content";
import { Icon } from "../ui/primitives";
import { Footer, PageHeader } from "../ui/Shell";

function Doc({ doc, current, children, toc = false }: { doc: DocPage; current: string; children?: React.ReactNode; toc?: boolean }) {
  return (
    <>
      <PageHeader current={current} />
      <main id="main" className="page doc-page">
        <div className="page-in">
          <h1 className="display">{doc.h1}</h1>
          <p className="lede">{inline(doc.intro)}</p>
          {children}
          {toc ? (
            <nav className="toc" aria-label="On this page">
              <h2 className="eyebrow">On this page</h2>
              <ol>
                {doc.sections.map((s, i) => (
                  <li key={i}>
                    <a href={`#${s.id ?? `sec-${i}`}`}>{s.h2}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="prose">
            <Sections sections={doc.sections.map((s, i) => ({ ...s, id: s.id ?? `sec-${i}` }))} />
            {doc.faq ? <Faq items={doc.faq} /> : null}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function AboutPage() {
  return (
    <Doc doc={ABOUT} current="/about/" toc>
      <p className="support-inline">
        Whirlpick is free and ad-free. <a href={SUPPORT_URL}>Support Whirlpick</a>
      </p>
    </Doc>
  );
}

export function AgentsPage() {
  return <Doc doc={AGENTS_DOC} current="/docs/agents/" toc />;
}

export function SupportPage() {
  return (
    <>
      <PageHeader current={SUPPORT_URL} />
      <main id="main" className="page support-page">
        <div className="page-in">
          <h1 className="display">{SUPPORT_DOC.h1}</h1>
          <p className="lede">{inline(SUPPORT_DOC.intro)}</p>
          <div className="give">
            <a className="btn primary big" href={DONATION_LINKS.once} rel="noopener" data-testid="support-once">
              Give once, any amount
            </a>
            <p className="small muted">Pay what you like. Payments are handled by Stripe; Whirlpick never sees your card.</p>
          </div>
          <h2 className="eyebrow tiers-title">Or support it every month</h2>
          <ul className="tiers" data-testid="support-tiers">
            {DONATION_LINKS.monthly.map((m) => (
              <li key={m.href}>
                <a className="tier" href={m.href} rel="noopener">
                  <span className="amount">{m.label}</span>
                  <span className="per">a month</span>
                  <span className="note">{m.note}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="prose">
            <Sections sections={SUPPORT_DOC.sections} />
            {SUPPORT_DOC.faq ? <Faq items={SUPPORT_DOC.faq} /> : null}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader />
      <main id="main" className="page nf-page">
        <div className="page-in">
          <h1 className="display">This page isn't here</h1>
          <p className="lede">The link may be old or mistyped. Nothing you entered left your device.</p>
          <div className="acts">
            <a className="btn primary" href="/">
              <Icon name="play" /> Go to the wheel
            </a>
            <a className="btn" href="/verify/">
              <Icon name="seal" /> Check a draw
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
