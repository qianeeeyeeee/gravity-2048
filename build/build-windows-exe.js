const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'src', 'gravity-2048.html');
const iconPath = path.join(root, 'packaging', 'Gravity2048.ico');
const templatePath = path.join(root, 'packaging', 'Gravity2048Launcher.cs.template');
const generatedDir = path.join(root, 'build', 'generated');
const sourcePath = path.join(generatedDir, 'Gravity2048Launcher.cs');
const outputDir = path.join(root, 'dist');
const outputPath = path.join(outputDir, 'Gravity2048.exe');
const checksumPath = outputPath + '.sha256';

function findCompiler() {
  const candidates = [
    process.env.CSC,
    'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',
    'C:/Windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error('未找到 .NET Framework csc.exe。请在 Windows 环境构建。');
}

if (process.platform !== 'win32') {
  throw new Error('Windows EXE 只能在 Windows 环境构建。');
}

for (const required of [htmlPath, iconPath, templatePath]) {
  if (!fs.existsSync(required)) throw new Error('缺少文件: ' + required);
}

fs.mkdirSync(generatedDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const html = fs.readFileSync(htmlPath);
const compressedBase64 = zlib.gzipSync(html, { level: 9 }).toString('base64');
const template = fs.readFileSync(templatePath, 'utf8');
const marker = '__EMBEDDED_HTML_BASE64__';

if (!template.includes(marker)) throw new Error('启动器模板缺少嵌入标记');
const source = template.replace(marker, compressedBase64);
fs.writeFileSync(sourcePath, '\uFEFF' + source, 'utf8');

const embeddedMatch = source.match(/private const string EmbeddedHtmlGzipBase64 = "([^"]+)";/);
if (!embeddedMatch) throw new Error('无法读取嵌入的 HTML 数据');
const embeddedHtml = zlib.gunzipSync(Buffer.from(embeddedMatch[1], 'base64'));
if (!embeddedHtml.equals(html)) throw new Error('内嵌 HTML 与源码不一致');

const compiler = findCompiler();
execFileSync(compiler, [
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  '/codepage:65001',
  '/win32icon:' + iconPath,
  '/reference:System.dll',
  '/reference:System.Core.dll',
  '/reference:System.IO.Compression.dll',
  '/out:' + outputPath,
  sourcePath
], { stdio: 'inherit' });

const exe = fs.readFileSync(outputPath);
const sha256 = crypto.createHash('sha256').update(exe).digest('hex');
fs.writeFileSync(checksumPath, `${sha256}  Gravity2048.exe\r\n`, 'utf8');

console.log('构建完成');
console.log('EXE: ' + outputPath);
console.log('HTML: ' + html.length + ' bytes (内嵌校验通过)');
console.log('EXE: ' + exe.length + ' bytes');
console.log('SHA256: ' + sha256);
