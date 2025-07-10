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
} catch (error) {
  console.error('❌ Failed to update BUILD_ID:', error.message);
  process.exit(1);
} 