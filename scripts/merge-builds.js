const fs = require('fs');
const path = require('path');

// Script to merge the Next.js marketing build with the Expo build
console.log('🔄 Merging marketing site with main app...');

const distDir = path.join(__dirname, '..', 'dist');
const webOutDir = path.join(__dirname, '..', 'web', 'out'); // Next.js static export goes to 'out'
const marketingDistDir = path.join(distDir, '_marketing');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('❌ Main app build not found. Run expo export first.');
  process.exit(1);
}

// Check if marketing build exists
if (!fs.existsSync(webOutDir)) {
  console.log('⚠️  Marketing build not found, skipping merge...');
  process.exit(0);
}

// Copy Next.js static export to marketing subdirectory
try {
  console.log('📁 Copying Next.js static export...');
  copyDirectory(webOutDir, marketingDistDir);
  
  // Copy CSS and JS assets to the main _next directory for proper serving
  const nextDir = path.join(webOutDir, '_next');
  const distNextDir = path.join(distDir, '_next');
  
  if (fs.existsSync(nextDir)) {
    ensureDirectoryExists(distNextDir);
    copyDirectory(nextDir, distNextDir);
    console.log('📦 Copied Next.js assets to _next directory');
  }

  // Verify marketing pages exist (Next.js App Router creates /route/index.html)
  const routes = ['home', 'pricing', 'about', 'contact', 'privacy-policy', 'terms'];
  
  for (const route of routes) {
    const routeDir = path.join(marketingDistDir, route);
    const htmlFile = path.join(routeDir, 'index.html');
    
    if (fs.existsSync(htmlFile)) {
      console.log(`✅ Found ${route}/index.html`);
    } else {
      console.log(`⚠️  Missing ${route}/index.html - check Next.js build`);
    }
  }
  
  console.log('✅ Marketing site successfully merged!');
  console.log(`📂 Marketing files available at: ${marketingDistDir}`);
  console.log(`📂 Main app files available at: ${distDir}`);
} catch (error) {
  console.error('❌ Error merging builds:', error.message);
  process.exit(1);
}

function copyDirectory(src, dest) {
  ensureDirectoryExists(dest);
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} 