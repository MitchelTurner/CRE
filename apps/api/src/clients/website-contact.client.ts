/**
 * Best-effort public company website contact extraction.
 * Ethics: homepage /contact /about only. No LinkedIn, no login walls, no inventing people.
 */

export type WebsitePerson = {
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  sourceUrl: string;
};

export type WebsiteLookupResult = {
  websiteUrl: string | null;
  people: WebsitePerson[];
  emails: string[];
  phones: string[];
  title: string | null;
  probed: string[];
  note?: string;
};

const BLOCKED_HOSTS =
  /linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|google\./i;

/** Legal entity suffixes only — keep HOLDINGS/PROPERTIES for domain guesses. */
const SUFFIXES =
  /\b(LLC|L\.L\.C\.|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|LLP|PLC|CO\.?|COMPANY)\b/gi;

export function companyNameToDomainCandidates(name: string): string[] {
  const base = name
    .replace(SUFFIXES, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (base.length < 3) return [];
  const compact = base.replace(/\s+/g, '');
  const dashed = base.replace(/\s+/g, '-');
  const roots = [...new Set([compact, dashed].filter((s) => s.length >= 3 && s.length <= 40))];
  const tlds = ['com', 'net', 'co', 'us'];
  const out: string[] = [];
  for (const root of roots) {
    for (const tld of tlds) out.push(`https://www.${root}.${tld}`, `https://${root}.${tld}`);
  }
  return out.slice(0, 12);
}

export function extractUrlsFromUnknown(raw: unknown): string[] {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[),.;]+$/, '')))]
    .filter((u) => !BLOCKED_HOSTS.test(u))
    .slice(0, 10);
}

export class WebsiteContactClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async lookupCompany(input: {
    companyName: string;
    hintUrls?: string[];
  }): Promise<WebsiteLookupResult> {
    const probed: string[] = [];
    const candidates = [
      ...(input.hintUrls ?? []),
      ...companyNameToDomainCandidates(input.companyName),
    ];

    let websiteUrl: string | null = null;
    let html = '';
    let title: string | null = null;

    for (const url of candidates) {
      if (!url || BLOCKED_HOSTS.test(url)) continue;
      probed.push(url);
      try {
        const res = await this.fetchImpl(url, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+public-site-contact; no LinkedIn)',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        if (!/html|text/i.test(ct) && ct) continue;
        const body = await res.text();
        if (body.length < 200) continue;
        if (/captcha|cloudflare|access denied/i.test(body) && body.length < 5000) continue;
        websiteUrl = res.url || url;
        html = body;
        title = body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
        break;
      } catch {
        /* try next */
      }
    }

    if (!websiteUrl || !html) {
      return {
        websiteUrl: null,
        people: [],
        emails: [],
        phones: [],
        title: null,
        probed,
        note: 'No public website resolved from company name / SoS hints',
      };
    }

    const paths = ['', '/contact', '/contact-us', '/about', '/about-us', '/team'];
    const pages: Array<{ url: string; html: string }> = [{ url: websiteUrl, html }];
    const origin = new URL(websiteUrl).origin;

    for (const path of paths.slice(1)) {
      const pageUrl = `${origin}${path}`;
      probed.push(pageUrl);
      try {
        const res = await this.fetchImpl(pageUrl, {
          headers: {
            Accept: 'text/html',
            'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+public-site-contact)',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const body = await res.text();
        if (body.length > 200) pages.push({ url: res.url || pageUrl, html: body });
      } catch {
        /* ignore */
      }
    }

    const emails = new Set<string>();
    const phones = new Set<string>();
    const people: WebsitePerson[] = [];

    for (const page of pages) {
      const extracted = extractContactsFromHtml(page.html, page.url);
      extracted.emails.forEach((e) => emails.add(e));
      extracted.phones.forEach((p) => phones.add(p));
      for (const person of extracted.people) people.push(person);
    }

    // Deduplicate people by email/name
    const seen = new Set<string>();
    const uniquePeople = people.filter((p) => {
      const key = `${(p.email || '').toLowerCase()}|${(p.name || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(p.email || p.phone || p.name);
    });

    return {
      websiteUrl,
      people: uniquePeople.slice(0, 15),
      emails: [...emails].slice(0, 15),
      phones: [...phones].slice(0, 10),
      title,
      probed,
    };
  }
}

export function extractContactsFromHtml(
  html: string,
  sourceUrl: string,
): { emails: string[]; phones: string[]; people: WebsitePerson[] } {
  const emails = [
    ...new Set(
      (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
        .map((e) => e.toLowerCase())
        .filter(
          (e) =>
            !/example\.com|domain\.com|email\.com|sentry\.|wixpress|cloudflare|schema\.org/i.test(
              e,
            ),
        ),
    ),
  ];

  const phones = [
    ...new Set(
      (html.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? []).map((p) =>
        p.replace(/\s+/g, ' ').trim(),
      ),
    ),
  ];

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n');

  const people: WebsitePerson[] = [];
  // Patterns like: Jane Doe, Principal — jane@acme.com
  const lineRe =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,3})\s*[,|–—-]\s*([A-Za-z][A-Za-z /&]{2,40})\s*(?:[\n\r]|$).{0,80}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) && people.length < 12) {
    people.push({
      name: m[1]!.trim(),
      role: m[2]!.trim(),
      email: m[3]?.toLowerCase() ?? null,
      phone: null,
      sourceUrl,
    });
  }

  // mailto: with nearby name
  const mailtoRe = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  while ((m = mailtoRe.exec(html)) && people.length < 15) {
    const email = m[1]!.toLowerCase();
    if (people.some((p) => p.email === email)) continue;
    const local = email.split('@')[0] ?? '';
    const guessName = local.includes('.')
      ? local
          .split('.')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ')
      : null;
    people.push({
      name: guessName,
      role: 'website_contact',
      email,
      phone: null,
      sourceUrl,
    });
  }

  // Orphan emails as contacts
  for (const email of emails) {
    if (people.some((p) => p.email === email)) continue;
    people.push({
      name: null,
      role: 'website_contact',
      email,
      phone: null,
      sourceUrl,
    });
  }

  return { emails, phones, people };
}

export function createWebsiteContactClient(
  env: NodeJS.ProcessEnv = process.env,
): WebsiteContactClient | null {
  if (env.WEBSITE_SCRAPER_ENABLED === 'false') return null;
  return new WebsiteContactClient();
}
