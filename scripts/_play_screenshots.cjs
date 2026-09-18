// One-off: capture Play Store phone screenshots (1080x2400) from guvnor.app
// using headless Chrome, logged in as the Play demo account.
// Usage: node scripts/_play_screenshots.cjs <email> <password>

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '..', 'assets', 'play-store');
const WEEK = '2026-09-14';

async function main() {
  const [email, password] = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // 360x640 @3x = 1080x1920 (9:16, the only ratio the Play asset library accepts without cropping)
    defaultViewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();

  const API_KEY = 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo';
  console.log('Signing in via REST...');
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((r) => r.json());
  if (!signIn.idToken) throw new Error('REST sign-in failed: ' + JSON.stringify(signIn));
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: signIn.idToken }),
  }).then((r) => r.json());
  const u = lookup.users[0];

  const authUser = {
    uid: u.localId,
    email: u.email,
    emailVerified: !!u.emailVerified,
    displayName: u.displayName || null,
    isAnonymous: false,
    photoURL: u.photoUrl || null,
    providerData: [{
      providerId: 'password',
      uid: u.email,
      displayName: u.displayName || null,
      email: u.email,
      phoneNumber: null,
      photoURL: u.photoUrl || null,
    }],
    stsTokenManager: {
      refreshToken: signIn.refreshToken,
      accessToken: signIn.idToken,
      expirationTime: Date.now() + Number(signIn.expiresIn || 3600) * 1000,
    },
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    apiKey: API_KEY,
    appName: '[DEFAULT]',
  };

  console.log('Injecting session into IndexedDB...');
  await page.goto('https://www.guvnor.app/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((key, value) => new Promise((resolve, reject) => {
    const req = indexedDB.open('firebaseLocalStorageDb', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('firebaseLocalStorage')) {
        req.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      }
    };
    req.onsuccess = () => {
      const tx = req.result.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({ fbase_key: key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), `firebase:authUser:${API_KEY}:[DEFAULT]`, authUser);

  await page.goto('https://www.guvnor.app/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  console.log('After login URL:', page.url());

  const shots = [
    { url: `https://www.guvnor.app/runsheet/${WEEK}`, file: 'phone-03-runsheet.png', waitFor: 'Friday (8)', scrollToText: 'Friday (8)' },
    { url: 'https://www.guvnor.app/clients', file: 'phone-04-clients.png', waitFor: 'Total: 10 clients' },
  ];

  for (const s of shots) {
    console.log(`Navigating to ${s.url}...`);
    await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 60000 });
    try {
      await page.waitForFunction(
        (needle) => document.body && document.body.innerText.includes(needle),
        { timeout: 90000 },
        s.waitFor,
      );
    } catch (e) {
      console.log(`  (waitFor "${s.waitFor}" timed out; capturing anyway)`);
      console.log('  page text:', (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n+/g, ' | '));
    }
    await new Promise((r) => setTimeout(r, 2500));
    if (s.scrollToText) {
      await page.evaluate((needle) => {
        const els = Array.from(document.querySelectorAll('div, span'));
        const target = els.find((el) => el.children.length === 0 && (el.textContent || '').trim().startsWith(needle));
        if (target) target.scrollIntoView({ block: 'start' });
      }, s.scrollToText);
      await new Promise((r) => setTimeout(r, 1500));
    }
    const out = path.join(OUT, s.file);
    await page.screenshot({ path: out });
    console.log(`Saved ${out}`);
  }

  await browser.close();
}

main().catch((e) => { console.error('Failed:', e.message || e); process.exit(1); });
