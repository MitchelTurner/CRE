import {
  companyNameToDomainCandidates,
  extractContactsFromHtml,
  extractUrlsFromUnknown,
} from './website-contact.client';

describe('website-contact helpers', () => {
  it('builds domain candidates from LLC names', () => {
    const c = companyNameToDomainCandidates('ACME HOLDINGS LLC');
    expect(c.some((u) => u.includes('acmeholdings.com'))).toBe(true);
  });

  it('extracts emails and mailto people from HTML', () => {
    const html = `
      <html><title>Acme</title>
      <a href="mailto:jane.doe@acmeholdings.com">Email Jane</a>
      <p>John Smith, Principal — john.smith@acmeholdings.com</p>
      <p>Call (864) 555-1212</p>
      </html>`;
    const out = extractContactsFromHtml(html, 'https://acmeholdings.com/contact');
    expect(out.emails).toContain('jane.doe@acmeholdings.com');
    expect(out.phones.some((p) => p.includes('555'))).toBe(true);
    expect(out.people.some((p) => p.email === 'jane.doe@acmeholdings.com')).toBe(true);
  });

  it('pulls urls from sos raw and blocks linkedin', () => {
    const urls = extractUrlsFromUnknown({
      website: 'https://acmeholdings.com',
      social: 'https://www.linkedin.com/company/acme',
    });
    expect(urls).toContain('https://acmeholdings.com');
    expect(urls.some((u) => u.includes('linkedin'))).toBe(false);
  });
});
