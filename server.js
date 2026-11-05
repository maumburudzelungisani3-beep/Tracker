const express = require('express');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const db = require('./database');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Enable CORS for cross-origin frontend hosting (e.g., Vercel)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
// 8. SPREADSHEET IMPORTER (TRUE UPSERT & MULTI-TAB SUPPORT)
// ----------------------------------------------------

/**
 * Converts a sheet into an array of { reference_no, name, farm_name, district } objects.
 * Handles BOTH sheets with header rows AND headerless sheets (positional columns).
 */
function sheetToNormalizedRows(sheet) {
  if (!sheet || !sheet['!ref']) return [];

  // First, try the standard header-based parsing
  const headerRows = xlsx.utils.sheet_to_json(sheet);

  // Check if the "headers" look like actual column headers or like data
  // Our known header patterns
  const headerPatterns = [
    /ref/i, /deed/i, /number/i, /no\.?$/i, /^id$/i,
    /name/i, /beneficiary/i, /owner/i, /farm/i, /property/i, /district/i, /province/i
  ];

  if (headerRows.length > 0) {
    const keys = Object.keys(headerRows[0]);
    const headerLikeCount = keys.filter(k => headerPatterns.some(p => p.test(k))).length;

    // If at least 2 column names match known header patterns, treat as header-based
    if (headerLikeCount >= 2) {
      return headerRows;
    }
  }

  // Otherwise, the sheet has NO header row — parse positionally using array mode
  // This captures ALL rows including the first one
  const arrayRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const result = [];

  // Detect whether Column B is Farm Name and Column C is Person Name, or vice-versa
  const farmKeywords = /\b(lot|plot|s\/d|farm|rem|stand|portion|estate|holding|scheme|block|subdivision)\b/i;
  let farmInB = 0;
  let farmInC = 0;
  const sampleCount = Math.min(arrayRows.length, 50);
  for (let i = 0; i < sampleCount; i++) {
    const b = String(arrayRows[i][1] || '');
    const c = String(arrayRows[i][2] || '');
    if (farmKeywords.test(b)) farmInB++;
    if (farmKeywords.test(c)) farmInC++;
  }

  const bIsFarm = farmInB >= farmInC;

  for (const row of arrayRows) {
    if (!Array.isArray(row)) continue;

    const a = row[0] != null ? String(row[0]).trim() : '';
    const b = row[1] != null ? String(row[1]).trim() : '';
    const c = row[2] != null ? String(row[2]).trim() : '';
    const d = row[3] != null ? String(row[3]).trim() : '';

    // Skip completely empty rows
    if (!a && !b && !c && !d) continue;

    result.push({
      'reference number': a,
      'farm name': bIsFarm ? b : c,
      'name': bIsFarm ? c : b,
      'district': d
    });
  }

  return result;
}

function importSimpleRows(rows, targetCabinet = 'Cabinet A', targetShelf = 'Shelf 1') {
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const seenRefs = new Set(); // every reference number present in the spreadsheet

  const insertStmt = db.prepare(`
    INSERT INTO files (reference_no, name, farm_name, district, cabinet, shelf, status, location_comment)
    VALUES (?, ?, ?, ?, ?, ?, 'in_office', ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE files SET
      name = ?,
      farm_name = ?,
      district = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `);

  const insertHist = db.prepare(`
    INSERT INTO file_history (file_id, action_type, cabinet, shelf, comment)
    VALUES (?, ?, ?, ?, ?)
  `);

  const checkStmt = db.prepare(`
    SELECT id, reference_no, name, farm_name, district, cabinet, shelf, status, given_to
    FROM files
    WHERE UPPER(TRIM(reference_no)) = UPPER(TRIM(?))
  `);

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;

      // Normalize keys to lowercase trimmed, stripping any UTF-8 BOM
      const norm = {};
      for (const [k, v] of Object.entries(row)) {
        if (k && v !== undefined && v !== null) {
          const cleanKey = String(k).replace(/^\uFEFF/, '').trim().toLowerCase();
          norm[cleanKey] = typeof v === 'string' ? v.trim() : String(v);
        }
      }

      // 1. Reference Number
      let ref = norm['reference number'] || norm['reference no'] || norm['reference_no'] || 
                norm['ref number'] || norm['ref no'] || norm['id number'] || norm['id_number'] || 
                norm['ids'] || norm['id'] || norm['ref'] || norm['reference'] || norm['deed number'] || 
                norm['title deed'] || norm['title deed number'] || norm['title deed no'] ||
                norm['deed no'] || norm['deed'] || norm['td no'] || norm['td number'] ||
                norm['file number'] || norm['file no'] || norm['no'] || norm['no.'] || '';

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
                 norm['full name'] || norm['client name'] || norm['client'] || '';

      if (!name && norm['surname']) {
        name = `${norm['surname']} ${norm['initials'] || norm['first name'] || ''}`.trim();
      }

      if (!name) {
        for (const [k, v] of Object.entries(norm)) {
          if ((k.includes('beneficiary') || k.includes('name') || k.includes('client')) && !k.includes('farm')) {
            name = v;
            break;
          }
        }
      }

      // 3. Farm Name / Property
      let farm = norm['farm name'] || norm['farm_name'] || norm['farm'] || 
                 norm['property'] || norm['property name'] || norm['scheme'] || norm['holding'] || norm['lot'] ||
                 norm['stand no'] || norm['stand number'] || norm['stand'] || norm['plot no'] || norm['plot'] || '';

      if (!farm) {
        for (const [k, v] of Object.entries(norm)) {
          if (k.includes('farm') || k.includes('property') || k.includes('scheme') || k.includes('holding') || k.includes('stand') || k.includes('plot')) {
            farm = v;
            break;
          }
        }
      }

      // 4. District / Location
      let district = norm['district'] || norm['province'] || norm['region'] || norm['area'] || norm['location'] || '';
      if (!district) {
        for (const [k, v] of Object.entries(norm)) {
          if (k.includes('district') || k.includes('province') || k.includes('region')) {
            district = v;
            break;
          }
        }
      }

      // 5. Cabinet & Shelf (if specified per row or tab)
      const cab = norm['cabinet'] || norm['office cabinet'] || targetCabinet || 'Cabinet A';
      const shf = norm['shelf'] || norm['shelf number'] || norm['shelf no'] || targetShelf || 'Shelf 1';

      if (!name && !farm && !ref) continue;

      if (!ref) {
        ref = `REF-${String(i + 1).padStart(4, '0')}`;
      } else {
        // Normalize whitespace in reference numbers (e.g., 'TD / 2142' -> 'TD /2142' or clean spaces)
        ref = String(ref).trim().replace(/\s+/g, ' ');
      }

      // If the spreadsheet has duplicate rows for the same reference number,
      // keep the first row to prevent flip-flopping updates on every sync
      const refKey = ref.toUpperCase();
      if (seenRefs.has(refKey)) {
        continue;
      }
      seenRefs.add(refKey);

      const finalName = name ? String(name).trim() : 'Unknown Name';
      const finalFarm = farm ? String(farm).trim() : '';
      const finalDistrict = district ? String(district).trim().toUpperCase() : '';

      // Check if reference already exists (UPSERT)
      const existing = checkStmt.get(ref);
      if (existing) {
        const hasChanged = (existing.name !== finalName) ||
                            (existing.farm_name !== finalFarm) ||
                            (existing.district !== finalDistrict);

        if (hasChanged) {
          // Only refresh the sheet-owned details; never move files or change custody
          updateStmt.run(finalName, finalFarm, finalDistrict, existing.id);
          insertHist.run(
            existing.id,
            'comment',
            existing.cabinet,
            existing.shelf,
            `Updated file details from spreadsheet sync: ${finalName} / ${finalFarm || 'No Farm'} / ${finalDistrict || 'N/A'}`
          );
          updatedCount++;
        } else {
          unchangedCount++;
        }
      } else {
        // Brand new record -> INSERT
        const comment = `Stored in ${cab}, ${shf}`;
        const res = insertStmt.run(ref, finalName, finalFarm, finalDistrict, cab, shf, comment);
        const fileId = res.lastInsertRowid;
        insertHist.run(fileId, 'created', cab, shf, `Imported into ${cab}, ${shf}`);
        createdCount++;
      }
    }
  });

  tx();
  return { created: createdCount, updated: updatedCount, unchanged: unchangedCount, total: createdCount + updatedCount + unchangedCount, seenRefs };
}

// Upload file endpoint (supports multi-sheet / multi-tab Excel workbooks)
app.post('/api/import/file', upload.single('spreadsheet'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const { cabinet, shelf } = req.body;
    const targetCab = cabinet || 'Cabinet A';
    const targetShelf = shelf || 'Shelf 1';

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const allRows = [];
    const sheetsRead = [];

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const sheetRows = sheetToNormalizedRows(sheet);
      if (sheetRows && sheetRows.length > 0) {
        sheetsRead.push(`${name} (${sheetRows.length} rows)`);
        const sheetCab = name.toLowerCase().includes('cabinet') ? name : targetCab;
        for (const r of sheetRows) {
          if (r && typeof r === 'object') {
            if (!r['cabinet'] && !r['Cabinet']) r['cabinet'] = sheetCab;
            if (!r['shelf'] && !r['Shelf']) r['shelf'] = targetShelf;
            allRows.push(r);
          }
        }
      }
    }

    if (allRows.length === 0) {
      return res.status(400).json({ success: false, error: 'Spreadsheet contains no records or readable rows.' });
    }

    const result = importSimpleRows(allRows, targetCab, targetShelf);

    let msg = `Successfully processed ${allRows.length} records across ${sheetsRead.length} sheet tab(s)! (${result.updated} updated with new details, ${result.created} newly registered).`;

    res.json({
      success: true,
      message: msg,
      sheets: sheetsRead,
      count: result.total,
      updated: result.updated,
      created: result.created,
      unchanged: result.unchanged
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// GOOGLE SHEETS SYNC (shared by manual button + automatic background sync)
// ----------------------------------------------------
const DEFAULT_SHEET_URL = process.env.GOOGLE_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/13QbRWQVWniHiy5vFuBtxxCPdoRTxmgz9p_GgIgE4qT4/edit?gid=1844098827#gid=1844098827';
const SYNC_INTERVAL_SECONDS = Math.max(10, Number(process.env.SYNC_INTERVAL_SECONDS) || 30);

const syncState = {
  enabled: true,
  intervalSeconds: SYNC_INTERVAL_SECONDS,
  sheetUrl: DEFAULT_SHEET_URL,
  running: false,
  lastSyncAt: null,       // ISO time of last successful sync
  lastChangeAt: null,     // ISO time of last sync that actually changed data
  lastResult: null,
  lastError: null
};

function syncError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const PRIVATE_SHEET_MSG = 'Google Sheet is private/restricted. Please change sharing to "Anyone with the link can view", or click File > Download > Microsoft Excel (.xlsx) and upload it directly.';

function isLoginRedirect(resp) {
  return resp.status === 401 || resp.status === 403 ||
    resp.url.includes('accounts.google.com') || resp.url.includes('ServiceLogin');
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

async function fetchSheetRows(url, targetCab, targetShelf) {
  let allRows = [];
  let sheetsRead = [];

  const pubMatch = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv&_t=${Date.now()}`, {
      headers: NO_CACHE_HEADERS,
      redirect: 'follow'
    });
    if (!response.ok) throw syncError(400, `Google Sheet returned status ${response.status}`);
    const csvText = await response.text();
    const workbook = xlsx.read(csvText.replace(/^\uFEFF/, ''), { type: 'string' });
    return { allRows: sheetToNormalizedRows(workbook.Sheets[workbook.SheetNames[0]]), sheetsRead: ['Published Sheet'] };
  }

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw syncError(400, 'Invalid Google Sheets URL');
  const sheetId = match[1];

  // Step 1: full multi-tab workbook as .xlsx with cache-busting
  try {
    const xlsxResp = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx&_t=${Date.now()}`, {
      headers: NO_CACHE_HEADERS,
      redirect: 'follow'
    });
    if (isLoginRedirect(xlsxResp)) throw syncError(403, PRIVATE_SHEET_MSG);
    if (xlsxResp.ok) {
      const buf = Buffer.from(await xlsxResp.arrayBuffer());
      const snippet = buf.slice(0, 100).toString();
      if (!snippet.includes('<!DOCTYPE html>') && !snippet.includes('<html')) {
        const workbook = xlsx.read(buf, { type: 'buffer' });
        for (const name of workbook.SheetNames) {
          const sheetRows = sheetToNormalizedRows(workbook.Sheets[name]);
          if (sheetRows.length > 0) {
            sheetsRead.push(name);
            const sheetCab = name.toLowerCase().includes('cabinet') ? name : targetCab;
            for (const r of sheetRows) {
              if (!r['cabinet'] && !r['Cabinet']) r['cabinet'] = sheetCab;
              if (!r['shelf'] && !r['Shelf']) r['shelf'] = targetShelf;
              allRows.push(r);
            }
          }
        }
      }
    }
  } catch (e) {
    if (e.status === 403) throw e;
    console.warn('XLSX export fetch failed, falling back to CSV export:', e.message);
  }

  if (allRows.length > 0) return { allRows, sheetsRead };

  // Step 2: fallback to single-tab CSV with cache-busting
  let gid = '0';
  const gidMatch = url.match(/gid=([0-9]+)/);
  if (gidMatch) gid = gidMatch[1];
  const csvResp = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&_t=${Date.now()}`, {
    headers: NO_CACHE_HEADERS,
    redirect: 'follow'
  });
  if (isLoginRedirect(csvResp)) throw syncError(403, PRIVATE_SHEET_MSG);
  if (!csvResp.ok) throw syncError(400, `Could not fetch Google Sheet (Status ${csvResp.status})`);
  const csvText = await csvResp.text();
  if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) throw syncError(403, PRIVATE_SHEET_MSG);
  const workbook = xlsx.read(csvText.replace(/^\uFEFF/, ''), { type: 'string' });
  return { allRows: sheetToNormalizedRows(workbook.Sheets[workbook.SheetNames[0]]), sheetsRead: [`Tab (gid=${gid})`] };
}

// Records removed from the sheet are moved here (not destroyed) so they can be recovered
db.exec(`
  CREATE TABLE IF NOT EXISTS archived_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER,
    reference_no TEXT,
    name TEXT,
    farm_name TEXT,
    district TEXT,
    cabinet TEXT,
    shelf TEXT,
    status TEXT,
    location_comment TEXT,
    history_json TEXT,
    archived_at TEXT DEFAULT (datetime('now', 'localtime')),
    reason TEXT
  );
`);

/**
 * Direct Live Mirror: Google Sheet is the absolute master list.
 * Any record deleted from the Google Sheet is immediately removed from the active files table.
 */
function removeRecordsMissingFromSheet(seenRefs) {
  if (!seenRefs || seenRefs.size === 0) {
    return { removed: 0, skipped: true, warning: 'Spreadsheet returned 0 reference numbers; deletion skipped.' };
  }

  const all = db.prepare('SELECT * FROM files').all();
  const missing = all.filter(f => !seenRefs.has(String(f.reference_no).trim().replace(/\s+/g, ' ').toUpperCase()));
  if (missing.length === 0) return { removed: 0, skipped: false };

  const getHist = db.prepare('SELECT * FROM file_history WHERE file_id = ? ORDER BY id');
  const archive = db.prepare(`
    INSERT INTO archived_files (original_id, reference_no, name, farm_name, district, cabinet, shelf, status, location_comment, history_json, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Deleted from Google Sheet')
  `);
  const del = db.prepare('DELETE FROM files WHERE id = ?'); // history rows cascade

  let removed = 0;
  db.transaction(() => {
    for (const f of missing) {
      archive.run(f.id, f.reference_no, f.name, f.farm_name, f.district, f.cabinet, f.shelf, f.status,
        f.location_comment, JSON.stringify(getHist.all(f.id)));
      del.run(f.id);
      removed++;
    }
  })();
  return { removed, skipped: false };
}

async function syncFromGoogleSheet(url, targetCab = 'Cabinet A', targetShelf = 'Shelf 1') {
  const { allRows, sheetsRead } = await fetchSheetRows(url, targetCab, targetShelf);
  if (allRows.length === 0) throw syncError(400, 'Spreadsheet contains no records or readable rows.');
  const { seenRefs, ...result } = importSimpleRows(allRows, targetCab, targetShelf);
  const cleanup = removeRecordsMissingFromSheet(seenRefs);
  return { ...result, ...cleanup, rows: allRows.length, sheets: sheetsRead };
}

async function runSync(url, cabinet, shelf, source) {
  if (syncState.running) throw syncError(409, 'A sync is already in progress. Please wait a moment.');
  syncState.running = true;
  try {
    const result = await syncFromGoogleSheet(url, cabinet, shelf);
    const now = new Date().toISOString();
    const changed = result.created > 0 || result.updated > 0 || result.removed > 0;
    syncState.lastSyncAt = now;
    if (changed) syncState.lastChangeAt = now;
    syncState.lastResult = result;
    syncState.lastError = result.warning || null;
    if (source === 'auto' && changed) {
      console.log(`[auto-sync] ${now}: ${result.created} new, ${result.updated} updated, ${result.removed} removed`);
    }
    return result;
  } catch (err) {
    syncState.lastError = err.message;
    throw err;
  } finally {
    syncState.running = false;
  }
}

// Manual sync / import from a Google Sheets link
app.post('/api/import/googlesheet', async (req, res) => {
  try {
    const { url, cabinet, shelf } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    const result = await runSync(url, cabinet || 'Cabinet A', shelf || 'Shelf 1', 'manual');
    res.json({
      success: true,
      message: `Synced ${result.rows} records from the sheet: ${result.created} new, ${result.updated} updated, ${result.removed} removed` +
        (result.keptGivenOut ? ` (${result.keptGivenOut} deleted from sheet but kept because they are given out)` : '') +
        (result.warning ? ` ⚠️ ${result.warning}` : '') + '.',
      sheets: result.sheets,
      count: result.total,
      updated: result.updated,
      created: result.created,
      unchanged: result.unchanged
    });
  } catch (err) {
    console.error('Google Sheets import error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Auto-sync status (polled by the browser to refresh when new data arrives)
app.get('/api/sync/status', (req, res) => {
  res.json({ success: true, sync: syncState });
});

// Explicit instant sync trigger
app.all('/api/sync/now', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || req.query.url || syncState.sheetUrl;
    const result = await runSync(url, 'Cabinet A', 'Shelf 1', 'manual');
    res.json({
      success: true,
      message: `Directly synced with Google Sheet: ${result.total} total active records (${result.created} added, ${result.updated} updated, ${result.removed} removed).`,
      result
    });
  } catch (err) {
    console.error('Instant sync error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

function startAutoSync() {
  const tick = () => {
    if (!syncState.enabled || syncState.running) return;
    runSync(syncState.sheetUrl, 'Cabinet A', 'Shelf 1', 'auto')
      .catch(err => console.warn('[auto-sync] failed:', err.message));
  };
  setTimeout(tick, 2000); // first sync 2 seconds after startup
  setInterval(tick, syncState.intervalSeconds * 1000);
  console.log(`Auto-sync with Google Sheet enabled: every ${syncState.intervalSeconds} second(s)`);
}

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
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Registry Office File Management Server running at http://${HOST}:${PORT}`);
    startAutoSync();
  });
}

module.exports = { app, importSimpleRows, syncFromGoogleSheet };
