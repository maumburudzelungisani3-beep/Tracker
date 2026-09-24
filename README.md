# RegistryDesk - Office File Management & Custody Tracking System

A specialized, high-performance file tracking and records custody management system built for the **Registry Office** to manage files within a single office.

---

## 🎯 Key Highlights & Solved Problems

1. **Instant Location Lookup**:
   - **"Where is this file right now?"**
     - **If in the Office**: Shows the exact **Cabinet**, **Shelf/Drawer**, and **Box/Folder** (e.g., *Cabinet A - Administration, Shelf 2, Box 04*).
     - **If Issued Out**: Shows **Who has the file** (Officer Name, Department/Room, Extension/Phone, Date Checked Out, and Expected Return Date).
2. **Location Comments & Remarks**:
   - Add notes regarding the physical location of any file at any time (e.g., *"Temporarily placed on Supervisor's desk for afternoon audit"*, *"Moved to Shelf 3 for space consolidation"*).
   - Every comment is timestamped and stored in the file's permanent location timeline.
3. **Custody & Movement Lifecycle**:
   - **Issue / Check-out**: Record recipient officer, department, contact, purpose, and scheduled return date.
   - **Return / Check-in**: Return file back into designated or updated cabinet and shelf.
   - **Direct Transfer**: Hand over file directly from one officer to another.
   - **Full Movement Audit Trail**: View complete chronological chain of custody for every docket.
4. **Office Cabinet Directory & Visual Map**:
   - Visual view of all storage cabinets in the office with shelf breakdown and active file counts.
   - One-click filter to view all files inside any specific cabinet.
5. **Inward & Outward Correspondence Registry (Dispatch Book)**:
   - Log received incoming mail/memos (Inward) and outgoing dispatches (Outward), linked directly to office files.
6. **Overdue Alerts & Due Date Tracking**:
   - Highlighted alerts for files exceeding their return date with one-click follow-up logging and printable overdue lists.
7. **Print & Export**:
   - One-click printable **File Routing / Movement Docket Slip** with officer signature section.
   - Export office file inventory to Excel-compatible CSV.

---

## 🚀 Running the Application

### 1. Start the Server
In PowerShell or Command Prompt within the project directory:
```bash
npm start
```
*(Or with live auto-reload: `npm run dev`)*

### 2. Access the Application
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📂 Project Architecture

```
c:\Users\usr\Desktop\TRACKER\
├── server.js               # Express 5 API server & routing
├── database.js             # SQLite database schema, WAL mode, & seed data
├── package.json            # Scripts and dependencies
├── data/
│   └── registry.db         # Persistent SQLite database
└── public/
    ├── index.html          # Responsive single-page application
    ├── css/
    │   └── style.css       # Custom modern CSS design system
    └── js/
        └── app.js          # Interactive frontend logic & API client
```

---

## 🛠️ Technology Stack
- **Backend**: Node.js, Express 5
- **Database**: SQLite (via `better-sqlite3` with WAL mode for fast queries)
- **Frontend**: Modern Vanilla JS (ES6+), Semantic HTML5, Custom CSS Design System
- **Fonts**: Google Fonts *Plus Jakarta Sans* & *JetBrains Mono*
