/**
 * Test print script demonstrating fonts, styles, and density options
 * Run with: node test-print.js
 */

require('dotenv').config();
const escpos = require('escpos');
const Network = require('escpos-network');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRINTER_HOST = process.env.EPSON_PRINTER_HOST || '10.0.0.158';
const PRINTER_PORT = parseInt(process.env.EPSON_PRINTER_PORT, 10) || 9100;
const PRINTER_WIDTH_PX = 576;

async function testPrint() {
  let tempFilePath = null;

  try {
    // Process logo image
    const logoPath = path.join(__dirname, 'logo.png');
    if (!fs.existsSync(logoPath)) {
      throw new Error('logo.png not found in project root');
    }

    const imageBuffer = fs.readFileSync(logoPath);
    const processedImage = await sharp(imageBuffer)
      .resize({
        width: PRINTER_WIDTH_PX,
        height: undefined,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .grayscale()
      .threshold(128)
      .png()
      .toBuffer();

    tempFilePath = path.join(os.tmpdir(), `test-print-${Date.now()}.png`);
    fs.writeFileSync(tempFilePath, processedImage);

    const device = new Network(PRINTER_HOST, PRINTER_PORT, 15000);

    await new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) return reject(err);

        escpos.Image.load(tempFilePath, (imageOrErr) => {
          if (imageOrErr instanceof Error) return reject(imageOrErr);
          if (!imageOrErr || !imageOrErr.toRaster) return reject(new Error('Invalid image'));

          const image = imageOrErr;
          const printer = new escpos.Printer(device);

          // Separator line helper
          const sep = '================================';
          const sepThin = '--------------------------------';

          printer
            // Initialize
            .raw(Buffer.from([0x1b, 0x40]))

            // === HEADER WITH LOGO ===
            .align('ct')
            .raster(image)
            .text('\n')
            .style('b')
            .text('FONT & STYLE TEST PRINT')
            .style('NORMAL')
            .text('\n')
            .text(sep)
            .text('\n\n')

            // === FONT A vs FONT B ===
            .align('lt')
            .text('FONT COMPARISON')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .font('a')
            .text('Font A: ABCDEFGHIJKLMNOPQRSTUVWXYZ')
            .text('\n')
            .text('Font A: abcdefghijklmnopqrstuvwxyz')
            .text('\n')
            .text('Font A: 0123456789 !@#$%^&*()')
            .text('\n')
            .font('b')
            .text('Font B: ABCDEFGHIJKLMNOPQRSTUVWXYZ')
            .text('\n')
            .text('Font B: abcdefghijklmnopqrstuvwxyz')
            .text('\n')
            .text('Font B: 0123456789 !@#$%^&*()')
            .text('\n')
            .font('a')
            .text('\n')

            // === TEXT STYLES ===
            .text('TEXT STYLES')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .text('Normal text (default)')
            .text('\n')
            .style('b')
            .text('Bold text (style b)')
            .style('NORMAL')
            .text('\n')
            .style('u')
            .text('Underlined text (style u)')
            .style('NORMAL')
            .text('\n')
            .style('u2')
            .text('Double underline (style u2)')
            .style('NORMAL')
            .text('\n')
            .style('bu')
            .text('Bold + Underline (style bu)')
            .style('NORMAL')
            .text('\n')
            .style('i')
            .text('Inverted/Reverse (style i)')
            .style('NORMAL')
            .text('\n\n')

            // === SIZE VARIATIONS ===
            .text('SIZE VARIATIONS')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .size(1, 1)
            .text('Size 1x1 (normal)')
            .size(1, 1)
            .text('\n')
            .size(2, 1)
            .text('Size 2x1 (double width)')
            .size(1, 1)
            .text('\n')
            .size(1, 2)
            .text('Size 1x2 (double height)')
            .size(1, 1)
            .text('\n')
            .size(2, 2)
            .text('Size 2x2 (double both)')
            .size(1, 1)
            .text('\n\n')

            // === ALIGNMENT ===
            .text('ALIGNMENT')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .align('lt')
            .text('Left aligned text')
            .text('\n')
            .align('ct')
            .text('Center aligned text')
            .text('\n')
            .align('rt')
            .text('Right aligned text')
            .text('\n')
            .align('lt')
            .text('\n')

            // === DENSITY TEST ===
            // ESC 7 n1 n2 n3 - Set print parameters (heating dots, heating time, interval)
            // GS ( E - Set print density on some models
            .text('DENSITY / DARKNESS TEST')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .text('(Note: Density control varies by printer)')
            .text('\n\n')

            // Density level 1 (lighter) - GS ( E pL pH fn m
            // Command: 1D 28 45 02 00 31 density
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x01]))
            .text('Density 1 (lightest): Sample text')
            .text('\n')

            // Density level 4 (medium-light)
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x04]))
            .text('Density 4 (light): Sample text')
            .text('\n')

            // Density level 8 (default/medium)
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x08]))
            .text('Density 8 (default): Sample text')
            .text('\n')

            // Density level 12 (darker)
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x0c]))
            .text('Density 12 (dark): Sample text')
            .text('\n')

            // Density level 15 (darkest)
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x0f]))
            .text('Density 15 (darkest): Sample text')
            .text('\n')

            // Reset to default density
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x08]))
            .text('\n')

            // === BARCODE SAMPLE ===
            .text('BARCODE SAMPLE')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .align('ct')
            .barcode('123456789012', 'EAN13', { width: 2, height: 60, position: 'BLW' })
            .text('\n\n')

            // === QR CODE SAMPLE ===
            .text('QR CODE SAMPLE')
            .text('\n')
            .text(sepThin)
            .text('\n')
            .qrcode('https://example.com', 1, 'M', 6)
            .text('\n\n')

            // === FOOTER ===
            .align('ct')
            .text(sep)
            .text('\n')
            .font('b')
            .text('Test print completed')
            .text('\n')
            .text(new Date().toLocaleString())
            .font('a')
            .text('\n')

            // Feed and cut
            .feed(4)
            .cut()
            .close(() => {
              console.log('✅ Test print sent successfully!');
              resolve();
            });
        });
      });
    });
  } catch (err) {
    console.error('❌ Test print failed:', err.message);
    process.exit(1);
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

testPrint();





