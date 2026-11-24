const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const iconsDir = path.resolve(__dirname, '..', 'icons');
const svgIconPath = path.join(iconsDir, 'icon.svg');
const svgPromoPath = path.join(iconsDir, 'promo-440x280.svg');

const iconSvgContent = fs.readFileSync(svgIconPath, 'utf8');
const promoSvgContent = fs.readFileSync(svgPromoPath, 'utf8');

const tasks = [
  { name: 'icon16.png', w: 16, h: 16, svg: iconSvgContent, bg: '00000000' },
  { name: 'icon32.png', w: 32, h: 32, svg: iconSvgContent, bg: '00000000' },
  { name: 'icon48.png', w: 48, h: 48, svg: iconSvgContent, bg: '00000000' },
  { name: 'icon128.png', w: 128, h: 128, svg: iconSvgContent, bg: '00000000' },
  { name: 'icon512.png', w: 512, h: 512, svg: iconSvgContent, bg: '00000000' },
  { name: 'promo-440x280.png', w: 440, h: 280, svg: promoSvgContent, bg: 'ff070b14' }
];

tasks.forEach(({ name, w, h, svg, bg }) => {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      background: ${bg === '00000000' ? 'transparent' : '#070b14'};
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  ${svg}
</body>
</html>`;

  const tmpHtml = path.join(iconsDir, `_temp_${w}x${h}.html`);
  fs.writeFileSync(tmpHtml, htmlContent);

  const outPng = path.join(iconsDir, name);
  const cmd = `"${chromePath}" --headless --disable-gpu --default-background-color=${bg} --window-size=${w},${h} --screenshot="${outPng}" "file:///${tmpHtml.replace(/\\/g, '/')}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`Generated: ${name} (${w}x${h})`);
  } catch (err) {
    console.error(`Error generating ${name}:`, err.message);
  } finally {
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
});
