import type { PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import type { QuoteBookEntry } from '../services/quoteBookService';
import { quoteSheetUrl } from '../services/quoteBookService';
import type { QuoteSheetBrand, QuoteSheetContent } from './quoteSheetHtml';

/** A5: one flyer per page. A4x2: A4 landscape, two A5 flyers side by side, to cut down the middle. */
export type QuoteSheetPaper = 'A5' | 'A4x2';

// Layout is drawn in A5 millimetres.
const W = 148;
const H = 210;
const PT_PER_MM = 72 / 25.4;

const ICON_PHONE = 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z';
const ICON_FACEBOOK = 'M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z';
const ICON_WEB = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.4 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.4-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z';

const lines = (text: string) => text.split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
const money = (n: number) => `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

function roundRectPath(w: number, h: number, r: number) {
  const k = 0.5523 * r;
  return `M${r},0 H${w - r} C${w - r + k},0 ${w},${r - k} ${w},${r} V${h - r} C${w},${h - r + k} ${w - r + k},${h} ${w - r},${h} H${r} C${r - k},${h} 0,${h - r + k} 0,${h - r} V${r} C0,${r - k} ${r - k},0 ${r},0 Z`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function canvasBytes(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png'): Uint8Array | null {
  try {
    const b64 = canvas.toDataURL(type, 0.9).split(',')[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (err) {
    console.warn('Quote sheet image could not be embedded (cross-origin?):', err);
    return null;
  }
}

/** Cover-fit crop to the target box at 300 dpi, as CSS background-size: cover does. */
async function coverJpeg(url: string, wMm: number, hMm: number): Promise<Uint8Array | null> {
  const img = await loadImage(url);
  if (!img) return null;
  const dpmm = 300 / 25.4;
  const cw = Math.round(wMm * dpmm);
  const ch = Math.round(hMm * dpmm);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return canvasBytes(canvas, 'image/jpeg');
}

async function circleLogoPng(url: string): Promise<Uint8Array | null> {
  const img = await loadImage(url);
  if (!img) return null;
  const size = 480;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  ctx.drawImage(img, (size - img.naturalWidth * s) / 2, (size - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return canvasBytes(canvas, 'image/png');
}

/**
 * Builds a print-ready PDF (front + back per quote) at the exact paper size, so the browser
 * print dialog's paper, margins and header/footer settings never touch the sheets.
 * Web only: uses DOM canvas for the logo and photo.
 */
export async function buildQuoteSheetsPdf(
  entries: QuoteBookEntry[],
  brand: QuoteSheetBrand,
  content: QuoteSheetContent,
  paper: QuoteSheetPaper = 'A5',
): Promise<Uint8Array> {
  // The self-contained UMD build: pdf-lib's ES build reads tslib's default export, which Metro's web resolution leaves undefined.
  const [{ PDFDocument, StandardFonts, rgb, degrees }, QRCode] = await Promise.all([
    // @ts-expect-error The UMD file has no declarations; it is typed by the cast.
    import('pdf-lib/dist/pdf-lib.min.js') as Promise<typeof import('pdf-lib')>,
    import('qrcode').then((m) => m.default),
  ]);

  const k = PT_PER_MM;
  const perPage = paper === 'A4x2' ? 2 : 1;
  const pageW = W * perPage * k;
  const pageH = H * k;

  const doc = await PDFDocument.create();
  doc.setTitle(entries.length === 1 ? `Quote ${entries[0].ref}` : `Quote sheets (${entries.length})`);
  doc.setCreator(brand.businessName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);

  const hex = (h: string): RGB => {
    const n = parseInt(h.replace('#', ''), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const BLUE = hex('#2E86AB');
  const INK = hex('#1f2933');
  const MUTED = hex('#52606d');
  const PALE = hex('#f0f7fa');
  const WHITE = rgb(1, 1, 1);

  // Standard PDF fonts only cover WinAnsi; swap anything else so one odd address cannot abort the run.
  const encodable = new Map<string, boolean>();
  const safe = (font: PDFFont, text: string) => Array.from(String(text ?? '').replace(/m²/g, 'sq m')).map((ch) => {
    const key = `${font.name}:${ch}`;
    if (!encodable.has(key)) {
      try { font.encodeText(ch); encodable.set(key, true); } catch { encodable.set(key, false); }
    }
    if (encodable.get(key)) return ch;
    if (/[‘’]/.test(ch)) return "'";
    if (/[“”]/.test(ch)) return '"';
    if (/[–—]/.test(ch)) return '-';
    return '';
  }).join('');

  // Left edge (mm) of the A5 panel being drawn; 0 or W on a doubled-up A4 page.
  let panelX = 0;
  const X = (mm: number) => (panelX + mm) * k;
  const Y = (mmFromTop: number) => pageH - mmFromTop * k;
  const pt = (mm: number) => mm * k;
  const widthMm = (font: PDFFont, text: string, sizeMm: number) => font.widthOfTextAtSize(text, pt(sizeMm)) / k;

  /** Draws one line whose CSS line box starts at `top` (mm). */
  const text = (page: PDFPage, str: string, x: number, top: number, size: number, font: PDFFont, color: RGB, lineHeight = 1.2, spacing = 0) => {
    const s = safe(font, str);
    const baseline = top + ((lineHeight - 1) * size) / 2 + 0.78 * size;
    if (!spacing) {
      page.drawText(s, { x: X(x), y: Y(baseline), size: pt(size), font, color });
      return;
    }
    let cx = x;
    for (const ch of Array.from(s)) {
      page.drawText(ch, { x: X(cx), y: Y(baseline), size: pt(size), font, color });
      cx += widthMm(font, ch, size) + spacing;
    }
  };

  const wrap = (str: string, font: PDFFont, size: number, maxW: number) => {
    const words = safe(font, str).split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && widthMm(font, next, size) > maxW) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };

  /** Wrapped paragraph; returns the height used (mm). */
  const para = (page: PDFPage, str: string, x: number, top: number, maxW: number, size: number, font: PDFFont, color: RGB, lineHeight: number) => {
    const ls = wrap(str, font, size, maxW);
    ls.forEach((l, i) => text(page, l, x, top + i * size * lineHeight, size, font, color, lineHeight));
    return ls.length * size * lineHeight;
  };

  const box = (page: PDFPage, x: number, top: number, w: number, h: number, r: number, opts: { color?: RGB; borderColor?: RGB; borderWidth?: number; opacity?: number }) => {
    page.drawSvgPath(roundRectPath(pt(w), pt(h), pt(r)), {
      x: X(x), y: Y(top), color: opts.color, opacity: opts.opacity,
      borderColor: opts.borderColor, borderWidth: opts.borderWidth ? pt(opts.borderWidth) : undefined,
    });
  };

  const tick = (page: PDFPage, x: number, top: number, size: number) => {
    const s = pt(size);
    page.drawSvgPath(`M${0.08 * s},${0.52 * s} L${0.36 * s},${0.8 * s} L${0.86 * s},${0.18 * s}`, {
      x: X(x), y: Y(top), borderColor: BLUE, borderWidth: s * 0.16, borderLineCap: 1 as any,
    });
  };

  const logoBytes = brand.logoUrl ? await circleLogoPng(brand.logoUrl) : null;
  const logo: PDFImage | null = logoBytes ? await doc.embedPng(logoBytes) : null;
  const photoBytes = content.photoUrl ? await coverJpeg(content.photoUrl, W, H - 44) : null;
  const photo: PDFImage | null = photoBytes ? await doc.embedJpg(photoBytes) : null;

  const services = lines(content.servicesText);
  const extras = lines(content.additionalServicesText);
  const initials = brand.businessName.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  const drawFront = (page: PDFPage, entry: QuoteBookEntry) => {
    // Header band
    page.drawRectangle({ x: X(0), y: Y(27), width: pt(W), height: pt(27), color: PALE });
    if (logo) {
      page.drawImage(logo, { x: X(8), y: Y(22), width: pt(15), height: pt(15) });
    } else {
      page.drawCircle({ x: X(15.5), y: Y(14.5), size: pt(7.5), color: BLUE });
      const iw = widthMm(bold, initials, 6);
      text(page, initials, 15.5 - iw / 2, 14.5 - 3.6, 6, bold, WHITE);
    }

    const badgeText = 'YOUR quote!';
    const badgeSize = 3.2;
    const bw = widthMm(bold, badgeText, badgeSize) + 6;
    const bh = badgeSize * 1.2 + 3.2;
    const bx = W - 8 - bw;
    const by = 14.5 - bh / 2;

    let brandSize = 5.6;
    const brandMax = bx - 4 - 27;
    while (brandSize > 3.6 && widthMm(bold, safe(bold, brand.businessName), brandSize) > brandMax) brandSize -= 0.2;
    const blockH = brandSize * 1.1 + 0.8 + (brand.tagline ? 2.8 * 1.2 : 0);
    const blockTop = 14.5 - blockH / 2;
    text(page, brand.businessName, 27, blockTop, brandSize, bold, INK, 1.1);
    if (brand.tagline) text(page, brand.tagline, 27, blockTop + brandSize * 1.1 + 0.8, 2.8, regular, MUTED);

    const rot = degrees(-4);
    const th = (-4 * Math.PI) / 180;
    page.drawSvgPath(roundRectPath(pt(bw), pt(bh), pt(3)), { x: X(bx), y: Y(by), color: hex('#f59e0b'), rotate: rot });
    const tx = 3;
    const ty = 1.6 + 0.1 * badgeSize + 0.78 * badgeSize;
    page.drawText(safe(bold, badgeText), {
      x: X(bx) + pt(tx * Math.cos(th) + ty * Math.sin(th)),
      y: Y(by) + pt(tx * Math.sin(th) - ty * Math.cos(th)),
      size: pt(badgeSize), font: bold, color: WHITE, rotate: rot,
    });

    // Body
    const left = 8;
    const inner = W - 16;
    let y = 32;
    const addrLines = ['The Homeowner', entry.address, entry.town, entry.postcode].filter(Boolean) as string[];
    addrLines.forEach((l, i) => text(page, l, left, y + i * 3.4 * 1.35, 3.4, i === 0 ? bold : regular, INK, 1.35));
    y += addrLines.length * 3.4 * 1.35 + 4;

    text(page, 'Your personal window cleaning quote', left, y, 5.2, bold, BLUE);
    y += 5.2 * 1.2 + 1.5;
    y += para(page, 'We have already priced your home, so there is no need for a visit. Pick the option that suits you.', left, y, inner, 3, regular, MUTED, 1.35) + 3.5;

    const options = entry.options.slice().sort((a, b) => a.frequencyWeeks - b.frequencyWeeks);
    const letters = ['A', 'B', 'C'];
    if (options.length) {
      const gap = 3;
      const ow = (inner - gap * (options.length - 1)) / options.length;
      const oh = 26.2;
      options.forEach((o, i) => {
        const ox = left + i * (ow + gap);
        box(page, ox, y, ow, oh, 3, { borderColor: BLUE, borderWidth: 0.5 });
        const cx = ox + ow / 2;
        const centred = (str: string, top: number, size: number, font: PDFFont, color: RGB, lh = 1.2, sp = 0) => {
          const s = safe(font, str);
          const w = widthMm(font, s, size) + sp * Math.max(0, Array.from(s).length - 1);
          text(page, s, cx - w / 2, top, size, font, color, lh, sp);
        };
        let oy = y + 2.6;
        centred(`OPTION ${letters[i] || i + 1}`, oy, 2.7, bold, BLUE, 1.2, 0.3);
        oy += 2.7 * 1.2 + 0.6;
        centred(`Every ${o.frequencyWeeks} weeks`, oy, 3.2, regular, INK);
        oy += 3.2 * 1.2 + 0.8;
        centred(money(o.price), oy, 9, bold, INK, 1.05);
        oy += 9 * 1.05;
        centred('per clean', oy, 2.6, regular, MUTED);
      });
      y += oh + 4;
    }

    if (entry.homeSummary) {
      const dLines = wrap(entry.homeSummary, regular, 3.1, inner - 6.8);
      const kh = 2.6 + 2.8 * 1.2 + 0.8 + dLines.length * 3.1 * 1.35 + 2.6;
      box(page, left, y, inner, kh, 3, { color: PALE });
      text(page, 'What we know about your home', left + 3.4, y + 2.6, 2.8, bold, BLUE);
      dLines.forEach((l, i) => text(page, l, left + 3.4, y + 2.6 + 2.8 * 1.2 + 0.8 + i * 3.1 * 1.35, 3.1, regular, INK, 1.35));
      y += kh + 3.5;
    }

    if (services.length) {
      text(page, "What's included", left, y, 3.2, bold, INK);
      y += 3.2 * 1.2 + 1.2;
      for (const s of services) {
        tick(page, left, y + 0.6, 2.8);
        y += para(page, s, left + 4.6, y, inner - 4.6, 3, regular, INK, 1.35) + 0.8;
      }
    }

    // QR footer
    const qrTop = H - 7 - 31;
    page.drawLine({
      start: { x: X(8), y: Y(qrTop) }, end: { x: X(W - 8), y: Y(qrTop) },
      thickness: pt(0.3), color: hex('#cbd2d9'), dashArray: [pt(1), pt(1)],
    });
    const codeTop = qrTop + 4;
    const qr = QRCode.create(quoteSheetUrl(brand.businessName, entry.ref), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const cell = 27 / n;
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.modules.get(r, c)) { c++; continue; }
        const start = c;
        while (c < n && qr.modules.get(r, c)) c++;
        // Slight overlap stops hairline gaps between modules in some viewers.
        page.drawRectangle({
          x: X(8 + start * cell), y: Y(codeTop + (r + 1) * cell) - 0.05,
          width: pt((c - start) * cell) + 0.05, height: pt(cell) + 0.1, color: rgb(0, 0, 0),
        });
      }
    }

    const tx0 = 8 + 27 + 4;
    const tw = W - 8 - tx0;
    const how = `Confirm your address, choose ${options.map((o) => `${o.frequencyWeeks}`).join(' or ')} weekly, and leave your name and mobile. We will be in touch to book your first clean.`;
    const howLines = wrap(how, regular, 2.8, tw);
    const colH = 3.6 * 1.3 + 1 + howLines.length * 2.8 * 1.35 + 1.6 + 4.2 * 1.2;
    let cy = codeTop + (27 - colH) / 2;
    text(page, 'Scan to accept your quote', tx0, cy, 3.6, bold, INK, 1.3);
    cy += 3.6 * 1.3 + 1;
    howLines.forEach((l, i) => text(page, l, tx0, cy + i * 2.8 * 1.35, 2.8, regular, MUTED, 1.35));
    cy += howLines.length * 2.8 * 1.35 + 1.6;
    text(page, 'Quote ref ', tx0, cy + 0.5, 3.4, regular, INK);
    text(page, entry.ref, tx0 + widthMm(regular, 'Quote ref ', 3.4), cy, 4.2, mono, INK, 1.2, 0.4);
  };

  const drawBack = (page: PDFPage) => {
    const photoH = H - 44;
    if (photo) page.drawImage(photo, { x: X(0), y: Y(photoH), width: pt(W), height: pt(photoH) });
    else page.drawRectangle({ x: X(0), y: Y(photoH), width: pt(W), height: pt(photoH), color: hex('#dddddd') });

    if (content.showBeforeAfter) {
      for (const [label, cx] of [['Before', W / 4], ['After', (W * 3) / 4]] as const) {
        const w = widthMm(bold, label, 3.6) + 6.8;
        const h = 3.6 * 1.2 + 2.4;
        box(page, cx - w / 2, 5, w, h, 2, { color: rgb(0, 0, 0), opacity: 0.6 });
        text(page, label, cx - w / 2 + 3.4, 5 + 1.2, 3.6, bold, WHITE);
      }
    }

    if (extras.length) {
      const ex = 8;
      const ew = W - 16;
      const colW = (ew - 10 - 4) / 2;
      const rows = Math.ceil(extras.length / 2);
      const rowH = 3.1 * 1.2;
      const note = 'Just ask when you accept your quote and we will price these for you too.';
      const noteLines = wrap(note, regular, 2.9, ew - 10).length;
      const eh = 4 + 4.6 * 1.2 + 2 + rows * rowH + (rows - 1) * 1.4 + 2.4 + noteLines * 2.9 * 1.2 + 4;
      const etop = H - 58 - eh;
      box(page, ex + 0.3, etop + 1, ew, eh, 3, { color: rgb(0, 0, 0), opacity: 0.12 });
      box(page, ex, etop, ew, eh, 3, { color: WHITE, opacity: 0.95 });
      let yy = etop + 4;
      text(page, 'Additional Services', ex + 5, yy, 4.6, bold, BLUE);
      yy += 4.6 * 1.2 + 2;
      extras.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const ix = ex + 5 + col * (colW + 4);
        const iy = yy + row * (rowH + 1.4);
        tick(page, ix, iy + 0.5, 2.9);
        text(page, s, ix + 4.4, iy, 3.1, regular, INK);
      });
      yy += rows * rowH + (rows - 1) * 1.4 + 2.4;
      para(page, note, ex + 5, yy, ew - 10, 2.9, regular, MUTED, 1.2);
    }

    // Footer: 52mm tall, top edge an 8mm elliptical arch, drawn over the bottom of the photo.
    const ft = H - 52;
    const c = 0.5523;
    const fw = pt(W);
    const fr = pt(8);
    const fh = pt(52);
    page.drawSvgPath(
      `M0,${fr} C0,${fr - fr * c} ${fw / 2 - (fw / 2) * c},0 ${fw / 2},0 C${fw / 2 + (fw / 2) * c},0 ${fw},${fr - fr * c} ${fw},${fr} L${fw},${fh} L0,${fh} Z`,
      { x: X(0), y: Y(ft), color: BLUE },
    );
    let fy = ft + 9;
    text(page, 'Get in touch', 8, fy, 5.4, bold, WHITE);
    fy += 5.4 * 1.2 + 3;
    const row = (icon: string, str: string, size: number, iconMm: number, font: PDFFont) => {
      const lh = size * 1.2;
      page.drawSvgPath(icon, { x: X(8), y: Y(fy + (lh - iconMm) / 2), scale: pt(iconMm) / 24, color: WHITE });
      text(page, str, 8 + iconMm + 2.6, fy, size, font, WHITE);
      fy += lh + 2.2;
    };
    if (brand.mobileNumber) row(ICON_PHONE, brand.mobileNumber, 6, 5.6, bold);
    if (brand.facebookHandle) row(ICON_FACEBOOK, brand.facebookHandle, 3.8, 4.6, regular);
    if (brand.websiteAddress) row(ICON_WEB, brand.websiteAddress, 3.8, 4.6, regular);
  };

  // Doubled up: one sheet carries two homes' fronts, and its reverse two copies of the shared back.
  // Every half gets a back, including a blank front half on an odd run, so duplex flip direction cannot misplace them.
  for (let i = 0; i < entries.length; i += perPage) {
    const group = entries.slice(i, i + perPage);
    const front = doc.addPage([pageW, pageH]);
    group.forEach((entry, j) => { panelX = j * W; drawFront(front, entry); });
    const back = doc.addPage([pageW, pageH]);
    for (let j = 0; j < perPage; j++) { panelX = j * W; drawBack(back); }
  }
  return doc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
