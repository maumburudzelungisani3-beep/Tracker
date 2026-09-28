const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dbDir, 'registry.db');

// If running with a mounted persistent volume where the DB does not exist yet,
// automatically seed from the repository's data/registry.db if available
const seedDbPath = path.join(__dirname, 'data', 'registry.db');
if (!fs.existsSync(dbPath) && fs.existsSync(seedDbPath) && path.resolve(dbPath) !== path.resolve(seedDbPath)) {
  try {
    fs.copyFileSync(seedDbPath, dbPath);
    console.log(`Initialized database from seed at ${dbPath}`);
  } catch (err) {
    console.warn(`Could not copy initial seed database: ${err.message}`);
  }
}

const db = new Database(dbPath);

// Enable WAL mode for high performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize Clean Tables with the exact 4 file fields + office location & custody tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS cabinets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_no TEXT UNIQUE NOT NULL,  -- Reference Number
    name TEXT NOT NULL,                  -- Name / Beneficiary
    farm_name TEXT,                     -- Farm Name
    district TEXT,                      -- District
    cabinet TEXT NOT NULL DEFAULT 'Cabinet A',
    shelf TEXT DEFAULT 'Shelf 1',
    status TEXT NOT NULL DEFAULT 'in_office', -- 'in_office' or 'given_out'
    given_to TEXT,                      -- Who was given the file
    date_given TEXT,                    -- When it was given
    location_comment TEXT,              -- Remarks regarding file location
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS file_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'created', 'given_out', 'returned', 'comment'
    person_name TEXT,
    cabinet TEXT,
    shelf TEXT,
    comment TEXT,
    timestamp TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_files_ref ON files(reference_no);
  CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
  CREATE INDEX IF NOT EXISTS idx_files_farm ON files(farm_name);
  CREATE INDEX IF NOT EXISTS idx_files_district ON files(district);
  CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
`);

// Ensure default cabinets
const defaultCabinets = [
  'Cabinet A',
  'Cabinet B',
  'Cabinet C',
  'Cabinet D',
  'Cabinet E',
  'Cabinet F'
];

const checkCabinet = db.prepare('SELECT id FROM cabinets WHERE name = ?');
const insertCab = db.prepare('INSERT INTO cabinets (name) VALUES (?)');
defaultCabinets.forEach(cabName => {
  if (!checkCabinet.get(cabName)) {
    insertCab.run(cabName);
  }
});

// Seed sample files if table is empty
const countFiles = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
if (countFiles === 0) {
  const sampleFiles = [
    {
      reference_no: '75-165431E-E-25',
      name: 'GANGIRA T M',
      farm_name: 'DRYHAM LOT 2',
      district: 'ZVIMBA',
      cabinet: 'Cabinet A',
      shelf: 'Shelf 1',
      status: 'in_office',
      given_to: null,
      date_given: null,
      location_comment: 'Top shelf, Zvimba folder box 1'
    },
    {
      reference_no: '86-003277X-X-86',
      name: 'NYAHOTA T',
      farm_name: 'DRYHAM',
      district: 'ZVIMBA',
      cabinet: 'Cabinet A',
      shelf: 'Shelf 2',
      status: 'given_out',
      given_to: 'Officer David Banda (Valuations Desk)',
      date_given: '2026-09-24 09:30',
      location_comment: 'Taken to Valuations room for assessment signature'
    },
    {
      reference_no: '75-073998W-W-71',
      name: 'NYAGUSE G',
      farm_name: 'LOT 1 OF DRYHAM',
      district: 'ZVIMBA',
      cabinet: 'Cabinet A',
      shelf: 'Shelf 1',
      status: 'in_office',
      given_to: null,
      date_given: null,
      location_comment: 'Filed neatly in Cabinet A'
    },
    {
      reference_no: '70-078241A-A-70',
      name: 'CHIMHANDIRE M',
      farm_name: 'DRYHAM LOT 1',
      district: 'ZVIMBA',
      cabinet: 'Cabinet B',
      shelf: 'Shelf 3',
      status: 'given_out',
      given_to: 'Legal Officer Sarah Connor',
      date_given: '2026-09-23 14:15',
      location_comment: 'With Legal unit for deed title endorsement'
    },
    {
      reference_no: '63-143820L-L-25',
      name: 'ZHANGAZHA P',
      farm_name: 'DRYHAM LOT 2',
      district: 'ZVIMBA',
      cabinet: 'Cabinet B',
      shelf: 'Shelf 2',
      status: 'in_office',
      given_to: null,
      date_given: null,
      location_comment: 'Returned this morning by inspector'
    },
    {
      reference_no: '32-068502 R 32',
      name: 'NYAMUCHERERE MARGRET',
      farm_name: 'PLOT 52 WIX WICHENS',
      district: 'ZVIMBA',
      cabinet: 'Cabinet C',
      shelf: 'Shelf 1',
      status: 'in_office',
      given_to: null,
      date_given: null,
      location_comment: 'In Cabinet C Shelf 1'
    },
    {
      reference_no: '63-452127 C 75',
      name: 'MUNYANGUMA MOSES',
      farm_name: 'S/D 16 NYARAKURU',
      district: 'SEKE',
      cabinet: 'Cabinet D',
      shelf: 'Shelf 2',
      status: 'given_out',
      given_to: 'Audit Officer Grace Mwamba',
      date_given: '2026-09-24 11:00',
      location_comment: 'On Auditor Grace desk Room 112'
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO files (
      reference_no, name, farm_name, district, cabinet, shelf,
      status, given_to, date_given, location_comment
    ) VALUES (
      @reference_no, @name, @farm_name, @district, @cabinet, @shelf,
      @status, @given_to, @date_given, @location_comment
    )
  `);

  const insertHist = db.prepare(`
    INSERT INTO file_history (file_id, action_type, person_name, cabinet, shelf, comment, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    sampleFiles.forEach(f => {
      const res = insertStmt.run(f);
      const fileId = res.lastInsertRowid;

      insertHist.run(
        fileId,
        'created',
        null,
        f.cabinet,
        f.shelf,
        `File registered in registry. Stored in ${f.cabinet}, ${f.shelf}.`,
        '2026-09-20 08:30:00'
      );

      if (f.status === 'given_out') {
        insertHist.run(
          fileId,
          'given_out',
          f.given_to,
          f.cabinet,
          f.shelf,
          `Given to ${f.given_to}. Location note: ${f.location_comment}`,
          f.date_given
        );
      }
    });
  });

  tx();
}

module.exports = db;
