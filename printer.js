const escpos = require('escpos');
const Network = require('escpos-network');
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRINTER_HOST = process.env.EPSON_PRINTER_HOST || '10.0.0.158';
const PRINTER_PORT = parseInt(process.env.EPSON_PRINTER_PORT, 10) || 9100;

// Printer width in pixels for 80mm paper at 203dpi
const PRINTER_WIDTH_PX = 576;

// Footer image width (80% of printer width)
const FOOTER_IMAGE_WIDTH_PX = Math.round(PRINTER_WIDTH_PX * 0.8);

// Socket timeout in ms
const SOCKET_TIMEOUT = 10000;

// Image paths
const HEADER_LOGO_PATH = path.join(__dirname, 'logo.png');
const FOOTER_IMAGE_PATH = path.join(__dirname, 'footer-image-1.png');
const DIVIDER_IMAGE_PATH = path.join(__dirname, 'divider-long.png');

// Divider syntax marker
const DIVIDER_MARKER = '{{divider}}';

// Branded footer - always printed on every receipt
const BRANDED_FOOTER = `- - -

Unusual Coffee
Visit us at unusual.coffee

- - -

Thank you!`;

/**
 * Process an image for thermal printing
 */
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

/**
 * Load an escpos Image from a file path
 */
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

/**
 * Print a receipt with auto-loaded header logo, body text, branded footer, and footer image.
 * Supports {{divider}} syntax in body to insert divider-long.png
 * @param {string} body - Main body text
 * @param {Buffer} [bodyImageBuffer] - Optional image between body and footer
 * @param {string} [orderDetails] - Optional order details printed below branded footer
 */
async function printReceipt({ body, bodyImageBuffer, orderDetails }) {
  const tempFiles = [];

  try {
    // Load and process header logo
    if (!fs.existsSync(HEADER_LOGO_PATH)) {
      throw new Error(
        'Header logo not found: logo.png must exist in project root'
      );
    }
    const headerBuffer = fs.readFileSync(HEADER_LOGO_PATH);
    const processedHeader = await processImage(headerBuffer, PRINTER_WIDTH_PX);
    const headerTempPath = path.join(
      os.tmpdir(),
      `receipt-header-${Date.now()}.png`
    );
    fs.writeFileSync(headerTempPath, processedHeader);
    tempFiles.push(headerTempPath);
    const headerImage = await loadEscposImage(headerTempPath);

    // Load divider image if it exists
    let dividerImage = null;
    if (fs.existsSync(DIVIDER_IMAGE_PATH)) {
      const dividerBuffer = fs.readFileSync(DIVIDER_IMAGE_PATH);
      const processedDivider = await processImage(
        dividerBuffer,
        PRINTER_WIDTH_PX
      );
      const dividerTempPath = path.join(
        os.tmpdir(),
        `receipt-divider-${Date.now()}.png`
      );
      fs.writeFileSync(dividerTempPath, processedDivider);
      tempFiles.push(dividerTempPath);
      dividerImage = await loadEscposImage(dividerTempPath);
    }

    // Process footer image (80% width) if it exists
    let footerImage = null;
    if (fs.existsSync(FOOTER_IMAGE_PATH)) {
      const footerBuffer = fs.readFileSync(FOOTER_IMAGE_PATH);
      const processedFooter = await processImage(
        footerBuffer,
        FOOTER_IMAGE_WIDTH_PX
      );
      const footerTempPath = path.join(
        os.tmpdir(),
        `receipt-footer-${Date.now()}.png`
      );
      fs.writeFileSync(footerTempPath, processedFooter);
      tempFiles.push(footerTempPath);
      footerImage = await loadEscposImage(footerTempPath);
    }

    // Process optional body image (80% width)
    let bodyImage = null;
    if (bodyImageBuffer) {
      const processedBodyImage = await processImage(
        bodyImageBuffer,
        FOOTER_IMAGE_WIDTH_PX
      );
      const bodyImageTempPath = path.join(
        os.tmpdir(),
        `receipt-body-img-${Date.now()}.png`
      );
      fs.writeFileSync(bodyImageTempPath, processedBodyImage);
      tempFiles.push(bodyImageTempPath);
      bodyImage = await loadEscposImage(bodyImageTempPath);
    }

    // Split body by divider markers
    const bodySegments = body.split(DIVIDER_MARKER);

    // Create network device
    const device = new Network(PRINTER_HOST, PRINTER_PORT, SOCKET_TIMEOUT);

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Printer connection timeout'));
      }, SOCKET_TIMEOUT);

      device.open((err) => {
        if (err) {
          clearTimeout(timeoutId);
          return reject(
            new Error(`Failed to connect to printer: ${err.message}`)
          );
        }

        try {
          const printer = new escpos.Printer(device);

          // Initialize and print header
          printer
            .raw(Buffer.from([0x1b, 0x40]))
            .text('\n\n')
            .align('ct')
            .raster(headerImage)
            .text('\n\n');

          // Print body segments with dividers
          bodySegments.forEach((segment, index) => {
            // Print text segment (left aligned)
            if (segment.trim()) {
              printer.align('lt').text(segment);
            }

            // Print divider image after each segment except the last
            if (index < bodySegments.length - 1 && dividerImage) {
              printer.align('ct').raster(dividerImage);
            }
          });

          printer.text('\n\n');

          // Body image (if provided)
          if (bodyImage) {
            printer.align('ct').raster(bodyImage).text('\n\n');
          }

          // Branded footer (centered, bold, density 15)
          printer
            .align('ct')
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x0f]))
            .style('b')
            .text(BRANDED_FOOTER)
            .style('NORMAL')
            .raw(Buffer.from([0x1d, 0x28, 0x45, 0x02, 0x00, 0x31, 0x08]))
            .text('\n\n');

          // Order details (if provided) - printed below branded footer
          if (orderDetails && orderDetails.trim()) {
            printer
              .text('\n\n')
              .align('lt')
              .text(orderDetails.trim())
              .text('\n\n');
          }

          // Footer image
          if (footerImage) {
            printer.align('ct').raster(footerImage);
          }

          // Feed and cut
          printer
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
    // Clean up temp files
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

module.exports = { printReceipt };
