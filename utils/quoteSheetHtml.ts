import type { QuoteBookEntry } from '../services/quoteBookService';
import { quoteSheetUrl } from '../services/quoteBookService';

export type QuoteSheetBrand = {
  businessName: string;
  tagline: string;
  logoUrl: string;
  mobileNumber: string;
  websiteAddress: string;
  facebookHandle: string;
};

export type QuoteSheetContent = {
  servicesText: string;
  additionalServicesText: string;
  photoUrl: string;
  showBeforeAfter: boolean;
};

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n: number) => `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

const lines = (text: string) => text.split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);

export async function buildQrSvgs(businessName: string, refs: string[]): Promise<Record<string, string>> {
  const QRCode = (await import('qrcode')).default;
  const out: Record<string, string> = {};
  for (const ref of refs) {
    out[ref] = await QRCode.toString(quoteSheetUrl(businessName, ref), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  }
  return out;
}

const CSS = `
@page { size: A5 portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2933; }
.page { width: 148mm; height: 210mm; position: relative; overflow: hidden; background: #fff; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
body.screen { display: flex; flex-wrap: wrap; gap: 8mm; justify-content: center; padding: 6mm; background: #eef2f5; }
.screen .page { box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.head { background: #f0f7fa; padding: 7mm 8mm 5mm; display: flex; align-items: center; gap: 4mm; }
.logo { width: 15mm; height: 15mm; border-radius: 50%; background: #2E86AB; overflow: hidden; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 6mm; }
.logo img { width: 100%; height: 100%; object-fit: cover; background: #fff; }
.brand { font-size: 5.6mm; font-weight: 800; color: #1f2933; line-height: 1.1; }
.tagline { font-size: 2.8mm; color: #52606d; margin-top: .8mm; }
.badge { margin-left: auto; background: #f59e0b; color: #fff; font-weight: 800; font-size: 3.2mm; padding: 1.6mm 3mm; border-radius: 3mm; transform: rotate(4deg); white-space: nowrap; }
.body { padding: 5mm 8mm 0; }
.addr { font-size: 3.4mm; line-height: 1.35; margin-bottom: 4mm; }
.addr .to { font-weight: 700; }
h1 { font-size: 5.2mm; margin: 0 0 1.5mm; color: #2E86AB; }
.intro { font-size: 3mm; color: #52606d; margin: 0 0 3.5mm; }
.opts { display: flex; gap: 3mm; margin-bottom: 4mm; }
.opt { flex: 1; border: .5mm solid #2E86AB; border-radius: 3mm; padding: 2.6mm 3mm; text-align: center; }
.opt .k { font-size: 2.7mm; font-weight: 700; color: #2E86AB; text-transform: uppercase; letter-spacing: .3mm; }
.opt .f { font-size: 3.2mm; margin-top: .6mm; }
.opt .p { font-size: 9mm; font-weight: 800; line-height: 1.05; margin-top: .8mm; }
.opt .u { font-size: 2.6mm; color: #52606d; }
.know { background: #f0f7fa; border-radius: 3mm; padding: 2.6mm 3.4mm; margin-bottom: 3.5mm; }
.know .t { font-size: 2.8mm; font-weight: 700; color: #2E86AB; margin-bottom: .8mm; }
.know .d { font-size: 3.1mm; line-height: 1.35; }
.inc .t { font-size: 3.2mm; font-weight: 700; margin-bottom: 1.2mm; }
.inc ul { margin: 0; padding: 0; list-style: none; }
.inc li { font-size: 3mm; line-height: 1.35; padding-left: 4.6mm; position: relative; margin-bottom: .8mm; }
.inc li:before { content: '✓'; position: absolute; left: 0; color: #2E86AB; font-weight: 800; }
.qr { position: absolute; left: 8mm; right: 8mm; bottom: 7mm; display: flex; align-items: center; gap: 4mm; border-top: .3mm dashed #cbd2d9; padding-top: 4mm; }
.qr .code { width: 27mm; height: 27mm; flex: none; }
.qr .code svg { width: 100%; height: 100%; display: block; }
.qr .cta { font-size: 3.6mm; font-weight: 700; line-height: 1.3; }
.qr .how { font-size: 2.8mm; color: #52606d; margin-top: 1mm; line-height: 1.35; }
.qr .ref { font-size: 3.4mm; margin-top: 1.6mm; }
.qr .ref b { font-family: 'Consolas', 'Courier New', monospace; font-size: 4.2mm; letter-spacing: .4mm; }
.photo { position: absolute; inset: 0 0 44mm 0; background: #ddd center/cover no-repeat; }
.ba { position: absolute; top: 5mm; left: 0; right: 0; display: flex; justify-content: space-around; }
.ba span { background: rgba(0,0,0,.6); color: #fff; font-weight: 800; font-size: 3.6mm; padding: 1.2mm 3.4mm; border-radius: 2mm; }
.extras { position: absolute; left: 8mm; right: 8mm; bottom: 58mm; background: rgba(255,255,255,.95); border-radius: 3mm; padding: 4mm 5mm; box-shadow: 0 1mm 3mm rgba(0,0,0,.15); }
.extras .t { font-size: 4.6mm; font-weight: 800; color: #2E86AB; margin-bottom: 2mm; }
.extras .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.4mm 4mm; }
.extras .grid div { font-size: 3.1mm; padding-left: 4.4mm; position: relative; }
.extras .grid div:before { content: '✓'; position: absolute; left: 0; color: #2E86AB; font-weight: 800; }
.extras .n { font-size: 2.9mm; color: #52606d; margin-top: 2.4mm; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 52mm; background: #2E86AB; color: #fff; padding: 9mm 8mm 0; border-radius: 50% 50% 0 0 / 8mm 8mm 0 0; }
.foot .t { font-size: 5.4mm; font-weight: 800; margin-bottom: 3mm; }
.foot .r { font-size: 3.8mm; margin-bottom: 2.2mm; display: flex; gap: 2.6mm; align-items: center; }
.foot .r svg { width: 4.6mm; height: 4.6mm; flex: none; fill: #fff; }
.foot .ph { font-size: 6mm; font-weight: 800; }
.foot .ph svg { width: 5.6mm; height: 5.6mm; }
`;

function frontPage(entry: QuoteBookEntry, brand: QuoteSheetBrand, content: QuoteSheetContent, qrSvg: string) {
  const options = entry.options.slice().sort((a, b) => a.frequencyWeeks - b.frequencyWeeks);
  const letters = ['A', 'B', 'C'];
  const initials = brand.businessName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const services = lines(content.servicesText);
  return `
<section class="page">
  <div class="head">
    <div class="logo">${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="">` : esc(initials)}</div>
    <div><div class="brand">${esc(brand.businessName)}</div><div class="tagline">${esc(brand.tagline)}</div></div>
    <div class="badge">YOUR quote!</div>
  </div>
  <div class="body">
    <div class="addr">
      <div class="to">The Homeowner</div>
      <div>${esc(entry.address)}</div>
      ${entry.town ? `<div>${esc(entry.town)}</div>` : ''}
      ${entry.postcode ? `<div>${esc(entry.postcode)}</div>` : ''}
    </div>
    <h1>Your personal window cleaning quote</h1>
    <p class="intro">We have already priced your home, so there is no need for a visit. Pick the option that suits you.</p>
    <div class="opts">
      ${options.map((o, i) => `
      <div class="opt">
        <div class="k">Option ${letters[i] || i + 1}</div>
        <div class="f">Every ${o.frequencyWeeks} weeks</div>
        <div class="p">${money(o.price)}</div>
        <div class="u">per clean</div>
      </div>`).join('')}
    </div>
    ${entry.homeSummary ? `<div class="know"><div class="t">What we know about your home</div><div class="d">${esc(entry.homeSummary)}</div></div>` : ''}
    ${services.length ? `<div class="inc"><div class="t">What's included</div><ul>${services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
  </div>
  <div class="qr">
    <div class="code">${qrSvg}</div>
    <div>
      <div class="cta">Scan to accept your quote</div>
      <div class="how">Confirm your address, choose ${options.map((o) => `${o.frequencyWeeks}`).join(' or ')} weekly, and leave your name and mobile. We will be in touch to book your first clean.</div>
      <div class="ref">Quote ref <b>${esc(entry.ref)}</b></div>
    </div>
  </div>
</section>`;
}

const ICON_PHONE = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>';
const ICON_FACEBOOK = '<svg viewBox="0 0 24 24"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>';
const ICON_WEB = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.4 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.4-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z"/></svg>';

function backPage(brand: QuoteSheetBrand, content: QuoteSheetContent) {
  const extras = lines(content.additionalServicesText);
  return `
<section class="page">
  <div class="photo" style="background-image:url('${esc(content.photoUrl)}')">
    ${content.showBeforeAfter ? '<div class="ba"><span>Before</span><span>After</span></div>' : ''}
  </div>
  ${extras.length ? `<div class="extras"><div class="t">Additional Services</div><div class="grid">${extras.map((s) => `<div>${esc(s)}</div>`).join('')}</div><div class="n">Just ask when you accept your quote and we will price these for you too.</div></div>` : ''}
  <div class="foot">
    <div class="t">Get in touch</div>
    ${brand.mobileNumber ? `<div class="r ph">${ICON_PHONE}${esc(brand.mobileNumber)}</div>` : ''}
    ${brand.facebookHandle ? `<div class="r">${ICON_FACEBOOK}${esc(brand.facebookHandle)}</div>` : ''}
    ${brand.websiteAddress ? `<div class="r">${ICON_WEB}${esc(brand.websiteAddress)}</div>` : ''}
  </div>
</section>`;
}

export function buildQuoteSheetsHtml(
  entries: QuoteBookEntry[],
  brand: QuoteSheetBrand,
  content: QuoteSheetContent,
  qrSvgs: Record<string, string>,
  opts: { screen?: boolean; title?: string } = {},
) {
  const back = backPage(brand, content);
  const pages = entries.map((e) => frontPage(e, brand, content, qrSvgs[e.ref] || '') + back).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title || 'Quote informed sheets')}</title><style>${CSS}</style></head>
<body class="${opts.screen ? 'screen' : ''}">${pages}</body></html>`;
}
