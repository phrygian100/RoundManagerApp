/**
 * One-time script to set CORS on the Firebase Storage bucket.
 * Run from project root: node scripts/set-cors.js
 *
 * Uses Application Default Credentials — run `gcloud auth application-default login`
 * first, OR set GOOGLE_APPLICATION_CREDENTIALS to a service account key.
 *
 * Alternatively, this script falls back to using the Firebase CLI's stored
 * refresh token to obtain an access token via the Google OAuth2 endpoint.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BUCKET = 'roundmanagerapp.firebasestorage.app';

const corsConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'cors.json'), 'utf8')
);

async function getFirebaseToken() {
  // Try to read the Firebase CLI's stored refresh token
  const configPaths = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    path.join(process.env.APPDATA || '', 'firebase', 'firebase-tools.json'),
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
  ];

  let refreshToken = null;
  for (const p of configPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      refreshToken = data?.tokens?.refresh_token || data?.user?.tokens?.refresh_token;
      if (refreshToken) {
        console.log('Found refresh token in:', p);
        break;
      }
    } catch (_) {}
  }

  if (!refreshToken) {
    throw new Error(
      'Could not find Firebase CLI refresh token. Run "firebase login" first.'
    );
  }

  // Exchange refresh token for access token
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }).toString();

    const req = https.request(
      'https://oauth2.googleapis.com/token',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Token exchange failed (${res.statusCode}): ${data}`));
            return;
          }
          resolve(JSON.parse(data).access_token);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function setCors(accessToken) {
  const body = JSON.stringify({ cors: corsConfig });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}?fields=cors`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('CORS set successfully:', data);
            resolve();
          } else {
            reject(new Error(`CORS update failed (${res.statusCode}): ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log(`Setting CORS on gs://${BUCKET} ...`);
    const token = await getFirebaseToken();
    await setCors(token);
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
