// Mint (or revoke) an Agent Admin API key for your account.
//
// Usage:
//   node scripts/create-agent-key.cjs <email> <password> [label]
//   node scripts/create-agent-key.cjs <email> <password> --revoke-all
//
// Credentials can also come from TEST_EMAIL / TEST_PASSWORD env vars.
// The plaintext key is printed ONCE and never stored anywhere else.

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Public production web config (same as app.config.ts / other scripts).
const firebaseConfig = {
  apiKey: 'AIzaSyDGogz3xR5r-a3z6uheoljDDLYmkx41tXo',
  authDomain: 'roundmanagerapp.firebaseapp.com',
  projectId: 'roundmanagerapp',
  storageBucket: 'roundmanagerapp.appspot.com',
  messagingSenderId: '1049000869926',
  appId: '1:1049000869926:web:dbd1ff76e097cae72526e7',
};

async function main() {
  const email = process.argv[2] || process.env.TEST_EMAIL;
  const password = process.argv[3] || process.env.TEST_PASSWORD;
  const extra = process.argv[4] || '';

  if (!email || !password) {
    console.error('Usage: node scripts/create-agent-key.cjs <email> <password> [label | --revoke-all]');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app);

  console.log(`Signing in as ${email}...`);
  await signInWithEmailAndPassword(auth, email, password);

  if (extra === '--revoke-all') {
    const revokeFn = httpsCallable(functions, 'revokeAgentApiKey');
    const result = await revokeFn({});
    console.log(`Revoked ${result.data.revoked} key(s).`);
    return;
  }

  const label = extra || `Created ${new Date().toISOString().slice(0, 10)}`;
  const createFn = httpsCallable(functions, 'createAgentApiKey');
  const result = await createFn({ label });

  console.log('');
  console.log('Agent API key created. Store it securely - it cannot be retrieved again.');
  console.log('');
  console.log(`  Key ID: ${result.data.keyId}`);
  console.log(`  Key:    ${result.data.key}`);
  console.log('');
  console.log('Use it as an HTTP header: Authorization: Bearer <key>');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', (err && err.message) || err);
    process.exit(1);
  });
