const fs = require('fs');
const path = require('path');

// Copy marketing site assets to main public directory
console.log('📂 Copying marketing site assets...');

const webPublicDir = path.join(__dirname, '..', 'web', 'public');
const mainPublicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(webPublicDir)) {
  console.log('⚠️  No web assets to copy');
  process.exit(0);
}

// Ensure main public directory exists
if (!fs.existsSync(mainPublicDir)) {
  fs.mkdirSync(mainPublicDir, { recursive: true });
}

function copyAssets(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyAssets(srcPath, destPath);
    } else {
      // Only copy if file doesn't exist or is different
      if (!fs.existsSync(destPath) || fs.statSync(srcPath).mtime > fs.statSync(destPath).mtime) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ Copied ${entry.name}`);
      }
    }
  }
}

try {
  copyAssets(webPublicDir, mainPublicDir);
  console.log('✅ Marketing assets copied successfully!');

  const outreachCsv = path.join(__dirname, '..', 'data', 'uk-window-cleaners.csv');
  const outreachDestDir = path.join(mainPublicDir, 'data');
  if (fs.existsSync(outreachCsv)) {
    if (!fs.existsSync(outreachDestDir)) {
      fs.mkdirSync(outreachDestDir, { recursive: true });
    }
    fs.copyFileSync(outreachCsv, path.join(outreachDestDir, 'uk-window-cleaners.csv'));
    console.log('✅ Copied uk-window-cleaners.csv to public/data/');
  }
} catch (error) {
  console.error('❌ Error copying assets:', error.message);
  process.exit(1);
} 