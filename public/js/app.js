/**
 * Registry Office File Tracker - Simple Client Logic
 * Displays ONLY: REFERENCE NUMBER, NAME, FARM NAME, DISTRICT, LOCATION & WHO WAS GIVEN THE FILE
 */

const state = {
  files: [],
  cabinets: ['Cabinet A', 'Cabinet B', 'Cabinet C', 'Cabinet D', 'Cabinet E'],
  districts: [],
  activeFilter: 'all', // 'all', 'in_office', 'given_out'
  activeCabinet: 'all',
  activeDistrict: 'all',
  searchQuery: ''
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  await loadStats();
  await loadFiles();
}

function setupEventListeners() {
  // Real-time Instant Search
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('btn-clear-search');

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearBtn.style.display = val ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = val.trim();
      loadFiles();
    }, 180);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    loadFiles();
    searchInput.focus();
  });

  document.getElementById('btn-reset-search').addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearBtn.style.display = 'none';
    state.activeCabinet = 'all';
    state.activeDistrict = 'all';
    document.getElementById('filter-cabinet').value = 'all';
    document.getElementById('filter-district').value = 'all';
    setActiveFilter('all');
  });

  // Filter Cards (All, In Office, Given Out)
  document.querySelectorAll('.summary-card').forEach((card) => {
    card.addEventListener('click', () => {
      const filter = card.dataset.status;
      setActiveFilter(filter);
    });
  });

  // Dropdown Filters
  document.getElementById('filter-cabinet').addEventListener('change', (e) => {
    state.activeCabinet = e.target.value;
    loadFiles();
  });

  document.getElementById('filter-district').addEventListener('change', (e) => {
    state.activeDistrict = e.target.value;
    loadFiles();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadStats();
    loadFiles();
    showToast('Records reloaded');
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    window.location.href = '/api/export/csv';
  });

  // Modal: Add File
  document.getElementById('btn-open-add-file').addEventListener('click', () => {
    populateCabinetDropdown('new-cabinet');
    openModal('modal-add-file');
    document.getElementById('new-ref').focus();
  });
  document.getElementById('btn-close-add-file').addEventListener('click', () => closeModal('modal-add-file'));
  document.getElementById('btn-cancel-add-file').addEventListener('click', () => closeModal('modal-add-file'));
  document.getElementById('form-add-file').addEventListener('submit', handleAddFileSubmit);

  // Modal: Give File
  document.getElementById('btn-close-give').addEventListener('click', () => closeModal('modal-give'));
  document.getElementById('btn-cancel-give').addEventListener('click', () => closeModal('modal-give'));
  document.getElementById('form-give').addEventListener('submit', handleGiveFileSubmit);

  // Modal: Return File
  document.getElementById('btn-close-return').addEventListener('click', () => closeModal('modal-return'));
  document.getElementById('btn-cancel-return').addEventListener('click', () => closeModal('modal-return'));
  document.getElementById('form-return').addEventListener('submit', handleReturnFileSubmit);

  // Modal: Add Location Comment
  document.getElementById('btn-close-comment').addEventListener('click', () => closeModal('modal-comment'));
  document.getElementById('btn-cancel-comment').addEventListener('click', () => closeModal('modal-comment'));
  document.getElementById('form-comment').addEventListener('submit', handleAddCommentSubmit);

  // Modal: History
  document.getElementById('btn-close-history').addEventListener('click', () => closeModal('modal-history'));
  document.getElementById('btn-cancel-history').addEventListener('click', () => closeModal('modal-history'));

  // Modal: Import
  document.getElementById('btn-open-import').addEventListener('click', () => {
    populateCabinetDropdown('import-cabinet-select');
    openModal('modal-import');
  });
  document.getElementById('btn-close-import').addEventListener('click', () => closeModal('modal-import'));
  document.getElementById('btn-cancel-import').addEventListener('click', () => closeModal('modal-import'));

  const importFileInput = document.getElementById('import-file-input');
  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    document.getElementById('import-file-name').textContent = file ? `Selected: ${file.name}` : '';
  });

  document.getElementById('form-upload-spreadsheet').addEventListener('submit', handleImportUploadSubmit);
  document.getElementById('form-import-gsheet').addEventListener('submit', handleImportGSheetSubmit);

  // Close modals when clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}

function setActiveFilter(filter) {
  state.activeFilter = filter;
  document.querySelectorAll('.summary-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.status === filter);
  });
  loadFiles();
}

// ----------------------------------------------------
// FETCH STATS & FILES
// ----------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('stat-total').textContent = data.stats.total;
      document.getElementById('stat-in-office').textContent = data.stats.inOffice;
      document.getElementById('stat-given-out').textContent = data.stats.givenOut;

      if (data.stats.cabinets && data.stats.cabinets.length) {
        state.cabinets = data.stats.cabinets;
      }
      if (data.stats.districts) {
        state.districts = data.stats.districts;
      }

      populateFilterDropdowns();
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function populateFilterDropdowns() {
  const cabSelect = document.getElementById('filter-cabinet');
  const distSelect = document.getElementById('filter-district');

  const currentCab = cabSelect.value;
  const currentDist = distSelect.value;

  cabSelect.innerHTML = '<option value="all">All Cabinets</option>';
  distSelect.innerHTML = '<option value="all">All Districts</option>';

  state.cabinets.forEach((cab) => {
    const opt = document.createElement('option');
    opt.value = cab;
    opt.textContent = cab;
    cabSelect.appendChild(opt);
  });

  state.districts.forEach((dist) => {
    if (!dist) return;
    const opt = document.createElement('option');
    opt.value = dist;
    opt.textContent = dist;
    distSelect.appendChild(opt);
  });

  if (currentCab) cabSelect.value = currentCab;
  if (currentDist) distSelect.value = currentDist;
}

function populateCabinetDropdown(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = '';
  state.cabinets.forEach((cab) => {
    const opt = document.createElement('option');
    opt.value = cab;
    opt.textContent = cab;
    el.appendChild(opt);
  });
}

async function loadFiles() {
  try {
    let url = `/api/files?status=${encodeURIComponent(state.activeFilter)}`;
    if (state.searchQuery) {
      url += `&q=${encodeURIComponent(state.searchQuery)}`;
    }
    if (state.activeCabinet !== 'all') {
      url += `&cabinet=${encodeURIComponent(state.activeCabinet)}`;
    }
    if (state.activeDistrict !== 'all') {
      url += `&district=${encodeURIComponent(state.activeDistrict)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.files = data.files;
      renderFilesTable();
    }
  } catch (err) {
    console.error('Failed to load files:', err);
  }
}

// ----------------------------------------------------
// RENDER FILES TABLE (ONLY 4 DETAILS + LOCATION & CUSTODY)
// ----------------------------------------------------
function renderFilesTable() {
  const tbody = document.getElementById('files-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const countSummary = document.getElementById('results-count-text');

  tbody.innerHTML = '';

  countSummary.textContent = `Showing ${state.files.length} file record${state.files.length === 1 ? '' : 's'}`;

  if (state.files.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  state.files.forEach((file) => {
    const tr = document.createElement('tr');
    if (file.status === 'given_out') {
      tr.classList.add('is-given');
    }

    // Current location & custody display
    let locationBlock = '';
    let actionButtons = '';

    if (file.status === 'in_office') {
      locationBlock = `
        <div class="loc-status-block">
          <span class="status-badge in-office">🟢 In Office</span>
          <span class="loc-detail">📍 ${escapeHtml(file.cabinet)}, ${escapeHtml(file.shelf || 'Shelf 1')}</span>
          ${file.location_comment ? `
            <div class="loc-comment-box" title="${escapeHtml(file.location_comment)}">
              <span class="loc-comment-text">💬 ${escapeHtml(file.location_comment)}</span>
              <button class="btn-quick-comment btn-add-note" data-id="${file.id}">Edit</button>
            </div>
          ` : `
            <button class="btn-quick-comment btn-add-note" data-id="${file.id}" style="margin-top:2px;">+ Add Location Note</button>
          `}
        </div>
      `;

      actionButtons = `
        <button class="btn btn-primary btn-give" data-id="${file.id}" title="Give this file to an officer">
          📤 Give File
        </button>
        <button class="btn btn-secondary btn-history" data-id="${file.id}" title="View custody history">
          🕒 History
        </button>
      `;
    } else {
      locationBlock = `
        <div class="loc-status-block">
          <span class="status-badge given-out">🟠 Given Out</span>
          <span class="loc-detail">👤 <strong>${escapeHtml(file.given_to || 'Officer')}</strong></span>
          ${file.date_given ? `<small style="color:#64748b; font-size:0.75rem;">Given: ${escapeHtml(file.date_given)}</small>` : ''}
          ${file.location_comment ? `
            <div class="loc-comment-box" title="${escapeHtml(file.location_comment)}">
              <span class="loc-comment-text">💬 ${escapeHtml(file.location_comment)}</span>
              <button class="btn-quick-comment btn-add-note" data-id="${file.id}">Edit</button>
            </div>
          ` : `
            <button class="btn-quick-comment btn-add-note" data-id="${file.id}" style="margin-top:2px;">+ Add Location Note</button>
          `}
        </div>
      `;

      actionButtons = `
        <button class="btn btn-success btn-return" data-id="${file.id}" title="Return file into cabinet">
          📥 Return to Cabinet
        </button>
        <button class="btn btn-secondary btn-history" data-id="${file.id}" title="View custody history">
          🕒 History
        </button>
      `;
    }

    tr.innerHTML = `
      <td>
        <span class="ref-pill">${escapeHtml(file.reference_no)}</span>
      </td>
      <td>
        <span class="name-cell">${escapeHtml(file.name)}</span>
      </td>
      <td>
        <span class="farm-cell">${escapeHtml(file.farm_name || '-')}</span>
      </td>
      <td>
        <span class="district-pill">${escapeHtml(file.district || '-')}</span>
      </td>
      <td>
        ${locationBlock}
      </td>
      <td>
        <div class="action-buttons-wrap">
          ${actionButtons}
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach button events
  tbody.querySelectorAll('.btn-give').forEach(btn => {
    btn.addEventListener('click', () => openGiveModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-return').forEach(btn => {
    btn.addEventListener('click', () => openReturnModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-add-note').forEach(btn => {
    btn.addEventListener('click', () => openCommentModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-history').forEach(btn => {
    btn.addEventListener('click', () => openHistoryModal(btn.dataset.id));
  });
}

// ----------------------------------------------------
// GIVE FILE WORKFLOW
// ----------------------------------------------------
function openGiveModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('give-file-id').value = file.id;
  document.getElementById('give-display-ref').textContent = file.reference_no;
  document.getElementById('give-display-name').textContent = file.name;
  document.getElementById('give-display-farm').textContent = `${file.farm_name || 'No Farm'} • District: ${file.district || 'N/A'}`;

  document.getElementById('give-person').value = '';
  document.getElementById('give-date').value = new Date().toLocaleString();
  document.getElementById('give-comment').value = '';

  openModal('modal-give');
  setTimeout(() => document.getElementById('give-person').focus(), 50);
}

async function handleGiveFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('give-file-id').value;
  const given_to = document.getElementById('give-person').value.trim();
  const date_given = document.getElementById('give-date').value.trim();
  const comment = document.getElementById('give-comment').value.trim();

  if (!given_to) return;

  try {
    const res = await fetch(`/api/files/${fileId}/give`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ given_to, date_given, comment })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File given to ${given_to}`);
      closeModal('modal-give');
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Failed to update file', 'error');
    }
  } catch (err) {
    console.error('Give file error:', err);
    showToast('Failed to process request', 'error');
  }
}

// ----------------------------------------------------
// RETURN FILE WORKFLOW
// ----------------------------------------------------
function openReturnModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('return-file-id').value = file.id;
  document.getElementById('return-display-ref').textContent = file.reference_no;
  document.getElementById('return-display-name').textContent = file.name;
  document.getElementById('return-display-holder').textContent = `Currently with: ${file.given_to || 'Officer'}`;

  populateCabinetDropdown('return-cabinet');
  document.getElementById('return-cabinet').value = file.cabinet || 'Cabinet A';
  document.getElementById('return-shelf').value = file.shelf || 'Shelf 1';
  document.getElementById('return-comment').value = `Returned by ${file.given_to || 'Officer'}`;

  openModal('modal-return');
}

async function handleReturnFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('return-file-id').value;
  const cabinet = document.getElementById('return-cabinet').value;
  const shelf = document.getElementById('return-shelf').value.trim();
  const comment = document.getElementById('return-comment').value.trim();

  try {
    const res = await fetch(`/api/files/${fileId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cabinet, shelf, comment })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File returned to ${cabinet}, ${shelf}`);
      closeModal('modal-return');
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Failed to return file', 'error');
    }
  } catch (err) {
    console.error('Return file error:', err);
    showToast('Failed to return file', 'error');
  }
}

// ----------------------------------------------------
// LOCATION COMMENT WORKFLOW
// ----------------------------------------------------
function openCommentModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('comment-file-id').value = file.id;
  document.getElementById('comment-display-ref').textContent = file.reference_no;
  document.getElementById('comment-display-name').textContent = file.name;

  if (file.status === 'in_office') {
    document.getElementById('comment-display-current-loc').textContent = `Location: ${file.cabinet}, ${file.shelf || 'Shelf 1'}`;
  } else {
    document.getElementById('comment-display-current-loc').textContent = `Currently With: ${file.given_to}`;
  }

  document.getElementById('input-comment-text').value = file.location_comment || '';

  openModal('modal-comment');
  setTimeout(() => document.getElementById('input-comment-text').focus(), 50);
}

async function handleAddCommentSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('comment-file-id').value;
  const comment = document.getElementById('input-comment-text').value.trim();

  if (!comment) return;

  try {
    const res = await fetch(`/api/files/${fileId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Location note saved');
      closeModal('modal-comment');
      await loadFiles();
    } else {
      showToast(data.error || 'Failed to save note', 'error');
    }
  } catch (err) {
    console.error('Comment error:', err);
    showToast('Failed to save comment', 'error');
  }
}

// ----------------------------------------------------
// FILE HISTORY WORKFLOW
// ----------------------------------------------------
async function openHistoryModal(fileId) {
  try {
    const res = await fetch(`/api/files/${fileId}`);
    const data = await res.json();
    if (!data.success) {
      showToast('Could not load history', 'error');
      return;
    }

    const { file, history } = data;
    document.getElementById('history-file-title').textContent = `${file.reference_no} • ${file.name} (${file.farm_name || 'N/A'})`;

    const container = document.getElementById('history-list-container');
    if (!history || history.length === 0) {
      container.innerHTML = '<p style="color:#64748b; text-align:center; padding:1.5rem;">No movement history recorded.</p>';
    } else {
      const actionLabels = {
        created: '✨ File Registered',
        given_out: '📤 Given Out',
        returned: '📥 Returned to Cabinet',
        comment: '💬 Location Note'
      };

      container.innerHTML = history.map(h => `
        <div class="history-item">
          <div class="history-icon">${h.action_type === 'given_out' ? '📤' : (h.action_type === 'returned' ? '📥' : '💬')}</div>
          <div class="history-body">
            <div class="history-head">
              <span class="history-action">${actionLabels[h.action_type] || h.action_type}</span>
              <span class="history-time">${escapeHtml(h.timestamp)}</span>
            </div>
            ${h.person_name ? `<div style="font-weight:600; color:#0f172a; margin-bottom:2px;">Person / Officer: ${escapeHtml(h.person_name)}</div>` : ''}
            <div class="history-comment">${escapeHtml(h.comment || '')}</div>
          </div>
        </div>
      `).join('');
    }

    openModal('modal-history');
  } catch (err) {
    console.error('History error:', err);
    showToast('Error loading history', 'error');
  }
}

// ----------------------------------------------------
// ADD NEW FILE WORKFLOW
// ----------------------------------------------------
async function handleAddFileSubmit(e) {
  e.preventDefault();
  const reference_no = document.getElementById('new-ref').value.trim();
  const name = document.getElementById('new-name').value.trim();
  const farm_name = document.getElementById('new-farm').value.trim();
  const district = document.getElementById('new-district').value.trim();
  const cabinet = document.getElementById('new-cabinet').value;
  const shelf = document.getElementById('new-shelf').value.trim();
  const location_comment = document.getElementById('new-comment').value.trim();

  try {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_no, name, farm_name, district, cabinet, shelf, location_comment })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File ${reference_no} added!`);
      closeModal('modal-add-file');
      document.getElementById('form-add-file').reset();
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Failed to add file', 'error');
    }
  } catch (err) {
    console.error('Add file error:', err);
    showToast('Failed to create file', 'error');
  }
}

// ----------------------------------------------------
// IMPORT SPREADSHEET (EXCEL / CSV / GOOGLE SHEETS)
// ----------------------------------------------------
async function handleImportUploadSubmit(e) {
  e.preventDefault();
  const fileInput = document.getElementById('import-file-input');
  if (!fileInput.files.length) {
    showToast('Please choose an Excel (.xlsx) or CSV file first', 'error');
    return;
  }

  const cabinet = document.getElementById('import-cabinet-select').value;
  const shelf = document.getElementById('import-shelf-select').value;

  const formData = new FormData();
  formData.append('spreadsheet', fileInput.files[0]);
  formData.append('cabinet', cabinet);
  formData.append('shelf', shelf);

  const btn = document.getElementById('btn-start-import');
  btn.disabled = true;
  btn.textContent = 'Importing records...';

  try {
    const res = await fetch('/api/import/file', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeModal('modal-import');
      fileInput.value = '';
      document.getElementById('import-file-name').textContent = '';
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    console.error('Import upload error:', err);
    showToast('Error uploading file', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload & Import Records';
  }
}

async function handleImportGSheetSubmit(e) {
  e.preventDefault();
  const url = document.getElementById('gsheet-link').value.trim();
  const cabinet = document.getElementById('import-cabinet-select').value;
  const shelf = document.getElementById('import-shelf-select').value;

  const btn = document.getElementById('btn-fetch-gsheet');
  btn.disabled = true;
  btn.textContent = 'Connecting to Google Sheets...';

  try {
    const res = await fetch('/api/import/googlesheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, cabinet, shelf })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeModal('modal-import');
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Google Sheet import failed', 'error');
    }
  } catch (err) {
    console.error('Google sheet import error:', err);
    showToast('Error fetching sheet', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import from Google Sheets Link';
  }
}

// ----------------------------------------------------
// UI HELPERS
// ----------------------------------------------------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'all 180ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
