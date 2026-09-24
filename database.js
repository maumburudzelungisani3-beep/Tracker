const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'registry.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance and concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    room TEXT DEFAULT 'Main Registry Office',
    description TEXT,
    shelves_count INTEGER DEFAULT 4,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'in_office', -- 'in_office' or 'issued' or 'archived'
    cabinet TEXT NOT NULL,
    shelf TEXT,
    box_number TEXT,
    current_holder TEXT,
    holder_dept TEXT,
    holder_contact TEXT,
    issued_date TEXT,
    due_date TEXT,
    last_location_comment TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS file_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'created', 'checkout', 'checkin', 'transfer', 'relocated', 'archived'
    officer_name TEXT,
    officer_dept TEXT,
    cabinet TEXT,
    shelf TEXT,
    box_number TEXT,
    remarks TEXT,
    performed_by TEXT DEFAULT 'Registry Clerk',
    timestamp TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS location_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    location_context TEXT,
    author TEXT DEFAULT 'Registry Staff',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS correspondence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'inward' or 'outward'
    reference_no TEXT NOT NULL,
    correspondence_date TEXT NOT NULL,
    sender_or_recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
    file_number TEXT,
    officer_in_charge TEXT,
    delivery_mode TEXT DEFAULT 'Internal Dispatch',
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Actioned', 'Filed', 'Dispatched'
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_files_number ON files(file_number);
  CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
  CREATE INDEX IF NOT EXISTS idx_files_cabinet ON files(cabinet);
  CREATE INDEX IF NOT EXISTS idx_movements_file_id ON file_movements(file_id);
  CREATE INDEX IF NOT EXISTS idx_comments_file_id ON location_comments(file_id);
  CREATE INDEX IF NOT EXISTS idx_correspondence_file_id ON correspondence(file_id);
`);

// Seed Default Cabinets if empty
const countCabinets = db.prepare('SELECT COUNT(*) as count FROM cabinets').get().count;
if (countCabinets === 0) {
  const insertCabinet = db.prepare(`
    INSERT INTO cabinets (name, room, description, shelves_count) VALUES (?, ?, ?, ?)
  `);

  insertCabinet.run('Cabinet A - Administration', 'Main Registry Office (Left Wall)', 'Contains general administrative and directorate dossiers', 5);
  insertCabinet.run('Cabinet B - Human Resources', 'Main Registry Office (Left Wall)', 'Personnel records, staff appraisals, leave files', 4);
  insertCabinet.run('Cabinet C - Finance & Procurement', 'Main Registry Office (Back Wall)', 'Audited vouchers, supplier agreements, payment files', 4);
  insertCabinet.run('Cabinet D - Legal & Compliance', 'Main Registry Office (Right Wall)', 'Contracts, legal opinions, statutory regulatory dockets', 4);
  insertCabinet.run('Cabinet E - Projects & Operations', 'Main Registry Office (Right Wall)', 'Field operations, infrastructure projects & technical files', 5);
  insertCabinet.run('Archive Cabinet 1 - Old Records', 'Registry Storage Annex', 'Inactive/Closed files scheduled for retention review', 6);
}

// Seed sample files if empty
const countFiles = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
if (countFiles === 0) {
  const seedFiles = [
    {
      file_number: 'REG-ADM-2026-001',
      title: 'Annual Budget Estimates & Allocation 2026/2027',
      category: 'Administration',
      description: 'Departmental budget proposals, executive committee approvals and fiscal plans',
      status: 'in_office',
      cabinet: 'Cabinet A - Administration',
      shelf: 'Shelf 2',
      box_number: 'Box 04',
      current_holder: null,
      holder_dept: null,
      holder_contact: null,
      issued_date: null,
      due_date: null,
      last_location_comment: 'Placed on Shelf 2, Box 04 after internal quarterly review.'
    },
    {
      file_number: 'REG-HR-2026-015',
      title: 'Senior Officer Recruitment & Promotional Board',
      category: 'Human Resources',
      description: 'Interview scores, vetting certificates, and appointment committee recommendations',
      status: 'issued',
      cabinet: 'Cabinet B - Human Resources',
      shelf: 'Shelf 1',
      box_number: 'Box 12',
      current_holder: 'David Banda',
      holder_dept: 'HR Directorate (Room 204)',
      holder_contact: 'Ext. 2405 / +260 977 123456',
      issued_date: '2026-09-20 10:15:00',
      due_date: '2026-09-23', // Deliberately past due date to demonstrate Overdue alert!
      last_location_comment: 'David Banda took it for final signature review. Contacted him yesterday for return.'
    },
    {
      file_number: 'REG-FIN-2026-088',
      title: 'Quarterly Audit Query & Expenditure Reconciliations',
      category: 'Finance & Procurement',
      description: 'Auditor General queries, receipt attachments, response memoranda',
      status: 'issued',
      cabinet: 'Cabinet C - Finance & Procurement',
      shelf: 'Shelf 3',
      box_number: 'Box 02',
      current_holder: 'Grace Mwamba',
      holder_dept: 'Internal Audit (Room 112)',
      holder_contact: 'Ext. 1104',
      issued_date: '2026-09-23 14:30:00',
      due_date: '2026-09-28',
      last_location_comment: 'With Auditor Grace on Desk 3 for audit verification.'
    },
    {
      file_number: 'REG-LEG-2026-042',
      title: 'Office Lease Agreement & Tenancy Covenant Renewal',
      category: 'Legal & Compliance',
      description: 'Headquarters commercial lease contract, landlord notices and surveyor appraisals',
      status: 'in_office',
      cabinet: 'Cabinet D - Legal & Compliance',
      shelf: 'Shelf 4',
      box_number: 'Box 07',
      current_holder: null,
      holder_dept: null,
      holder_contact: null,
      issued_date: null,
      due_date: null,
      last_location_comment: 'Returned by Legal Counsel on Sept 22. Stored on Shelf 4.'
    },
    {
      file_number: 'REG-PRJ-2026-103',
      title: 'Solar Power Installation Project Contract & Site Reports',
      category: 'Projects & Operations',
      description: 'Engineering blueprints, stage 1 completion sign-off, invoice schedules',
      status: 'in_office',
      cabinet: 'Cabinet E - Projects & Operations',
      shelf: 'Shelf 1',
      box_number: 'Box 19',
      current_holder: null,
      holder_dept: null,
      holder_contact: null,
      issued_date: null,
      due_date: null,
      last_location_comment: 'Box 19, Cabinet E. Verified safe during weekly physical stocktake.'
    },
    {
      file_number: 'REG-ADM-2026-019',
      title: 'Fleet Management, Vehicle Logs & Fuel Authorizations',
      category: 'Administration',
      description: 'Quarterly fuel usage, vehicle maintenance requisitions, insurance certificates',
      status: 'issued',
      cabinet: 'Cabinet A - Administration',
      shelf: 'Shelf 3',
      box_number: 'Box 08',
      current_holder: 'Captain Mwila',
      holder_dept: 'Transport & Logistics Unit',
      holder_contact: 'Ext. 3012',
      issued_date: '2026-09-21 09:00:00',
      due_date: '2026-09-24', // Today due
      last_location_comment: 'Issued for monthly mileage reconciliation.'
    }
  ];

  const insertFileStmt = db.prepare(`
    INSERT INTO files (
      file_number, title, category, description, status, cabinet, shelf, box_number,
      current_holder, holder_dept, holder_contact, issued_date, due_date, last_location_comment
    ) VALUES (
      @file_number, @title, @category, @description, @status, @cabinet, @shelf, @box_number,
      @current_holder, @holder_dept, @holder_contact, @issued_date, @due_date, @last_location_comment
    )
  `);

  const insertMovementStmt = db.prepare(`
    INSERT INTO file_movements (file_id, action_type, officer_name, officer_dept, cabinet, shelf, box_number, remarks, performed_by, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCommentStmt = db.prepare(`
    INSERT INTO location_comments (file_id, comment, location_context, author, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    seedFiles.forEach((file) => {
      const res = insertFileStmt.run(file);
      const fileId = res.lastInsertRowid;

      // Creation movement
      insertMovementStmt.run(
        fileId,
        'created',
        null,
        null,
        file.cabinet,
        file.shelf,
        file.box_number,
        `File registered in office registry. Stored in ${file.cabinet}, ${file.shelf}`,
        'Registry Supervisor',
        '2026-09-01 08:30:00'
      );

      // If issued, add checkout movement
      if (file.status === 'issued') {
        insertMovementStmt.run(
          fileId,
          'checkout',
          file.current_holder,
          file.holder_dept,
          file.cabinet,
          file.shelf,
          file.box_number,
          `Checked out to ${file.current_holder} (${file.holder_dept}). Expected return: ${file.due_date}`,
          'Registry Clerk',
          file.issued_date
        );
      }

      // Add initial location comment
      if (file.last_location_comment) {
        insertCommentStmt.run(
          fileId,
          file.last_location_comment,
          file.status === 'in_office' ? `${file.cabinet}, ${file.shelf}` : `With ${file.current_holder}`,
          'Registry Clerk',
          '2026-09-22 11:00:00'
        );
      }
    });

    // Seed Correspondence (Inward & Outward Register)
    const insertCorr = db.prepare(`
      INSERT INTO correspondence (type, reference_no, correspondence_date, sender_or_recipient, subject, file_id, file_number, officer_in_charge, delivery_mode, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCorr.run(
      'inward',
      'IN-2026-0041',
      '2026-09-23',
      'Ministry of Finance & National Planning',
      'Submission of Budget Implementation Guidelines Q4',
      1,
      'REG-ADM-2026-001',
      'Registry Supervisor',
      'Hand Delivery',
      'Filed',
      'Placed into Annual Budget file folder.'
    );

    insertCorr.run(
      'inward',
      'IN-2026-0042',
      '2026-09-22',
      'Public Service Management Division',
      'Clearance of shortlisted applicants for promotion interviews',
      2,
      'REG-HR-2026-015',
      'David Banda',
      'Internal Dispatch',
      'Actioned',
      'Handed over to HR directorate with file.'
    );

    insertCorr.run(
      'outward',
      'OUT-2026-0019',
      '2026-09-21',
      'Auditor General Chambers',
      'Transmittal of Supporting Invoices & Vouchers for 2025/2026 Audit',
      3,
      'REG-FIN-2026-088',
      'Grace Mwamba',
      'Courier',
      'Dispatched',
      'Dispatched via Express Registry Courier, Waybill #49021.'
    );

    insertCorr.run(
      'outward',
      'OUT-2026-0020',
      '2026-09-22',
      'Crown Properties Ltd (Landlord)',
      'Formal Acceptance of 3-Year Commercial Lease Renewal Terms',
      4,
      'REG-LEG-2026-042',
      'Legal Counsel',
      'Hand Delivery',
      'Dispatched',
      'Acknowledged copy placed in lease docket.'
    );
  });

  tx();
}

module.exports = db;
