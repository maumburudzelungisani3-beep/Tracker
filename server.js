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

// Helper to determine overdue status
function enrichFile(file) {
  let is_overdue = false;
  let days_diff = null;

  if (file.status === 'issued' && file.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(file.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    days_diff = Math.round(diffTime / (1000 * 3600 * 24));
    if (days_diff < 0) {
      is_overdue = true;
    }
  }

  return {
    ...file,
    is_overdue,
    days_diff // positive = days remaining, 0 = due today, negative = days overdue
  };
}

// ----------------------------------------------------
// 1. DASHBOARD STATS
// ----------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const totalFiles = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const inOffice = db.prepare("SELECT COUNT(*) as count FROM files WHERE status = 'in_office'").get().count;
    const issuedOut = db.prepare("SELECT COUNT(*) as count FROM files WHERE status = 'issued'").get().count;

    // Overdue count: status = 'issued' AND date(due_date) < date('now', 'localtime')
    const overdue = db.prepare(`
      SELECT COUNT(*) as count FROM files 
      WHERE status = 'issued' AND due_date IS NOT NULL AND date(due_date) < date('now', 'localtime')
    `).get().count;

    const cabinetsCount = db.prepare('SELECT COUNT(*) as count FROM cabinets').get().count;
    const inwardCount = db.prepare("SELECT COUNT(*) as count FROM correspondence WHERE type = 'inward'").get().count;
    const outwardCount = db.prepare("SELECT COUNT(*) as count FROM correspondence WHERE type = 'outward'").get().count;

    res.json({
      success: true,
      stats: {
        totalFiles,
        inOffice,
        issuedOut,
        overdue,
        cabinetsCount,
        inwardCount,
        outwardCount
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 2. FILES LIST & SEARCH & FILTER
// ----------------------------------------------------
app.get('/api/files', (req, res) => {
  try {
    const { q, status, cabinet, category } = req.query;
    let query = 'SELECT * FROM files WHERE 1=1';
    const params = [];

    if (q && q.trim()) {
      query += ` AND (
        file_number LIKE ? OR 
        title LIKE ? OR 
        description LIKE ? OR 
        current_holder LIKE ? OR 
        holder_dept LIKE ? OR 
        cabinet LIKE ? OR 
        shelf LIKE ?
      )`;
      const searchTerm = `%${q.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status && status !== 'all') {
      if (status === 'overdue') {
        query += ` AND status = 'issued' AND due_date IS NOT NULL AND date(due_date) < date('now', 'localtime')`;
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }

    if (cabinet && cabinet !== 'all') {
      query += ' AND cabinet = ?';
      params.push(cabinet);
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY updated_at DESC, id DESC';

    const files = db.prepare(query).all(...params).map(enrichFile);
    res.json({ success: true, files });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 3. FILE DETAILS (WITH MOVEMENTS, COMMENTS, CORRESPONDENCE)
// ----------------------------------------------------
app.get('/api/files/:id', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const movements = db.prepare(`
      SELECT * FROM file_movements WHERE file_id = ? ORDER BY timestamp DESC, id DESC
    `).all(req.params.id);

    const comments = db.prepare(`
      SELECT * FROM location_comments WHERE file_id = ? ORDER BY created_at DESC, id DESC
    `).all(req.params.id);

    const correspondence = db.prepare(`
      SELECT * FROM correspondence WHERE file_id = ? ORDER BY correspondence_date DESC
    `).all(req.params.id);

    res.json({
      success: true,
      file: enrichFile(file),
      movements,
      comments,
      correspondence
    });
  } catch (err) {
    console.error('Error fetching file details:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 4. CREATE NEW FILE IN REGISTRY
// ----------------------------------------------------
app.post('/api/files', (req, res) => {
  try {
    const {
      file_number,
      title,
      category,
      description,
      cabinet,
      shelf,
      box_number,
      initial_comment,
      performed_by
    } = req.body;

    if (!file_number || !title || !category || !cabinet) {
      return res.status(400).json({
        success: false,
        error: 'File Number, Title, Category, and Cabinet location are required.'
      });
    }

    // Check duplicate file_number
    const existing = db.prepare('SELECT id FROM files WHERE file_number = ?').get(file_number.trim());
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `File Number "${file_number.trim()}" already exists in the registry.`
      });
    }

    const commentText = initial_comment && initial_comment.trim() 
      ? initial_comment.trim() 
      : `File registered in office registry. Stored in ${cabinet} (${shelf || 'Default Shelf'}).`;

    const tx = db.transaction(() => {
      const insertFile = db.prepare(`
        INSERT INTO files (
          file_number, title, category, description, status, cabinet, shelf, box_number,
          last_location_comment
        ) VALUES (?, ?, ?, ?, 'in_office', ?, ?, ?, ?)
      `);

      const result = insertFile.run(
        file_number.trim(),
        title.trim(),
        category.trim(),
        description ? description.trim() : null,
        cabinet.trim(),
        shelf ? shelf.trim() : 'Shelf 1',
        box_number ? box_number.trim() : null,
        commentText
      );

      const fileId = result.lastInsertRowid;

      // Add movement log
      db.prepare(`
        INSERT INTO file_movements (file_id, action_type, cabinet, shelf, box_number, remarks, performed_by)
        VALUES (?, 'created', ?, ?, ?, ?, ?)
      `).run(
        fileId,
        cabinet.trim(),
        shelf ? shelf.trim() : 'Shelf 1',
        box_number ? box_number.trim() : null,
        `New file registered into office records.`,
        performed_by || 'Registry Staff'
      );

      // Add initial comment
      db.prepare(`
        INSERT INTO location_comments (file_id, comment, location_context, author)
        VALUES (?, ?, ?, ?)
      `).run(
        fileId,
        commentText,
        `${cabinet.trim()}, ${shelf ? shelf.trim() : 'Shelf 1'}`,
        performed_by || 'Registry Staff'
      );

      return fileId;
    });

    const newId = tx();
    const createdFile = db.prepare('SELECT * FROM files WHERE id = ?').get(newId);

    res.json({
      success: true,
      message: 'File successfully created in registry',
      file: enrichFile(createdFile)
    });
  } catch (err) {
    console.error('Error creating file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 5. UPDATE GENERAL FILE DETAILS / LOCATION
// ----------------------------------------------------
app.put('/api/files/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const {
      title,
      category,
      description,
      cabinet,
      shelf,
      box_number,
      location_note,
      performed_by
    } = req.body;

    const newCabinet = cabinet ? cabinet.trim() : existing.cabinet;
    const newShelf = shelf ? shelf.trim() : existing.shelf;
    const newBox = box_number ? box_number.trim() : existing.box_number;

    const cabinetChanged = newCabinet !== existing.cabinet || newShelf !== existing.shelf || newBox !== existing.box_number;

    const tx = db.transaction(() => {
      let lastComment = existing.last_location_comment;
      if (location_note && location_note.trim()) {
        lastComment = location_note.trim();
        db.prepare(`
          INSERT INTO location_comments (file_id, comment, location_context, author)
          VALUES (?, ?, ?, ?)
        `).run(
          fileId,
          location_note.trim(),
          existing.status === 'in_office' ? `${newCabinet}, ${newShelf}` : `With ${existing.current_holder}`,
          performed_by || 'Registry Staff'
        );
      }

      if (cabinetChanged && existing.status === 'in_office') {
        const note = location_note && location_note.trim()
          ? location_note.trim()
          : `Physical location changed from [${existing.cabinet}, ${existing.shelf}] to [${newCabinet}, ${newShelf}].`;

        db.prepare(`
          INSERT INTO file_movements (file_id, action_type, cabinet, shelf, box_number, remarks, performed_by)
          VALUES (?, 'relocated', ?, ?, ?, ?, ?)
        `).run(
          fileId,
          newCabinet,
          newShelf,
          newBox,
          note,
          performed_by || 'Registry Staff'
        );
        lastComment = note;
      }

      db.prepare(`
        UPDATE files SET
          title = ?,
          category = ?,
          description = ?,
          cabinet = ?,
          shelf = ?,
          box_number = ?,
          last_location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        title ? title.trim() : existing.title,
        category ? category.trim() : existing.category,
        description !== undefined ? description.trim() : existing.description,
        newCabinet,
        newShelf,
        newBox,
        lastComment,
        fileId
      );
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    res.json({ success: true, file: enrichFile(updated) });
  } catch (err) {
    console.error('Error updating file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 6. ISSUE / CHECK-OUT FILE TO AN OFFICER
// ----------------------------------------------------
app.post('/api/files/:id/checkout', (req, res) => {
  try {
    const fileId = req.params.id;
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    if (existing.status === 'issued') {
      return res.status(400).json({
        success: false,
        error: `File is already issued to ${existing.current_holder} (${existing.holder_dept || 'Office'}). Please return or transfer it first.`
      });
    }

    const {
      officer_name,
      holder_dept,
      holder_contact,
      due_date,
      remarks,
      performed_by
    } = req.body;

    if (!officer_name || !officer_name.trim()) {
      return res.status(400).json({ success: false, error: 'Recipient Officer name is required.' });
    }

    const officer = officer_name.trim();
    const dept = holder_dept ? holder_dept.trim() : 'Office Staff';
    const contact = holder_contact ? holder_contact.trim() : '';
    const note = remarks && remarks.trim()
      ? remarks.trim()
      : `Issued to ${officer} (${dept}). Expected return: ${due_date || 'Not specified'}.`;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          status = 'issued',
          current_holder = ?,
          holder_dept = ?,
          holder_contact = ?,
          issued_date = datetime('now', 'localtime'),
          due_date = ?,
          last_location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        officer,
        dept,
        contact,
        due_date || null,
        note,
        fileId
      );

      // Log movement
      db.prepare(`
        INSERT INTO file_movements (file_id, action_type, officer_name, officer_dept, cabinet, shelf, box_number, remarks, performed_by)
        VALUES (?, 'checkout', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        officer,
        dept,
        existing.cabinet,
        existing.shelf,
        existing.box_number,
        note,
        performed_by || 'Registry Clerk'
      );

      // Add location comment
      db.prepare(`
        INSERT INTO location_comments (file_id, comment, location_context, author)
        VALUES (?, ?, ?, ?)
      `).run(
        fileId,
        note,
        `With ${officer} (${dept})`,
        performed_by || 'Registry Clerk'
      );
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    res.json({
      success: true,
      message: `File successfully issued to ${officer}`,
      file: enrichFile(updated)
    });
  } catch (err) {
    console.error('Error during checkout:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 7. RETURN / CHECK-IN FILE TO REGISTRY
// ----------------------------------------------------
app.post('/api/files/:id/checkin', (req, res) => {
  try {
    const fileId = req.params.id;
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const {
      cabinet,
      shelf,
      box_number,
      remarks,
      performed_by
    } = req.body;

    const targetCabinet = cabinet ? cabinet.trim() : existing.cabinet;
    const targetShelf = shelf ? shelf.trim() : (existing.shelf || 'Shelf 1');
    const targetBox = box_number ? box_number.trim() : existing.box_number;

    const prevHolder = existing.current_holder || 'Officer';
    const note = remarks && remarks.trim()
      ? remarks.trim()
      : `Returned by ${prevHolder} to Registry Office. Placed in ${targetCabinet}, ${targetShelf}.`;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          status = 'in_office',
          current_holder = NULL,
          holder_dept = NULL,
          holder_contact = NULL,
          issued_date = NULL,
          due_date = NULL,
          cabinet = ?,
          shelf = ?,
          box_number = ?,
          last_location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        targetCabinet,
        targetShelf,
        targetBox,
        note,
        fileId
      );

      // Log movement
      db.prepare(`
        INSERT INTO file_movements (file_id, action_type, officer_name, officer_dept, cabinet, shelf, box_number, remarks, performed_by)
        VALUES (?, 'checkin', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        prevHolder,
        existing.holder_dept,
        targetCabinet,
        targetShelf,
        targetBox,
        note,
        performed_by || 'Registry Clerk'
      );

      // Add location comment
      db.prepare(`
        INSERT INTO location_comments (file_id, comment, location_context, author)
        VALUES (?, ?, ?, ?)
      `).run(
        fileId,
        note,
        `${targetCabinet}, ${targetShelf}`,
        performed_by || 'Registry Clerk'
      );
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    res.json({
      success: true,
      message: `File returned to ${targetCabinet} (${targetShelf})`,
      file: enrichFile(updated)
    });
  } catch (err) {
    console.error('Error during checkin:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 8. DIRECT TRANSFER TO ANOTHER OFFICER
// ----------------------------------------------------
app.post('/api/files/:id/transfer', (req, res) => {
  try {
    const fileId = req.params.id;
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const {
      new_officer_name,
      new_holder_dept,
      new_holder_contact,
      due_date,
      remarks,
      performed_by
    } = req.body;

    if (!new_officer_name || !new_officer_name.trim()) {
      return res.status(400).json({ success: false, error: 'New Officer name is required.' });
    }

    const fromOfficer = existing.current_holder || 'Previous Holder';
    const toOfficer = new_officer_name.trim();
    const toDept = new_holder_dept ? new_holder_dept.trim() : 'Office Staff';
    const note = remarks && remarks.trim()
      ? remarks.trim()
      : `File transferred directly from ${fromOfficer} to ${toOfficer} (${toDept}).`;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE files SET
          status = 'issued',
          current_holder = ?,
          holder_dept = ?,
          holder_contact = ?,
          issued_date = datetime('now', 'localtime'),
          due_date = ?,
          last_location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        toOfficer,
        toDept,
        new_holder_contact ? new_holder_contact.trim() : existing.holder_contact,
        due_date || existing.due_date,
        note,
        fileId
      );

      // Log movement
      db.prepare(`
        INSERT INTO file_movements (file_id, action_type, officer_name, officer_dept, cabinet, shelf, box_number, remarks, performed_by)
        VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        toOfficer,
        toDept,
        existing.cabinet,
        existing.shelf,
        existing.box_number,
        note,
        performed_by || 'Registry Clerk'
      );

      // Add comment
      db.prepare(`
        INSERT INTO location_comments (file_id, comment, location_context, author)
        VALUES (?, ?, ?, ?)
      `).run(
        fileId,
        note,
        `Transferred to ${toOfficer} (${toDept})`,
        performed_by || 'Registry Clerk'
      );
    });

    tx();
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    res.json({
      success: true,
      message: `File transferred to ${toOfficer}`,
      file: enrichFile(updated)
    });
  } catch (err) {
    console.error('Error during transfer:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 9. ADD LOCATION COMMENT / REMARK
// (Explicitly highlighted by the user: "it must also be able to add comments regarding to the file location")
// ----------------------------------------------------
app.post('/api/files/:id/comments', (req, res) => {
  try {
    const fileId = req.params.id;
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const { comment, author } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Comment text cannot be empty.' });
    }

    const locationContext = file.status === 'in_office'
      ? `${file.cabinet}, ${file.shelf || 'Shelf 1'}${file.box_number ? ' (' + file.box_number + ')' : ''}`
      : `With ${file.current_holder} (${file.holder_dept || 'Office'})`;

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO location_comments (file_id, comment, location_context, author)
        VALUES (?, ?, ?, ?)
      `).run(
        fileId,
        comment.trim(),
        locationContext,
        author && author.trim() ? author.trim() : 'Registry Clerk'
      );

      // Update files.last_location_comment
      db.prepare(`
        UPDATE files SET
          last_location_comment = ?,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(comment.trim(), fileId);

      return result.lastInsertRowid;
    });

    const commentId = tx();
    const insertedComment = db.prepare('SELECT * FROM location_comments WHERE id = ?').get(commentId);

    res.json({
      success: true,
      message: 'Location comment recorded',
      comment: insertedComment
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 10. CABINETS MANAGEMENT & DIRECTORY
// ----------------------------------------------------
app.get('/api/cabinets', (req, res) => {
  try {
    const cabinets = db.prepare('SELECT * FROM cabinets ORDER BY id ASC').all();

    // Attach counts for each cabinet
    const cabinetsWithStats = cabinets.map((cab) => {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_files,
          SUM(CASE WHEN status = 'in_office' THEN 1 ELSE 0 END) as in_office_files,
          SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) as issued_files
        FROM files WHERE cabinet = ?
      `).get(cab.name);

      return {
        ...cab,
        total_files: stats.total_files || 0,
        in_office_files: stats.in_office_files || 0,
        issued_files: stats.issued_files || 0
      };
    });

    res.json({ success: true, cabinets: cabinetsWithStats });
  } catch (err) {
    console.error('Error fetching cabinets:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cabinets', (req, res) => {
  try {
    const { name, room, description, shelves_count } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Cabinet name is required.' });
    }

    const insert = db.prepare(`
      INSERT INTO cabinets (name, room, description, shelves_count)
      VALUES (?, ?, ?, ?)
    `);

    insert.run(
      name.trim(),
      room ? room.trim() : 'Registry Office',
      description ? description.trim() : '',
      shelves_count ? parseInt(shelves_count, 10) : 4
    );

    res.json({ success: true, message: `Cabinet "${name.trim()}" created successfully.` });
  } catch (err) {
    console.error('Error adding cabinet:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 11. INWARD & OUTWARD CORRESPONDENCE (DISPATCH BOOK)
// ----------------------------------------------------
app.get('/api/correspondence', (req, res) => {
  try {
    const { type, q, file_id } = req.query;
    let query = 'SELECT * FROM correspondence WHERE 1=1';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (file_id) {
      query += ' AND file_id = ?';
      params.push(file_id);
    }

    if (q && q.trim()) {
      query += ` AND (
        reference_no LIKE ? OR
        sender_or_recipient LIKE ? OR
        subject LIKE ? OR
        file_number LIKE ? OR
        officer_in_charge LIKE ?
      )`;
      const s = `%${q.trim()}%`;
      params.push(s, s, s, s, s);
    }

    query += ' ORDER BY correspondence_date DESC, id DESC';
    const list = db.prepare(query).all(...params);
    res.json({ success: true, correspondence: list });
  } catch (err) {
    console.error('Error listing correspondence:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/correspondence', (req, res) => {
  try {
    const {
      type, // 'inward' or 'outward'
      reference_no,
      correspondence_date,
      sender_or_recipient,
      subject,
      file_id,
      officer_in_charge,
      delivery_mode,
      status,
      notes
    } = req.body;

    if (!type || !reference_no || !sender_or_recipient || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Type, Reference No, Sender/Recipient, and Subject are required.'
      });
    }

    let fileNumber = null;
    if (file_id) {
      const f = db.prepare('SELECT file_number FROM files WHERE id = ?').get(file_id);
      if (f) fileNumber = f.file_number;
    }

    const insert = db.prepare(`
      INSERT INTO correspondence (
        type, reference_no, correspondence_date, sender_or_recipient, subject,
        file_id, file_number, officer_in_charge, delivery_mode, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      type,
      reference_no.trim(),
      correspondence_date || new Date().toISOString().split('T')[0],
      sender_or_recipient.trim(),
      subject.trim(),
      file_id ? parseInt(file_id, 10) : null,
      fileNumber,
      officer_in_charge ? officer_in_charge.trim() : null,
      delivery_mode ? delivery_mode.trim() : 'Internal Dispatch',
      status || 'Pending',
      notes ? notes.trim() : null
    );

    res.json({ success: true, message: `${type === 'inward' ? 'Inward mail' : 'Outward dispatch'} recorded successfully.` });
  } catch (err) {
    console.error('Error logging correspondence:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 13. SPREADSHEET IMPORTER (EXCEL .XLSX / .CSV & GOOGLE SHEETS)
// ----------------------------------------------------
function importSpreadsheetData(dataRows, targetCabinet = 'Cabinet - Title Deeds', targetShelf = 'Shelf 1', defaultCategory = 'Title Deeds & Land Records') {
  // Ensure cabinet exists
  const existingCab = db.prepare('SELECT id FROM cabinets WHERE name = ?').get(targetCabinet);
  if (!existingCab) {
    db.prepare('INSERT INTO cabinets (name, room, description, shelves_count) VALUES (?, ?, ?, ?)').run(
      targetCabinet,
      'Main Registry Office',
      'Storage cabinet dedicated to Title Deeds and Land Records',
      5
    );
  }

  let importedCount = 0;
  const insertFileStmt = db.prepare(`
    INSERT INTO files (
      file_number, title, category, description, status, cabinet, shelf, box_number,
      last_location_comment
    ) VALUES (?, ?, ?, ?, 'in_office', ?, ?, ?, ?)
  `);

  const insertMovementStmt = db.prepare(`
    INSERT INTO file_movements (file_id, action_type, cabinet, shelf, box_number, remarks, performed_by)
    VALUES (?, 'created', ?, ?, ?, ?, ?)
  `);

  const insertCommentStmt = db.prepare(`
    INSERT INTO location_comments (file_id, comment, location_context, author)
    VALUES (?, ?, ?, ?)
  `);

  const checkFile = db.prepare('SELECT id FROM files WHERE file_number = ?');

  const tx = db.transaction(() => {
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || typeof row !== 'object') continue;

      // Find file/deed number
      let fileNum = row['ID Number'] || row['IDS'] || row['Title Deed'] || row['Deed No'] || row['Deed Number'] || row['File No'] || row['File Number'] || row['Reference'] || row['NO'];
      
      // Find beneficiary/title
      let title = row['BENEFICIARY NAME(S)'] || row['Beneficiary'] || row['Full Name'] || row['Name'] || row['Grantee'];
      if (!title && row['Surname']) {
        title = `${row['Surname']} ${row['Initials'] || ''}`.trim();
      }
      if (!title) {
        title = row['Farm Name'] || row['Property'] || row['Title'] || `Title Deed Record #${i + 1}`;
      }

      if (!fileNum) {
        fileNum = `TD-${String(i + 1).padStart(4, '0')}`;
      } else {
        fileNum = String(fileNum).trim();
      }

      // Check duplicate file_number
      let finalFileNum = fileNum;
      let counter = 1;
      while (checkFile.get(finalFileNum)) {
        finalFileNum = `${fileNum}-${counter++}`;
      }

      // Compile detailed description & metadata
      const descParts = [];
      if (row['Farm Name']) descParts.push(`Farm/Property: ${row['Farm Name']}`);
      if (row['Subdivision Number']) descParts.push(`Subdivision: ${row['Subdivision Number']}`);
      if (row['SubDiv Size']) descParts.push(`Size: ${row['SubDiv Size']} HA`);
      if (row['LAND SIZE AS ON OFFER LETTER']) descParts.push(`Offer Size: ${row['LAND SIZE AS ON OFFER LETTER']}`);
      if (row['District']) descParts.push(`District: ${row['District']}`);
      if (row['PROVINCE'] || row['Province']) descParts.push(`Province: ${row['PROVINCE'] || row['Province']}`);
      if (row['Address']) descParts.push(`Address: ${row['Address']}`);
      if (row['PHONE NUMBER'] && String(row['PHONE NUMBER']).trim()) descParts.push(`Phone: ${row['PHONE NUMBER']}`);
      if (row['FARM MODEL']) descParts.push(`Model: ${row['FARM MODEL']}`);
      if (row['FARMER CATEGORY']) descParts.push(`Category: ${row['FARMER CATEGORY']}`);
      if (row['Date Offer Typed'] || row['DATE ']) descParts.push(`Date: ${row['Date Offer Typed'] || row['DATE ']}`);
      if (row['REMARKS AND ADITIONAL INFORMATION']) descParts.push(`Notes: ${row['REMARKS AND ADITIONAL INFORMATION']}`);

      const desc = descParts.join(' | ') || 'Title Deed docket record.';
      const districtName = row['District'] ? String(row['District']).trim() : '';
      const box = districtName ? `Box (${districtName})` : 'Box 01';
      const locComment = `Stored in ${targetCabinet}, ${targetShelf}. ${descParts[0] || 'Title deed record filed.'}`;

      const res = insertFileStmt.run(
        finalFileNum,
        String(title).trim(),
        defaultCategory,
        desc,
        targetCabinet,
        targetShelf,
        box,
        locComment
      );

      const fileId = res.lastInsertRowid;

      insertMovementStmt.run(
        fileId,
        targetCabinet,
        targetShelf,
        box,
        `Imported from Title Deeds Database spreadsheet into ${targetCabinet}, ${targetShelf}.`,
        'Database Import'
      );

      insertCommentStmt.run(
        fileId,
        locComment,
        `${targetCabinet}, ${targetShelf}`,
        'System Import'
      );

      importedCount++;
    }
  });

  tx();
  return { importedCount };
}

// Upload Excel or CSV file directly
app.post('/api/import/file', upload.single('spreadsheet'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No spreadsheet file uploaded.' });
    }

    const { cabinet, shelf, category } = req.body;
    const targetCabinet = cabinet && cabinet.trim() ? cabinet.trim() : 'Cabinet - Title Deeds';
    const targetShelf = shelf && shelf.trim() ? shelf.trim() : 'Shelf 1';
    const targetCategory = category && category.trim() ? category.trim() : 'Title Deeds & Land Records';

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    let sheetName = workbook.SheetNames[0];
    
    // If first sheet is empty or Chart, find first sheet with data
    for (const name of workbook.SheetNames) {
      const testData = xlsx.utils.sheet_to_json(workbook.Sheets[name]);
      if (testData.length > 0) {
        sheetName = name;
        break;
      }
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'The uploaded spreadsheet contains no data rows.' });
    }

    const result = importSpreadsheetData(rows, targetCabinet, targetShelf, targetCategory);
    res.json({
      success: true,
      message: `Successfully imported ${result.importedCount} records into ${targetCabinet} (${targetShelf})!`,
      importedCount: result.importedCount
    });
  } catch (err) {
    console.error('Error importing file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import via Google Sheets URL
app.post('/api/import/googlesheet', async (req, res) => {
  try {
    const { url, cabinet, shelf, category } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Google Sheets URL is required.' });
    }

    // Extract spreadsheet ID: e.g. /d/13QbRWQVWniHiy5vFuBtxxCPdoRTxmgz9p_GgIgE4qT4/
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({ success: false, error: 'Invalid Google Sheets URL. Could not find spreadsheet ID.' });
    }

    const sheetId = match[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

    const response = await fetch(exportUrl);
    if (response.status === 401 || response.status === 403) {
      return res.status(403).json({
        success: false,
        error: 'Google Sheet access is restricted (401 Unauthorized). Please set sheet sharing to "Anyone with the link can view", or download it as Excel (.xlsx) and upload it directly.'
      });
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: `Could not fetch Google Sheet (HTTP ${response.status}). Ensure the sheet is shared publicly.`
      });
    }

    const csvText = await response.text();
    const workbook = xlsx.read(csvText, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'The Google Sheet contains no data rows.' });
    }

    const targetCabinet = cabinet && cabinet.trim() ? cabinet.trim() : 'Cabinet - Title Deeds';
    const targetShelf = shelf && shelf.trim() ? shelf.trim() : 'Shelf 1';
    const targetCategory = category && category.trim() ? category.trim() : 'Title Deeds & Land Records';

    const result = importSpreadsheetData(rows, targetCabinet, targetShelf, targetCategory);
    res.json({
      success: true,
      message: `Successfully imported ${result.importedCount} records from Google Sheets into ${targetCabinet}!`,
      importedCount: result.importedCount
    });
  } catch (err) {
    console.error('Error importing from Google Sheet:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import from local preset (e.g. desktop spreadsheets)
app.post('/api/import/local-preset', (req, res) => {
  try {
    const { filePath, cabinet, shelf, category } = req.body;
    if (!filePath || !require('fs').existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'Local spreadsheet file not found at path: ' + filePath });
    }

    const workbook = xlsx.readFile(filePath);
    let sheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      const testData = xlsx.utils.sheet_to_json(workbook.Sheets[name]);
      if (testData.length > 0) {
        sheetName = name;
        break;
      }
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const targetCabinet = cabinet || 'Cabinet - Title Deeds';
    const targetShelf = shelf || 'Shelf 1';
    const targetCategory = category || 'Title Deeds & Land Records';

    const result = importSpreadsheetData(rows, targetCabinet, targetShelf, targetCategory);
    res.json({
      success: true,
      message: `Imported ${result.importedCount} records from ${path.basename(filePath)}!`,
      importedCount: result.importedCount
    });
  } catch (err) {
    console.error('Error importing local preset:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/api/export/csv', (req, res) => {
  try {
    const files = db.prepare('SELECT * FROM files ORDER BY id ASC').all().map(enrichFile);

    const headers = [
      'File Number',
      'Title',
      'Category',
      'Status',
      'Cabinet Location',
      'Shelf',
      'Box Number',
      'Current Custodian / Holder',
      'Holder Dept',
      'Date Issued',
      'Due Date',
      'Is Overdue',
      'Latest Location Comment'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = files.map((f) => [
      escapeCsv(f.file_number),
      escapeCsv(f.title),
      escapeCsv(f.category),
      escapeCsv(f.status === 'in_office' ? 'In Registry' : 'With Officer'),
      escapeCsv(f.cabinet),
      escapeCsv(f.shelf),
      escapeCsv(f.box_number),
      escapeCsv(f.current_holder || 'In Registry Office'),
      escapeCsv(f.holder_dept || 'Registry'),
      escapeCsv(f.issued_date || ''),
      escapeCsv(f.due_date || ''),
      escapeCsv(f.is_overdue ? 'YES' : 'NO'),
      escapeCsv(f.last_location_comment || '')
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=registry_office_files_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    res.status(500).send('Error generating CSV');
  }
});

// Catch-all route to serve SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Registry Office File Management Server running at http://localhost:${PORT}`);
});
