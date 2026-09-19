require('dotenv').config(); // 
const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const useragent = require('express-useragent');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARES ====================
app.use(cors());
app.use(express.json());
app.use(useragent.express());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== MONGODB CONNECTION ====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// ==================== MONGODB SCHEMAS ====================
const qrCodeSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  destinationUrl: { type: String, required: true },
  customization: { type: Object, default: {} },
  qrDataUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const scanSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  qrcodeId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, default: '127.0.0.1' },
  device: { type: String, default: 'Desktop' },
  browser: { type: String, default: 'Unknown' },
  os: { type: String, default: 'Unknown' }
});

const QRModel = mongoose.model('QRCode', qrCodeSchema);
const ScanModel = mongoose.model('Scan', scanSchema);

// ==================== HELPER FUNCTIONS ====================

// 
function getHostname(req) {
  // अगर रेंडर पर ONLINE_URL सेट है तो वही इस्तेमाल होगा (उदा: https://onrender.com)
  if (process.env.ONLINE_URL) {
    return process.env.ONLINE_URL.replace(/\/$/, ""); 
  }
  // 
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

// Dynamic QR Code इमेज जनरेट करने का फंक्शन
async function generateQrDataUrl(id, hostname, customization = {}) {
  const redirectUrl = `${hostname}/r/${id}`;
  console.log(`Generating QR with URL: ${redirectUrl}`); // 
  
  const options = {
    errorCorrectionLevel: customization.ecc || 'M',
    margin: parseInt(customization.margin) || 4,
    color: {
      dark: customization.colorDark || '#000000',
      light: customization.colorLight || '#ffffff'
    },
    width: 600
  };
  return await QRCode.toDataURL(redirectUrl, options);
}

// ==================== API ROUTES ====================

// 1. 
app.get('/api/qrcodes', async (req, res) => {
  try {
    const qrcodes = await QRModel.find().lean();
    const qrcodesWithCounts = await Promise.all(qrcodes.map(async (qr) => {
      const scanCount = await ScanModel.countDocuments({ qrcodeId: qr.id });
      return { ...qr, scanCount };
    }));
    res.json(qrcodesWithCounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// 2. 
app.get('/api/qrcodes/:id', async (req, res) => {
  try {
    const qrcode = await QRModel.findOne({ id: req.params.id });
    if (!qrcode) {
      return res.status(404).json({ error: 'QR Code not found' });
    }
    const scans = await ScanModel.find({ qrcodeId: req.params.id });
    res.json({ qrcode, scans });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 3.
app.post('/api/qrcodes', async (req, res) => {
  const { title, destinationUrl, customization } = req.body;

  if (!title || !destinationUrl) {
    return res.status(400).json({ error: 'Title and Destination URL are required' });
  }

  try {
    new URL(destinationUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid destination URL format' });
  }

  const id = crypto.randomBytes(4).toString('hex');
  const hostname = getHostname(req); 
  
  try {
    const qrDataUrl = await generateQrDataUrl(id, hostname, customization);
    
    const newQr = new QRModel({
      id,
      title,
      destinationUrl,
      customization: customization || {},
      qrDataUrl
    });

    await newQr.save(); // MongoDB 
    res.status(201).json(newQr);
  } catch (err) {
    console.error('Error generating QR code image:', err);
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// 4. 
app.put('/api/qrcodes/:id', async (req, res) => {
  const { destinationUrl, title, customization } = req.body;
  
  try {
    const qrcode = await QRModel.findOne({ id: req.params.id });
    if (!qrcode) {
      return res.status(404).json({ error: 'QR Code not found' });
    }

    if (destinationUrl) {
      try { new URL(destinationUrl); } catch (e) { return res.status(400).json({ error: 'Invalid destination URL format' }); }
      qrcode.destinationUrl = destinationUrl;
    }

    if (title) qrcode.title = title;

    if (customization) {
      qrcode.customization = customization;
    }

    
    const hostname = getHostname(req); 
    qrcode.qrDataUrl = await generateQrDataUrl(req.params.id, hostname, qrcode.customization);

    await qrcode.save();
    res.json(qrcode);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update QR Code' });
  }
});

// 5. 
app.delete('/api/qrcodes/:id', async (req, res) => {
  try {
    const deleted = await QRModel.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ error: 'QR Code not found' });
    }
    await ScanModel.deleteMany({ qrcodeId: req.params.id }); // उससे जुड़े सारे स्कैन्स भी साफ़ करें
    res.json({ message: 'QR Code and associated analytics deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete QR Code' });
  }
});

// 6. 
app.get('/r/:id', async (req, res) => {
  try {
    const qrcode = await QRModel.findOne({ id: req.params.id });

    if (!qrcode) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>QR Code Not Found</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background-color: #0f172a; color: #f8fafc;">
          <h1 style="color: #f43f5e;">Error 404: Link Invalid</h1>
          <p style="color: #94a3b8;">This dynamic QR code link is expired, deleted, or invalid.</p>
          <a href="/" style="color: #3b82f6; text-decoration: none;">Go to Dashboard</a>
        </body>
        </html>
      `);
    }

    // 
    const ua = req.useragent;
    let device = 'Desktop';
    if (ua.isMobile) device = 'Mobile';
    else if (ua.isTablet) device = 'Tablet';

    const browser = ua.browser || 'Unknown';
    const os = ua.os || 'Unknown';

    // डेटाबेस में स्कैन लॉग करना
    const newScan = new ScanModel({
      id: crypto.randomBytes(8).toString('hex'),
      qrcodeId: qrcode.id,
      ip: req.headers['x-forwarded-for'] || req.ip || '127.0.0.1',
      device,
      browser,
      os
    });

    await newScan.save(); // स्कैन सेव हुआ
    res.redirect(302, qrcode.destinationUrl); 
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 7. Simulated Scan Endpoint (डैशबोर्ड टेस्ट बटन के लिए)
app.post('/api/simulate-scan', async (req, res) => {
  const { qrcodeId, device, browser, os } = req.body;
  try {
    const qrcode = await QRModel.findOne({ id: qrcodeId });
    if (!qrcode) {
      return res.status(404).json({ error: 'QR Code not found' });
    }

    const newScan = new ScanModel({
      id: crypto.randomBytes(8).toString('hex'),
      qrcodeId,
      ip: '127.0.0.1 (Simulated)',
      device: device || 'Mobile',
      browser: browser || 'Safari',
      os: os || 'iOS'
    });

    await newScan.save();
    res.json({ success: true, scan: newScan, destinationUrl: qrcode.destinationUrl });
  } catch (err) {
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});