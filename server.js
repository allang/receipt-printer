require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { printReceipt } = require('./printer');

const app = express();
const PORT = process.env.PORT || 3333;

// Parse JSON bodies (for simple requests without images)
app.use(express.json());

// Multer config: memory storage, 1MB max for optional body image
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB max
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPG images are allowed'));
    }
  },
});

// POST /print endpoint
// - Header logo (logo.png) is auto-loaded
// - Footer (branded text + footer-image-1.png) is auto-appended
// - Only 'body' is required, 'bodyImage' is optional
app.post('/print', upload.single('bodyImage'), async (req, res) => {
  try {
    // Validate body text
    const body = req.body.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Body text is required' });
    }
    if (body.length > 4000) {
      return res.status(400).json({ ok: false, error: 'Body text exceeds 4000 characters' });
    }

    // Get optional body image (prints between body text and footer)
    const bodyImageBuffer = req.file?.buffer || null;

    // Get optional order details (prints below branded footer)
    const orderDetails = req.body.orderDetails || null;

    // Print the receipt
    // - Header: auto-loaded from logo.png
    // - Body: from API
    // - Body Image: optional, from API
    // - Footer: auto-appended (branded text + footer-image-1.png)
    // - Order Details: optional, from API (below footer)
    await printReceipt({
      body: body.trim(),
      bodyImageBuffer,
      orderDetails,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Print error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Print failed' });
  }
});

// Handle multer errors (file size, type)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, error: 'Image exceeds 1MB limit' });
    }
    return res.status(400).json({ ok: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Receipt printer server running on http://localhost:${PORT}`);
  console.log(`Printer target: ${process.env.EPSON_PRINTER_HOST || '10.0.0.158'}:${process.env.EPSON_PRINTER_PORT || 9100}`);
  console.log(`Header logo: logo.png (auto-loaded)`);
  console.log(`Footer image: footer-image-1.png (auto-loaded)`);
});
