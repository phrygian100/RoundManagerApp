const fs = require('fs');
const { execSync } = require('child_process');

try {
  // Get current commit hash
  const hash = execSync('git rev-parse --short HEAD').toString().trim();
  
  // Read login file
  const loginFile = 'app/login.tsx';
  const content = fs.readFileSync(loginFile, 'utf8');
  
  // Replace BUILD_ID line
  const updated = content.replace(
    /const BUILD_ID = '[^']*';/,
    `const BUILD_ID = '${hash}';`
  );
  
  // Write back
  fs.writeFileSync(loginFile, updated);
  
  console.log(`✅ Updated BUILD_ID to ${hash}`);

  // Debug: verify Firebase env-vars are present (does not log secrets)
  const firebaseKeys = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ];

  firebaseKeys.forEach((key) => {
    console.log(`env ${key}:`, process.env[key] ? '✔︎ present' : '❌ missing');
  });
} catch (error) {
  console.error('❌ Failed to update BUILD_ID:', error.message);
  process.exit(1);
} 