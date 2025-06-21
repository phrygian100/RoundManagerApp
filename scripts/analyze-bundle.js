const fs = require('fs');
const path = require('path');

// Analyze bundle size and dependencies
function analyzeBundle() {
  console.log('🔍 Analyzing bundle size and dependencies...\n');

  // Check package.json for large dependencies
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  console.log('📦 Dependencies Analysis:');
  console.log('========================');
  
  const largeDeps = [];
  Object.entries(dependencies).forEach(([name, version]) => {
    // Known large packages
    const largePackages = [
      'firebase',
      'react-native-reanimated',
      'react-native-gesture-handler',
      'expo',
      'react-native',
      'react'
    ];
    
    if (largePackages.includes(name)) {
      largeDeps.push({ name, version, size: 'Large' });
    }
  });

  largeDeps.forEach(dep => {
    console.log(`⚠️  ${dep.name}@${dep.version} - ${dep.size}`);
  });

  // Check for unused imports
  console.log('\n🔍 Checking for potential optimizations:');
  console.log('=====================================');
  
  const optimizationTips = [
    '✅ Use React.memo() for expensive components',
    '✅ Implement useMemo() for expensive calculations',
    '✅ Use useCallback() for function props',
    '✅ Enable removeClippedSubviews on FlatLists',
    '✅ Use maxToRenderPerBatch and windowSize props',
    '✅ Implement proper error boundaries',
    '✅ Use lazy loading for screens',
    '✅ Optimize images with proper formats and sizes',
    '✅ Minimize re-renders with proper state management',
    '✅ Use Firebase offline persistence strategically'
  ];

  optimizationTips.forEach(tip => {
    console.log(tip);
  });

  // Check file sizes
  console.log('\n📁 File Size Analysis:');
  console.log('=====================');
  
  const appDir = 'app';
  const fileSizes = [];
  
  function getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const size = getFileSize(filePath);
        if (size > 5000) { // Files larger than 5KB
          fileSizes.push({
            path: filePath,
            size: size,
            sizeKB: (size / 1024).toFixed(2)
          });
        }
      }
    });
  }

  walkDir(appDir);
  
  fileSizes.sort((a, b) => b.size - a.size);
  fileSizes.slice(0, 10).forEach(file => {
    console.log(`📄 ${file.path} - ${file.sizeKB}KB`);
  });

  // Performance recommendations
  console.log('\n🚀 Performance Recommendations:');
  console.log('==============================');
  
  const recommendations = [
    '1. Implement code splitting for large components',
    '2. Use React.lazy() for route-based code splitting',
    '3. Optimize Firebase queries with proper indexing',
    '4. Implement virtual scrolling for large lists',
    '5. Use React DevTools Profiler to identify bottlenecks',
    '6. Consider using React Native Performance Monitor',
    '7. Implement proper loading states and skeleton screens',
    '8. Use React Native Flipper for debugging',
    '9. Optimize images and assets',
    '10. Implement proper error handling and retry logic'
  ];

  recommendations.forEach(rec => {
    console.log(rec);
  });

  console.log('\n✅ Bundle analysis complete!');
}

// Run the analysis
if (require.main === module) {
  analyzeBundle();
}

module.exports = { analyzeBundle }; 