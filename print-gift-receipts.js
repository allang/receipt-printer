const escpos = require('escpos');
const Network = require('escpos-network');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRINTER_HOST = process.env.EPSON_PRINTER_HOST || '10.0.0.158';
const PRINTER_PORT = parseInt(process.env.EPSON_PRINTER_PORT, 10) || 9100;
const PRINTER_WIDTH_PX = 576;
const SOCKET_TIMEOUT = 10000;

const BOW_IMAGE_PATH = path.join(__dirname, 'bow.png');

async function processImage(buffer, width) {
  return sharp(buffer)
    .resize({
      width,
      height: undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .threshold(128)
    .png()
    .toBuffer();
}

function loadEscposImage(filePath) {
  return new Promise((resolve, reject) => {
    escpos.Image.load(filePath, (imageOrErr) => {
      if (imageOrErr instanceof Error) {
        return reject(new Error(`Failed to load image: ${imageOrErr.message}`));
      }
      if (!imageOrErr || !imageOrErr.toRaster) {
        return reject(new Error('Failed to load image: invalid image data'));
      }
      resolve(imageOrErr);
    });
  });
}

async function printGiftReceipt(fromName, toName) {
  const tempFiles = [];

  try {
    if (!fs.existsSync(BOW_IMAGE_PATH)) {
      throw new Error('bow.png not found in project root');
    }

    const bowBuffer = fs.readFileSync(BOW_IMAGE_PATH);
    const processedBow = await processImage(bowBuffer, PRINTER_WIDTH_PX);
    const bowTempPath = path.join(os.tmpdir(), `receipt-bow-${Date.now()}.png`);
    fs.writeFileSync(bowTempPath, processedBow);
    tempFiles.push(bowTempPath);
    const bowImage = await loadEscposImage(bowTempPath);

    const device = new Network(PRINTER_HOST, PRINTER_PORT, SOCKET_TIMEOUT);

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Printer connection timeout'));
      }, SOCKET_TIMEOUT);

      device.open((err) => {
        if (err) {
          clearTimeout(timeoutId);
          return reject(new Error(`Failed to connect to printer: ${err.message}`));
        }

        try {
          const printer = new escpos.Printer(device);

          printer
            .raw(Buffer.from([0x1b, 0x40]))
            .text('\n\n')
            .align('ct')
            .raster(bowImage)
            .text('\n\n\n')
            .align('ct')
            .style('b')
            .text(`From: ${fromName}`)
            .text(`To: ${toName}`)
            .style('NORMAL')
            .feed(3)
            .cut()
            .close(() => {
              clearTimeout(timeoutId);
              resolve();
            });
        } catch (printErr) {
          clearTimeout(timeoutId);
          device.close();
          reject(new Error(`Print failed: ${printErr.message}`));
        }
      });
    });
  } finally {
    for (const tempPath of tempFiles) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.warn('Failed to delete temp file:', e.message);
        }
      }
    }
  }
}

async function main() {
  console.log('Printing 3 gift receipts...');

  console.log('Printing receipt 1: From Miles to Mama');
  await printGiftReceipt('Miles', 'Mama');

  console.log('Printing receipt 2: From Papa to Mama');
  await printGiftReceipt('Papa', 'Mama');

  console.log('Printing receipt 3: From Papa to Mama');
  await printGiftReceipt('Papa', 'Mama');

  console.log('All receipts printed successfully!');

  // Delete this script
  const scriptPath = __filename;
  fs.unlinkSync(scriptPath);
  console.log('Script deleted.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

