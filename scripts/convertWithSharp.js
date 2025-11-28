// Optional: Convert SVG to PNG using sharp
// First install: npm install sharp
// Then run: node scripts/convertWithSharp.js

const fs = require('fs');
const path = require('path');

try {
  const sharp = require('sharp');
  const imagesDir = path.join(__dirname, '../client/public/images');
  
  console.log('Converting SVG to PNG...');
  
  for (let i = 0; i <= 8; i++) {
    const svgPath = path.join(imagesDir, `hsitp_floor_${i}.svg`);
    const pngPath = path.join(imagesDir, `hsitp_floor_${i}.png`);
    
    if (fs.existsSync(svgPath)) {
      await sharp(svgPath)
        .resize(1200, 900)
        .png()
        .toFile(pngPath);
      console.log(`✅ Converted: hsitp_floor_${i}.png`);
    }
  }
  
  console.log('\n✅ All conversions complete!');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('❌ sharp module not found.');
    console.log('Install it with: npm install sharp');
    console.log('Or use online conversion tools instead.');
  } else {
    console.error('Error:', error.message);
  }
}

