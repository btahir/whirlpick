// Static page bodies (prerender only; never in the client bundle). Each page is plain HTML with a
// `#root` slot where the interactive part is rendered and hydrated (tool, verify widget). Content,
// headers of content pages and the footer stay static, so the client JS carries no page copy.
import type { ReactNode } from "react";
import { DONATION_LINKS, REPO_URL, SUPPORT_URL } from "../config/site";
import { ABOUT } from "../content/docs/about";
import { AGENTS_DOC } from "../content/docs/agents";
import { SUPPORT_DOC } from "../content/docs/support";
import { VERIFY_DOC } from "../content/docs/verify";
import { HOME_CONTENT } from "../content/home";
import { LANDING_PAGES, landingBySlug } from "../content/landing/index";
import type { DocPage, LandingContent } from "../content/types";
import type { Route } from "../app/routes";
import { t } from "../copy/en";
import { Faq, inline, Sections } from "../ui/Content";
import { Icon } from "../ui/primitives";
import { Brand } from "../ui/Brand";

/** The slot the prerender fills with the React root's HTML. */
export const ROOT_SLOT = '<div id="root" data-slot="1"></div>';
function RootSlot() {
  return <div id="root" data-slot="1" />;
}

export function PageHeader({ current }: { current?: string }) {
  const links: [string, string][] = [
    ["/", "Wheel"],
    ["/?mode=teams", "Teams"],
    ["/verify/", "Verify"],
    ["/about/", "About"],
  ];
  return (
    <header className="hdr page-hdr">
      <Brand />
      <div className="spacer" />
      <nav aria-label="Main" className="page-nav">
        {links.map(([href, label]) => (
          <a key={href} href={href} className="hbtn" aria-current={current === href ? "page" : undefined}>
            {label}
          </a>
        ))}
        <a className="hbtn support" href={SUPPORT_URL} aria-current={current === SUPPORT_URL ? "page" : undefined}>
          {t.support}
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <div className="ftr-in">
        <div className="ftr-brand">
          <Brand />
          <p className="small">Free, open source (MIT) and ad-free. Your lists stay on this device.</p>
        </div>
        <nav aria-label="Wheels for every job" className="ftr-links">
          <h2 className="eyebrow">Wheels</h2>
          <ul>
            {LANDING_PAGES.map((p) => (
              <li key={p.slug}>
                <a href={`/${p.slug}/`}>{p.navLabel}</a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Whirlpick" className="ftr-links ftr-small">
          <h2 className="eyebrow">Whirlpick</h2>
          <ul>
            <li>
              <a href="/verify/">Check a draw</a>
            </li>
            <li>
              <a href="/about/">About and privacy</a>
            </li>
            <li>
              <a href="/docs/agents/">For agents: CLI and MCP</a>
            </li>
            <li>
              <a href={REPO_URL} rel="noopener">
                Source on GitHub
              </a>
            </li>
            <li>
              <a href={SUPPORT_URL}>{t.support}</a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

function HomeContent() {
  return (
    <div className="content home-content">
      <div className="prose">
        <Sections sections={HOME_CONTENT.sections} />
        <section className="prose-section" aria-labelledby="jobs">
          <h2 id="jobs">A wheel for every job</h2>
          <ul className="jobs">
            {LANDING_PAGES.map((p) => (
              <li key={p.slug}>
                <a href={`/${p.slug}/`}>{p.navLabel}</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LandingBody({ page }: { page: LandingContent }) {
  const related = page.related.map((r) => landingBySlug(r)).filter((x): x is LandingContent => !!x);
  return (
    <div className="content">
      <article className="prose">
        <Sections sections={page.sections} />
        <Faq items={page.faq} />
        <p className="privacy-line">
          Nothing leaves your device: no account, no upload, no ads. <a href="/about/">How Whirlpick handles your lists</a>
        </p>
        {related.length ? (
          <nav className="related" aria-label="Related wheels">
            <h2 className="eyebrow">Related</h2>
            <ul>
              {related.map((r) => (
                <li key={r.slug}>
                  <a href={`/${r.slug}/`}>{r.navLabel}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </div>
  );
}

function DocShell({ doc, current, toc = false, children, slot = false }: { doc: DocPage; current: string; toc?: boolean; children?: ReactNode; slot?: boolean }) {
  return (
    <>
      <PageHeader current={current} />
      <main id="main" className={`page doc-page page-${current.replace(/\W+/g, "") || "x"}`}>
        <div className="page-in">
          <h1 className="display">{doc.h1}</h1>
          <p className="lede">{inline(doc.intro)}</p>
          {children}
          {slot ? <RootSlot /> : null}
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

function SupportBody() {
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
            <p className="small muted">Pay what you like. Stripe handles the payment; Whirlpick never sees your card.</p>
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

function NotFoundBody() {
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

/** The whole static body of a route, with the root slot where the interactive part goes. */
export function StaticBody({ route }: { route: Route }) {
  switch (route.kind) {
    case "home":
      return (
        <>
          <RootSlot />
          <div id="static" className="static">
            <HomeContent />
            <Footer />
          </div>
        </>
      );
    case "landing": {
      const page = landingBySlug(route.page.slug)!;
      return (
        <>
          <RootSlot />
          <div id="static" className="static">
            <LandingBody page={page} />
            <Footer />
          </div>
        </>
      );
    }
    case "embed":
      return <RootSlot />;
    case "verify":
      return <DocShell doc={VERIFY_DOC} current="/verify/" slot />;
    case "about":
      return (
        <DocShell doc={ABOUT} current="/about/" toc>
          <p className="support-inline">
            Whirlpick is free and ad-free. <a href={SUPPORT_URL}>Support Whirlpick</a>
          </p>
        </DocShell>
      );
    case "agents":
      return <DocShell doc={AGENTS_DOC} current="/docs/agents/" toc />;
    case "support":
      return <SupportBody />;
    case "notfound":
      return <NotFoundBody />;
  }
}
