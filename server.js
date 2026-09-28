const express = require('express');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('./database');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// 1. DASHBOARD STATS
// ----------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const inOffice = db.prepare("SELECT COUNT(*) as count FROM files WHERE status = 'in_office'").get().count;
    const givenOut = db.prepare("SELECT COUNT(*) as count FROM files WHERE status = 'given_out'").get().count;
    const cabinets = db.prepare('SELECT DISTINCT cabinet FROM files WHERE cabinet IS NOT NULL').all().map(c => c.cabinet);
    const districts = db.prepare("SELECT DISTINCT district FROM files WHERE district IS NOT NULL AND district != ''").all().map(d => d.district);

    res.json({
      success: true,
      stats: { total, inOffice, givenOut, cabinets, districts }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 2. SEARCH & LIST FILES
// ----------------------------------------------------
app.get('/api/files', (req, res) => {
  try {
    const { q, status, cabinet, district } = req.query;
    let query = 'SELECT * FROM files WHERE 1=1';
    const params = [];

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      query += ` AND (
        reference_no LIKE ? OR 
        name LIKE ? OR 
        farm_name LIKE ? OR 
        district LIKE ? OR 
        given_to LIKE ? OR 
        cabinet LIKE ?
      )`;
      params.push(term, term, term, term, term, term);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (cabinet && cabinet !== 'all') {
      query += ' AND cabinet = ?';
      params.push(cabinet);
    }

    if (district && district !== 'all') {
      query += ' AND district = ?';
      params.push(district);
    }

    query += ' ORDER BY updated_at DESC, id DESC';
    const files = db.prepare(query).all(...params);

    res.json({ success: true, files });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 3. FILE DETAILS & MOVEMENT HISTORY
// ----------------------------------------------------
app.get('/api/files/:id', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const history = db.prepare(`
      SELECT * FROM file_history WHERE file_id = ? ORDER BY timestamp DESC, id DESC
    `).all(req.params.id);

    res.json({ success: true, file, history });
  } catch (err) {
    console.error('Error getting file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 4. CREATE NEW FILE
// ----------------------------------------------------
app.post('/api/files', (req, res) => {
  try {
    const { reference_no, name, farm_name, district, cabinet, shelf, location_comment } = req.body;

    if (!reference_no || !reference_no.trim() || !name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Reference Number and Name are required.'
      });
    }

    const ref = reference_no.trim();
    const existing = db.prepare('SELECT id FROM files WHERE reference_no = ?').get(ref);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Reference Number "${ref}" already exists.`
      });
    }

    const cab = cabinet ? cabinet.trim() : 'Cabinet A';
    const shf = shelf ? shelf.trim() : 'Shelf 1';
    const comment = location_comment && location_comment.trim()
      ? location_comment.trim()
      : `Stored in ${cab}, ${shf}`;

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO files (reference_no, name, farm_name, district, cabinet, shelf, status, location_comment)
        VALUES (?, ?, ?, ?, ?, ?, 'in_office', ?)
      `).run(
        ref,
        name.trim(),
        farm_name ? farm_name.trim() : '',
        district ? district.trim() : '',
        cab,
        shf,
        comment
      );

      const fileId = result.lastInsertRowid;

      db.prepare(`
        INSERT INTO file_history (file_id, action_type, cabinet, shelf, comment)
        VALUES (?, 'created', ?, ?, ?)
      `).run(fileId, cab, shf, `File registered into registry. Location: ${cab}, ${shf}`);

      return fileId;
    });

    const fileId = tx();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

    res.json({
      success: true,
      message: 'File registered successfully',
      file
    });
  } catch (err) {
    console.error('Error creating file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 5. GIVE FILE TO WHOEVER WANTS IT
// ----------------------------------------------------
app.post('/api/files/:id/give', (req, res) => {
  try {
    const fileId = req.params.id;
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const { given_to, date_given, comment } = req.body;
    if (!given_to || !given_to.trim()) {
      return res.status(400).json({ success: false, error: 'Recipient name (who took the file) is required.' });
    }

    const recipient = given_to.trim();
    const timeGiven = date_given && date_given.trim() ? date_given.trim() : new Date().toLocaleString();
    const note = comment && comment.trim()
      ? comment.trim()
      : `Given to ${recipient} on ${timeGiven}`;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          status = 'given_out',
          given_to = ?,
          date_given = ?,
          location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(recipient, timeGiven, note, fileId);

      db.prepare(`
        INSERT INTO file_history (file_id, action_type, person_name, cabinet, shelf, comment)
        VALUES (?, 'given_out', ?, ?, ?, ?)
      `).run(fileId, recipient, file.cabinet, file.shelf, note);
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

    res.json({
      success: true,
      message: `File given to ${recipient}`,
      file: updated
    });
  } catch (err) {
    console.error('Error giving file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 6. RETURN FILE TO CABINET
// ----------------------------------------------------
app.post('/api/files/:id/return', (req, res) => {
  try {
    const fileId = req.params.id;
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const { cabinet, shelf, comment } = req.body;
    const targetCab = cabinet && cabinet.trim() ? cabinet.trim() : file.cabinet;
    const targetShelf = shelf && shelf.trim() ? shelf.trim() : (file.shelf || 'Shelf 1');

    const prevHolder = file.given_to || 'Officer';
    const note = comment && comment.trim()
      ? comment.trim()
      : `Returned by ${prevHolder}. Placed in ${targetCab}, ${targetShelf}`;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          status = 'in_office',
          given_to = NULL,
          date_given = NULL,
          cabinet = ?,
          shelf = ?,
          location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(targetCab, targetShelf, note, fileId);

      db.prepare(`
        INSERT INTO file_history (file_id, action_type, person_name, cabinet, shelf, comment)
        VALUES (?, 'returned', ?, ?, ?, ?)
      `).run(fileId, prevHolder, targetCab, targetShelf, note);
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

    res.json({
      success: true,
      message: `File returned to ${targetCab}, ${targetShelf}`,
      file: updated
    });
  } catch (err) {
    console.error('Error returning file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 7. ADD LOCATION COMMENT
// ----------------------------------------------------
app.post('/api/files/:id/comment', (req, res) => {
  try {
    const fileId = req.params.id;
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Comment cannot be empty.' });
    }

    const note = comment.trim();

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(note, fileId);

      db.prepare(`
        INSERT INTO file_history (file_id, action_type, person_name, cabinet, shelf, comment)
        VALUES (?, 'comment', ?, ?, ?, ?)
      `).run(fileId, file.given_to || 'In Office', file.cabinet, file.shelf, note);
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

    res.json({
      success: true,
      message: 'Location comment recorded',
      file: updated
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 8. SPREADSHEET IMPORTER (REFERENCE NUMBER, FARM NAME, NAME, DISTRICT)
// ----------------------------------------------------
function importSimpleRows(rows, targetCabinet = 'Cabinet A', targetShelf = 'Shelf 1') {
  let count = 0;
  const insertStmt = db.prepare(`
    INSERT INTO files (reference_no, name, farm_name, district, cabinet, shelf, status, location_comment)
    VALUES (?, ?, ?, ?, ?, ?, 'in_office', ?)
  `);

  const insertHist = db.prepare(`
    INSERT INTO file_history (file_id, action_type, cabinet, shelf, comment)
    VALUES (?, ?, ?, ?, ?)
  `);

  const checkStmt = db.prepare('SELECT id FROM files WHERE reference_no = ?');

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;

      // Normalize keys to lowercase trimmed
      const norm = {};
      for (const [k, v] of Object.entries(row)) {
        if (k && v !== undefined && v !== null) {
          norm[k.trim().toLowerCase()] = typeof v === 'string' ? v.trim() : String(v);
        }
      }

      // 1. Reference Number
      let ref = norm['reference number'] || norm['reference no'] || norm['reference_no'] || 
                norm['ref number'] || norm['ref no'] || norm['id number'] || norm['id_number'] || 
                norm['ids'] || norm['id'] || norm['ref'] || norm['reference'] || norm['deed number'] || 
                norm['title deed'] || norm['no'] || norm['no.'] || '';

      if (!ref) {
        for (const [k, v] of Object.entries(norm)) {
          if (k.includes('ref') || k.includes('deed') || k === 'id') {
            ref = v;
            break;
          }
        }
      }

      // 2. Name / Beneficiary
      let name = norm['name'] || norm['beneficiary name(s)'] || norm['beneficiary name'] || 
                 norm['beneficiary'] || norm['owner'] || norm['farmer'] || norm['applicant'] || 
                 norm['full name'] || '';

      if (!name && norm['surname']) {
        name = `${norm['surname']} ${norm['initials'] || norm['first name'] || ''}`.trim();
      }

      if (!name) {
        for (const [k, v] of Object.entries(norm)) {
          if ((k.includes('beneficiary') || k.includes('name')) && !k.includes('farm')) {
            name = v;
            break;
          }
        }
      }

      // 3. Farm Name
      let farm = norm['farm name'] || norm['farm_name'] || norm['farm'] || 
                 norm['property'] || norm['scheme'] || norm['holding'] || norm['lot'] || '';

      if (!farm) {
        for (const [k, v] of Object.entries(norm)) {
          if (k.includes('farm') || k.includes('property')) {
            farm = v;
            break;
          }
        }
      }

      // 4. District
      let district = norm['district'] || norm['province'] || '';
      if (!district) {
        for (const [k, v] of Object.entries(norm)) {
          if (k.includes('district') || k.includes('province')) {
            district = v;
            break;
          }
        }
      }

      if (!name && !farm && !ref) continue;

      if (!ref) {
        ref = `REF-${String(i + 1).padStart(4, '0')}`;
      } else {
        ref = String(ref).trim();
      }

      // Ensure unique reference_no
      let finalRef = ref;
      let suffix = 1;
      while (checkStmt.get(finalRef)) {
        finalRef = `${ref}-${suffix++}`;
      }

      const finalName = name ? String(name).trim() : 'Unknown Name';
      const finalFarm = farm ? String(farm).trim() : '';
      const finalDistrict = district ? String(district).trim().toUpperCase() : '';
      const comment = `Stored in ${targetCabinet}, ${targetShelf}`;

      const res = insertStmt.run(finalRef, finalName, finalFarm, finalDistrict, targetCabinet, targetShelf, comment);
      const fileId = res.lastInsertRowid;

      insertHist.run(fileId, 'created', targetCabinet, targetShelf, `Imported into ${targetCabinet}, ${targetShelf}`);
      count++;
    }
  });

  tx();
  return count;
}

// Upload file endpoint
app.post('/api/import/file', upload.single('spreadsheet'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const { cabinet, shelf } = req.body;
    const targetCab = cabinet || 'Cabinet A';
    const targetShelf = shelf || 'Shelf 1';

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      const d = xlsx.utils.sheet_to_json(workbook.Sheets[name]);
      if (d.length > 0) {
        sheetName = name;
        break;
      }
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const imported = importSimpleRows(rows, targetCab, targetShelf);

    res.json({
      success: true,
      message: `Successfully imported ${imported} file records into ${targetCab}!`,
      count: imported
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import Google Sheets link
app.post('/api/import/googlesheet', async (req, res) => {
  try {
    const { url, cabinet, shelf } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ success: false, error: 'Invalid Google Sheets URL' });

    const sheetId = match[1];
    let gid = '0';
    const gidMatch = url.match(/gid=([0-9]+)/);
    if (gidMatch) gid = gidMatch[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const response = await fetch(exportUrl, { redirect: 'follow' });
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.url.includes('accounts.google.com') ||
      response.url.includes('ServiceLogin')
    ) {
      return res.status(403).json({
        success: false,
        error: 'Google Sheet is private/restricted. Please either change sharing to "Anyone with the link can view", or download it: File > Download > Microsoft Excel (.xlsx) and upload it directly.'
      });
    }

    if (!response.ok) {
      return res.status(400).json({ success: false, error: `Could not fetch Google Sheet (Status ${response.status})` });
    }

    const csvText = await response.text();
    if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
      return res.status(403).json({
        success: false,
        error: 'Google Sheet redirected to login. Please download the sheet as Excel (.xlsx) and use "Upload File" above.'
      });
    }

    const workbook = xlsx.read(csvText, { type: 'string' });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const imported = importSimpleRows(rows, cabinet || 'Cabinet A', shelf || 'Shelf 1');
    res.json({
      success: true,
      message: `Successfully imported ${imported} records from Google Sheets!`,
      count: imported
    });
  } catch (err) {
    console.error('Google Sheets import error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 9. EXPORT CSV
// ----------------------------------------------------
app.get('/api/export/csv', (req, res) => {
  try {
    const files = db.prepare('SELECT * FROM files ORDER BY id ASC').all();

    const headers = [
      'Reference Number',
      'Name',
      'Farm Name',
      'District',
      'Status',
      'Current Location / Custody',
      'Given To',
      'Date Given',
      'Location Comment'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const rows = files.map(f => [
      escapeCsv(f.reference_no),
      escapeCsv(f.name),
      escapeCsv(f.farm_name),
      escapeCsv(f.district),
      escapeCsv(f.status === 'in_office' ? 'In Office' : 'Given Out'),
      escapeCsv(f.status === 'in_office' ? `${f.cabinet}, ${f.shelf}` : `With ${f.given_to}`),
      escapeCsv(f.given_to || ''),
      escapeCsv(f.date_given || ''),
      escapeCsv(f.location_comment || '')
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=registry_files_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).send('Error generating CSV');
  }
});

// Serve frontend SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Registry Office File Management Server running at http://${HOST}:${PORT}`);
});
