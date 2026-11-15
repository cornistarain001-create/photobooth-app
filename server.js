const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support high-res base64 strips
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Initialize SQLite Database
const db = new sqlite3.Database(path.join(__dirname, 'photobooth.db'), (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS photo_strips (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      image_url TEXT NOT NULL,
      strip_count INTEGER NOT NULL,
      filter_used TEXT NOT NULL,
      theme_used TEXT NOT NULL,
      caption TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// API: Save a newly captured photo strip
app.post('/api/strips', (req, res) => {
  try {
    const { imageData, stripCount, filterUsed, themeUsed, caption } = req.body;

    if (!imageData || !stripCount || stripCount < 1 || stripCount > 8) {
      return res.status(400).json({ error: 'Invalid image data or strip count (1-8).' });
    }

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const id = uuidv4();
    const filename = `strip_${id}.png`;
    const filePath = path.join(UPLOADS_DIR, filename);
    const imageUrl = `/uploads/${filename}`;

    fs.writeFileSync(filePath, base64Data, 'base64');

    const stmt = db.prepare(`
      INSERT INTO photo_strips (id, filename, image_url, strip_count, filter_used, theme_used, caption)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      filename,
      imageUrl,
      stripCount,
      filterUsed || 'natural',
      themeUsed || 'classic-white',
      caption || 'STUDIO BOOTH 2026',
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Failed to save record to database.' });
        }
        res.status(201).json({
          id,
          imageUrl,
          stripCount,
          filterUsed,
          themeUsed,
          caption
        });
      }
    );
    stmt.finalize();
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: Retrieve all saved strips for the live gallery
app.get('/api/strips', (req, res) => {
  db.all(
    `SELECT * FROM photo_strips ORDER BY created_at DESC LIMIT 50`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch gallery.' });
      }
      res.json(rows);
    }
  );
});

// API: Delete a strip
app.delete('/api/strips/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT filename FROM photo_strips WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Strip not found.' });

    const filePath = path.join(UPLOADS_DIR, row.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.run(`DELETE FROM photo_strips WHERE id = ?`, [id], (delErr) => {
      if (delErr) return res.status(500).json({ error: 'Delete failed.' });
      res.json({ success: true });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Photo Booth Server running at http://localhost:${PORT}`);
});