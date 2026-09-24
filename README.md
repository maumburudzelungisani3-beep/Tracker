# Registry Office File Tracker

A simple, fast, and focused file tracking system built for the **Registry Office** to manage files within a single office.

---

## 🎯 Purpose & Design
The system is built to be as simple to use as possible:
- Files have **only 4 details**:
  1. **REFERENCE NUMBER**
  2. **NAME** (Beneficiary / Owner)
  3. **FARM NAME**
  4. **DISTRICT**
- Real-time instant search: Search across Reference Number, Name, Farm Name, or District.
- The Registry Officer can find any file in seconds and **give it to whoever wants it** with one click.
- Know immediately:
  - **If in the office**: Which **Cabinet** and **Shelf** is it in?
  - **If given out**: **Who has it** and when was it taken?
- Add remarks/comments regarding file location anytime.

---

## 🚀 How to Run

1. Open your terminal in this folder:
   ```bash
   npm start
   ```
2. Open your web browser and go to:
   ```
   http://localhost:3000
   ```

---

## 📋 Features

- **Instant Search**: Type any part of a Reference Number, Person Name, Farm Name, or District.
- **Give File (1-Click)**: Click **"📤 Give File"**, type who is taking it, and save.
- **Return File (1-Click)**: Click **"📥 Return to Cabinet"**, choose the cabinet/shelf, and save.
- **Location Comments**: Add or update remarks on file placement anytime.
- **Custody History**: View the full timeline of who took the file, when it was returned, and all notes.
- **Excel / CSV Import**: Upload your spreadsheet with columns `REFERENCE NUMBER`, `FARM NAME`, `NAME`, `DISTRICT` (or Google Sheets link).
- **Export to CSV**: Download your current office registry inventory at any time.
