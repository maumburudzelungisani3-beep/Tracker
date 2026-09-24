/**
 * RegistryDesk - Client Application Logic
 * Comprehensive single-office file custody, cabinet tracking & dispatch system
 */

// Application State
const state = {
  currentTab: 'tab-files',
  files: [],
  cabinets: [],
  correspondence: [],
  currentDossierFileId: null,
  activeStatusFilter: 'all',
  activeCabinetFilter: 'all',
  activeCategoryFilter: 'all',
  searchQuery: '',
  stats: {}
};

// DOM Content Loaded Initializer
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  await loadCabinets();
  await loadStats();
  await loadFiles();
  await loadCorrespondence();

  // Set default date for modals
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('corr-date');
  if (dateInput) dateInput.value = todayStr;
}

// ----------------------------------------------------
// EVENT LISTENERS & NAVIGATION
// ----------------------------------------------------
function setupEventListeners() {
  // Main Tab Navigation
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const targetTab = tabBtn.dataset.tab;
      switchTab(targetTab);
    });
  });

  // Global Search Input with debounce
  const globalSearchInput = document.getElementById('global-search');
  const clearSearchBtn = document.getElementById('btn-clear-search');

  let debounceTimer;
  globalSearchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearSearchBtn.style.display = val ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = val.trim();
      loadFiles();
      if (state.currentTab !== 'tab-files') {
        switchTab('tab-files');
      }
    }, 250);
  });

  clearSearchBtn.addEventListener('click', () => {
    globalSearchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    loadFiles();
  });

  // Metric Cards as Quick Filter Shortcuts
  document.querySelectorAll('.metric-card').forEach((card) => {
    card.addEventListener('click', () => {
      const statusFilter = card.dataset.statusFilter;
      if (statusFilter) {
        setStatusFilter(statusFilter);
        switchTab('tab-files');
      }
    });
  });

  // Status Segmented Control
  document.querySelectorAll('#status-filter-buttons .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      setStatusFilter(status);
    });
  });

  // Cabinet & Category Dropdown Filters
  document.getElementById('filter-cabinet').addEventListener('change', (e) => {
    state.activeCabinetFilter = e.target.value;
    loadFiles();
  });

  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.activeCategoryFilter = e.target.value;
    loadFiles();
  });

  document.getElementById('btn-refresh-files').addEventListener('click', () => {
    loadStats();
    loadFiles();
    showToast('File records refreshed');
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    state.searchQuery = '';
    globalSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    state.activeCabinetFilter = 'all';
    state.activeCategoryFilter = 'all';
    document.getElementById('filter-cabinet').value = 'all';
    document.getElementById('filter-category').value = 'all';
    setStatusFilter('all');
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    window.location.href = '/api/export/csv';
  });

  // Modal Triggers: New File
  document.getElementById('btn-open-new-file-modal').addEventListener('click', () => {
    openModal('modal-new-file');
  });
  document.getElementById('btn-close-new-file').addEventListener('click', () => closeModal('modal-new-file'));
  document.getElementById('btn-cancel-new-file').addEventListener('click', () => closeModal('modal-new-file'));
  document.getElementById('form-new-file').addEventListener('submit', handleCreateNewFile);

  // Modal Triggers: Import Spreadsheet
  const btnOpenImport = document.getElementById('btn-open-import-modal');
  if (btnOpenImport) {
    btnOpenImport.addEventListener('click', () => openModal('modal-import'));
  }
  const btnCloseImport = document.getElementById('btn-close-import');
  if (btnCloseImport) btnCloseImport.addEventListener('click', () => closeModal('modal-import'));
  const btnCancelImport = document.getElementById('btn-cancel-import');
  if (btnCancelImport) btnCancelImport.addEventListener('click', () => closeModal('modal-import'));

  // Import subtabs
  document.querySelectorAll('[data-import-pane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-import-pane]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.import-pane').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.importPane);
      if (pane) pane.style.display = 'block';
    });
  });

  // File Input selection feedback
  const fileInput = document.getElementById('spreadsheet-file-input');
  const fileNameDisplay = document.getElementById('selected-file-name');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size / 1024).toFixed(1)} KB)`;
      } else {
        fileNameDisplay.textContent = '';
      }
    });
  }

  // Form Upload File
  const formUpload = document.getElementById('form-upload-file');
  if (formUpload) formUpload.addEventListener('submit', handleUploadSpreadsheet);

  // Form Google Sheets URL
  const formGSheet = document.getElementById('form-import-gsheet');
  if (formGSheet) formGSheet.addEventListener('submit', handleGoogleSheetImport);

  // Quick Import buttons
  document.querySelectorAll('.btn-quick-import').forEach((btn) => {
    btn.addEventListener('click', () => handleQuickPresetImport(btn.dataset.path));
  });

  // Modal Triggers: Check-out
  document.getElementById('btn-close-checkout').addEventListener('click', () => closeModal('modal-checkout'));
  document.getElementById('btn-cancel-checkout').addEventListener('click', () => closeModal('modal-checkout'));
  document.getElementById('form-checkout').addEventListener('submit', handleCheckoutSubmit);

  // Modal Triggers: Check-in
  document.getElementById('btn-close-checkin').addEventListener('click', () => closeModal('modal-checkin'));
  document.getElementById('btn-cancel-checkin').addEventListener('click', () => closeModal('modal-checkin'));
  document.getElementById('form-checkin').addEventListener('submit', handleCheckinSubmit);

  // Modal Triggers: Transfer
  document.getElementById('btn-close-transfer').addEventListener('click', () => closeModal('modal-transfer'));
  document.getElementById('btn-cancel-transfer').addEventListener('click', () => closeModal('modal-transfer'));
  document.getElementById('form-transfer').addEventListener('submit', handleTransferSubmit);

  // Modal Triggers: Dossier
  document.getElementById('btn-close-dossier').addEventListener('click', () => closeModal('modal-dossier'));
  document.getElementById('form-add-comment').addEventListener('submit', handleAddLocationComment);

  // Dossier Tabs
  document.querySelectorAll('.d-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.d-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dossier-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.dtab);
      if (target) target.classList.add('active');
    });
  });

  // Print Slip
  document.getElementById('btn-print-slip').addEventListener('click', handlePrintDocketSlip);

  // Modal Triggers: Add Cabinet
  document.getElementById('btn-new-cabinet').addEventListener('click', () => openModal('modal-cabinet'));
  document.getElementById('btn-close-cabinet').addEventListener('click', () => closeModal('modal-cabinet'));
  document.getElementById('btn-cancel-cabinet').addEventListener('click', () => closeModal('modal-cabinet'));
  document.getElementById('form-cabinet').addEventListener('submit', handleCreateCabinet);

  // Correspondence Buttons & Filter
  document.getElementById('btn-log-inward').addEventListener('click', () => openCorrespondenceModal('inward'));
  document.getElementById('btn-log-outward').addEventListener('click', () => openCorrespondenceModal('outward'));
  document.getElementById('btn-close-corr').addEventListener('click', () => closeModal('modal-corr'));
  document.getElementById('btn-cancel-corr').addEventListener('click', () => closeModal('modal-corr'));
  document.getElementById('form-corr').addEventListener('submit', handleCreateCorrespondence);

  document.querySelectorAll('#corr-type-filters .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#corr-type-filters .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadCorrespondence(btn.dataset.corrType);
    });
  });

  let corrDebounce;
  document.getElementById('corr-search-input').addEventListener('input', (e) => {
    clearTimeout(corrDebounce);
    corrDebounce = setTimeout(() => {
      const activeType = document.querySelector('#corr-type-filters .segment-btn.active')?.dataset.corrType || 'all';
      loadCorrespondence(activeType, e.target.value.trim());
    }, 250);
  });

  // Backdrop click to close modals
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  if (tabId === 'tab-cabinets') {
    renderCabinetsGrid();
  } else if (tabId === 'tab-overdue') {
    renderOverdueList();
  } else if (tabId === 'tab-correspondence') {
    loadCorrespondence();
  }
}

function setStatusFilter(status) {
  state.activeStatusFilter = status;
  document.querySelectorAll('#status-filter-buttons .segment-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  loadFiles();
}

// ----------------------------------------------------
// DATA FETCHING: STATS, CABINETS, FILES
// ----------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success) {
      state.stats = data.stats;
      document.getElementById('stat-total-files').textContent = data.stats.totalFiles;
      document.getElementById('stat-in-office').textContent = data.stats.inOffice;
      document.getElementById('stat-issued-out').textContent = data.stats.issuedOut;
      document.getElementById('stat-overdue').textContent = data.stats.overdue;

      // Badges in tabs
      document.getElementById('badge-total-files').textContent = data.stats.totalFiles;
      document.getElementById('badge-cabinets-count').textContent = data.stats.cabinetsCount;
      document.getElementById('badge-corr-count').textContent = data.stats.inwardCount + data.stats.outwardCount;
      document.getElementById('badge-overdue-count').textContent = data.stats.overdue;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadCabinets() {
  try {
    const res = await fetch('/api/cabinets');
    const data = await res.json();
    if (data.success) {
      state.cabinets = data.cabinets;
      populateCabinetDropdowns();
      renderCabinetsGrid();
    }
  } catch (err) {
    console.error('Failed to load cabinets:', err);
  }
}

function populateCabinetDropdowns() {
  const filterCabinet = document.getElementById('filter-cabinet');
  const newFileCabinet = document.getElementById('new-file-cabinet');
  const checkinCabinet = document.getElementById('checkin-cabinet');
  const importCabinet = document.getElementById('import-cabinet');

  const currentFilterVal = filterCabinet.value;

  filterCabinet.innerHTML = '<option value="all">All Cabinets</option>';
  newFileCabinet.innerHTML = '';
  checkinCabinet.innerHTML = '';
  if (importCabinet) importCabinet.innerHTML = '';

  state.cabinets.forEach((cab) => {
    const optFilter = document.createElement('option');
    optFilter.value = cab.name;
    optFilter.textContent = `${cab.name} (${cab.room || 'Office'})`;
    filterCabinet.appendChild(optFilter);

    const optNew = document.createElement('option');
    optNew.value = cab.name;
    optNew.textContent = `${cab.name}`;
    newFileCabinet.appendChild(optNew);

    const optCheckin = document.createElement('option');
    optCheckin.value = cab.name;
    optCheckin.textContent = `${cab.name}`;
    checkinCabinet.appendChild(optCheckin);

    if (importCabinet) {
      const optImport = document.createElement('option');
      optImport.value = cab.name;
      optImport.textContent = `${cab.name}`;
      if (cab.name.includes('Title Deeds') || cab.name.includes('Administration')) {
        optImport.selected = true;
      }
      importCabinet.appendChild(optImport);
    }
  });

  if (currentFilterVal && state.cabinets.some(c => c.name === currentFilterVal)) {
    filterCabinet.value = currentFilterVal;
  }
}

async function loadFiles() {
  try {
    let url = `/api/files?status=${encodeURIComponent(state.activeStatusFilter)}`;
    if (state.searchQuery) {
      url += `&q=${encodeURIComponent(state.searchQuery)}`;
    }
    if (state.activeCabinetFilter !== 'all') {
      url += `&cabinet=${encodeURIComponent(state.activeCabinetFilter)}`;
    }
    if (state.activeCategoryFilter !== 'all') {
      url += `&category=${encodeURIComponent(state.activeCategoryFilter)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.files = data.files;
      renderFilesTable();
      renderOverdueList();
    }
  } catch (err) {
    console.error('Failed to load files:', err);
  }
}

// ----------------------------------------------------
// RENDERING: FILES TABLE
// ----------------------------------------------------
function renderFilesTable() {
  const tbody = document.getElementById('files-table-body');
  const emptyState = document.getElementById('files-empty-state');
  const countSummary = document.getElementById('files-count-summary');
  const activeFilterTag = document.getElementById('active-filter-tag');

  tbody.innerHTML = '';

  countSummary.textContent = `Showing ${state.files.length} record${state.files.length === 1 ? '' : 's'}`;

  // Indicator
  if (state.activeStatusFilter !== 'all' || state.activeCabinetFilter !== 'all' || state.searchQuery) {
    activeFilterTag.style.display = 'inline-block';
    let label = '';
    if (state.activeStatusFilter !== 'all') label += `Status: ${state.activeStatusFilter} `;
    if (state.activeCabinetFilter !== 'all') label += `| Cabinet: ${state.activeCabinetFilter} `;
    if (state.searchQuery) label += `| Search: "${state.searchQuery}"`;
    activeFilterTag.textContent = label.trim();
  } else {
    activeFilterTag.style.display = 'none';
  }

  if (state.files.length === 0) {
    emptyState.style.display = 'block';
    return;
  } else {
    emptyState.style.display = 'none';
  }

  state.files.forEach((file) => {
    const tr = document.createElement('tr');
    if (file.is_overdue) {
      tr.classList.add('row-overdue');
    }

    // Status formatting
    let statusBadge = '';
    if (file.is_overdue) {
      statusBadge = `<span class="status-pill overdue"><span class="dot overdue"></span> Overdue (${Math.abs(file.days_diff)}d)</span>`;
    } else if (file.status === 'issued') {
      statusBadge = `<span class="status-pill issued"><span class="dot issued"></span> With Officer</span>`;
    } else {
      statusBadge = `<span class="status-pill in-office"><span class="dot in-office"></span> In Cabinet</span>`;
    }

    // High Priority Physical Location / Officer Cell
    let locationHtml = '';
    if (file.status === 'in_office') {
      locationHtml = `
        <div class="location-highlight-cell">
          <div class="location-primary location-in-office">
            <span class="loc-icon">📍</span>
            <span>${escapeHtml(file.cabinet)}</span>
          </div>
          <div class="location-sub">
            <span style="font-weight:600; color:#334155;">${escapeHtml(file.shelf || 'Shelf 1')}</span>
            ${file.box_number ? ` &bull; <span style="color:#64748b;">${escapeHtml(file.box_number)}</span>` : ''}
          </div>
          ${file.last_location_comment ? `<div class="location-comment-preview" title="${escapeHtml(file.last_location_comment)}">${escapeHtml(file.last_location_comment)}</div>` : ''}
        </div>
      `;
    } else {
      const overdueClass = file.is_overdue ? 'overdue-text' : '';
      locationHtml = `
        <div class="location-highlight-cell">
          <div class="location-primary location-with-officer ${overdueClass}">
            <span class="loc-icon">👤</span>
            <span>${escapeHtml(file.current_holder)}</span>
          </div>
          <div class="location-sub">
            <span style="color:#475569;">${escapeHtml(file.holder_dept || 'Office')}</span>
            ${file.due_date ? ` &bull; Due: <strong style="${file.is_overdue ? 'color:#dc2626' : ''}">${escapeHtml(file.due_date)}</strong>` : ''}
          </div>
          ${file.last_location_comment ? `<div class="location-comment-preview" title="${escapeHtml(file.last_location_comment)}">${escapeHtml(file.last_location_comment)}</div>` : ''}
        </div>
      `;
    }

    // Actions
    let actionButtons = '';
    if (file.status === 'in_office') {
      actionButtons = `
        <button class="btn btn-primary btn-sm btn-action-checkout" data-id="${file.id}" title="Issue file to officer">
          📤 Issue
        </button>
      `;
    } else {
      actionButtons = `
        <button class="btn btn-success btn-sm btn-action-checkin" data-id="${file.id}" title="Return file to cabinet">
          📥 Return
        </button>
      `;
    }

    tr.innerHTML = `
      <td>
        <span class="file-ref">${escapeHtml(file.file_number)}</span>
      </td>
      <td>
        <div class="file-title-cell">
          <span class="file-title-main">${escapeHtml(file.title)}</span>
          ${file.description ? `<span class="file-desc-sub" title="${escapeHtml(file.description)}">${escapeHtml(file.description)}</span>` : ''}
        </div>
      </td>
      <td>
        <span class="meta-val" style="font-size:0.8rem; font-weight:500;">${escapeHtml(file.category)}</span>
      </td>
      <td>
        ${locationHtml}
      </td>
      <td>
        ${statusBadge}
      </td>
      <td>
        <div class="action-cell-btns">
          ${actionButtons}
          <button class="btn btn-secondary btn-sm btn-action-dossier" data-id="${file.id}" title="View full dossier, location comments & history">
            👁️ Dossier
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach Table Action Handlers
  tbody.querySelectorAll('.btn-action-checkout').forEach(btn => {
    btn.addEventListener('click', () => openCheckoutModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-action-checkin').forEach(btn => {
    btn.addEventListener('click', () => openCheckinModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-action-dossier').forEach(btn => {
    btn.addEventListener('click', () => openDossierModal(btn.dataset.id));
  });
}

// ----------------------------------------------------
// DOSSIER MODAL (LOCATION SPOTLIGHT + COMMENTS TIMELINE)
// ----------------------------------------------------
async function openDossierModal(fileId) {
  state.currentDossierFileId = fileId;
  try {
    const res = await fetch(`/api/files/${fileId}`);
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Failed to open dossier', 'error');
      return;
    }

    const file = data.file;
    const movements = data.movements;
    const comments = data.comments;
    const correspondence = data.correspondence;

    // Header Info
    document.getElementById('dossier-file-number').textContent = file.file_number;
    document.getElementById('dossier-file-title').textContent = file.title;
    document.getElementById('comment-file-id').value = file.id;

    const statusPill = document.getElementById('dossier-status-pill');
    statusPill.className = 'status-pill';
    if (file.is_overdue) {
      statusPill.classList.add('overdue');
      statusPill.textContent = `Overdue (${Math.abs(file.days_diff)} days)`;
    } else if (file.status === 'issued') {
      statusPill.classList.add('issued');
      statusPill.textContent = 'Issued / With Officer';
    } else {
      statusPill.classList.add('in-office');
      statusPill.textContent = 'In Office (In Cabinet)';
    }

    // Prominent Spotlight Banner: WHERE IS THIS FILE RIGHT NOW?
    const spotlight = document.getElementById('dossier-spotlight');
    if (file.status === 'in_office') {
      spotlight.innerHTML = `
        <div class="spotlight-card in-office">
          <div>
            <div class="spotlight-title">Current File Physical Location (In Office)</div>
            <div class="spotlight-main">
              <span>📍 ${escapeHtml(file.cabinet)}</span>
            </div>
            <div class="spotlight-sub">
              <strong>${escapeHtml(file.shelf || 'Shelf 1')}</strong> 
              ${file.box_number ? ` &bull; Box/Folder: <strong>${escapeHtml(file.box_number)}</strong>` : ''}
              &bull; File is available for immediate checkout or consultation in registry.
            </div>
          </div>
          <div class="spotlight-date-badge">
            <span class="status-pill in-office">✅ Available</span>
          </div>
        </div>
      `;
    } else {
      const overdueCard = file.is_overdue ? 'overdue' : 'issued';
      spotlight.innerHTML = `
        <div class="spotlight-card ${overdueCard}">
          <div>
            <div class="spotlight-title">Current Custodian (File is Out of Registry)</div>
            <div class="spotlight-main">
              <span>👤 ${escapeHtml(file.current_holder)}</span>
            </div>
            <div class="spotlight-sub">
              <span>🏢 ${escapeHtml(file.holder_dept || 'Department')}</span>
              ${file.holder_contact ? ` &bull; 📞 ${escapeHtml(file.holder_contact)}` : ''}
              <br>Issued on: <strong>${escapeHtml(file.issued_date || 'N/A')}</strong>
              &bull; Due Date: <strong style="${file.is_overdue ? 'color:#dc2626' : ''}">${escapeHtml(file.due_date || 'None')}</strong>
              ${file.is_overdue ? ` &bull; <strong style="color:#b91c1c;">EXCEEDED DUE DATE BY ${Math.abs(file.days_diff)} DAYS</strong>` : ''}
            </div>
          </div>
          <div class="spotlight-date-badge">
            <span class="status-pill ${overdueCard}">
              ${file.is_overdue ? '⚠️ Overdue' : '⏳ On Loan'}
            </span>
          </div>
        </div>
      `;
    }

    // Counts
    document.getElementById('dossier-comments-count').textContent = comments.length;
    document.getElementById('dossier-movements-count').textContent = movements.length;
    document.getElementById('dossier-corr-count').textContent = correspondence.length;

    // Comments Timeline
    renderDossierComments(comments);

    // Movement Timeline
    renderDossierMovements(movements);

    // Correspondence List
    renderDossierCorrespondence(correspondence);

    // Metadata
    document.getElementById('dossier-meta-category').textContent = file.category;
    document.getElementById('dossier-meta-cabinet').textContent = file.cabinet;
    document.getElementById('dossier-meta-shelf').textContent = file.shelf || 'Shelf 1';
    document.getElementById('dossier-meta-box').textContent = file.box_number || 'N/A';
    document.getElementById('dossier-meta-desc').textContent = file.description || 'No additional summary recorded.';

    // Action buttons in dossier footer
    const actionContainer = document.getElementById('dossier-action-buttons');
    if (file.status === 'in_office') {
      actionContainer.innerHTML = `
        <button class="btn btn-primary" id="dossier-btn-issue">
          📤 Issue File to Officer
        </button>
      `;
      document.getElementById('dossier-btn-issue').addEventListener('click', () => {
        closeModal('modal-dossier');
        openCheckoutModal(file.id);
      });
    } else {
      actionContainer.innerHTML = `
        <button class="btn btn-secondary" id="dossier-btn-transfer">
          🔄 Transfer to Another Officer
        </button>
        <button class="btn btn-success" id="dossier-btn-return">
          📥 Return File to Cabinet
        </button>
      `;
      document.getElementById('dossier-btn-transfer').addEventListener('click', () => {
        closeModal('modal-dossier');
        openTransferModal(file.id);
      });
      document.getElementById('dossier-btn-return').addEventListener('click', () => {
        closeModal('modal-dossier');
        openCheckinModal(file.id);
      });
    }

    // Reset comment form
    document.getElementById('comment-text').value = '';

    openModal('modal-dossier');
  } catch (err) {
    console.error('Error fetching dossier:', err);
    showToast('Failed to open file dossier', 'error');
  }
}

function renderDossierComments(comments) {
  const container = document.getElementById('dossier-comments-timeline');
  if (comments.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 1.5rem; color:#64748b;">
        No location comments recorded yet for this file.
      </div>
    `;
    return;
  }

  container.innerHTML = comments.map(c => `
    <div class="timeline-item">
      <div class="timeline-icon">💬</div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-author">${escapeHtml(c.author)}</span>
          <span class="timeline-time">${escapeHtml(c.created_at)}</span>
        </div>
        ${c.location_context ? `<span class="timeline-context-tag">📍 Context: ${escapeHtml(c.location_context)}</span>` : ''}
        <div class="timeline-text">${escapeHtml(c.comment)}</div>
      </div>
    </div>
  `).join('');
}

function renderDossierMovements(movements) {
  const container = document.getElementById('dossier-movement-timeline');
  if (movements.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 1.5rem; color:#64748b;">
        No movement history recorded yet.
      </div>
    `;
    return;
  }

  const actionIcons = {
    created: '✨',
    checkout: '📤',
    checkin: '📥',
    transfer: '🔄',
    relocated: '📦',
    archived: '🗄️'
  };

  container.innerHTML = movements.map(m => `
    <div class="timeline-item">
      <div class="timeline-icon">${actionIcons[m.action_type] || '📌'}</div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-author">Action: ${m.action_type.toUpperCase()} by ${escapeHtml(m.performed_by || 'Registry Staff')}</span>
          <span class="timeline-time">${escapeHtml(m.timestamp)}</span>
        </div>
        ${m.officer_name ? `<div style="font-size:0.8rem; font-weight:600; color:#1e293b; margin-bottom:0.2rem;">Officer: ${escapeHtml(m.officer_name)} (${escapeHtml(m.officer_dept || 'Office')})</div>` : ''}
        ${m.cabinet ? `<div style="font-size:0.8rem; color:#475569; margin-bottom:0.2rem;">Cabinet Location: ${escapeHtml(m.cabinet)}, ${escapeHtml(m.shelf || '')}</div>` : ''}
        <div class="timeline-text">${escapeHtml(m.remarks || '')}</div>
      </div>
    </div>
  `).join('');
}

function renderDossierCorrespondence(list) {
  const container = document.getElementById('dossier-corr-list');
  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 1.5rem; color:#64748b;">
        No inward or outward letters linked to this file yet.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Ref No</th>
          <th>Date</th>
          <th>Sender / Recipient</th>
          <th>Subject</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(c => `
          <tr>
            <td><span class="status-pill ${c.type === 'inward' ? 'in-office' : 'issued'}">${c.type.toUpperCase()}</span></td>
            <td><code>${escapeHtml(c.reference_no)}</code></td>
            <td>${escapeHtml(c.correspondence_date)}</td>
            <td>${escapeHtml(c.sender_or_recipient)}</td>
            <td>${escapeHtml(c.subject)}</td>
            <td><span class="tab-badge">${escapeHtml(c.status)}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------
// ADD LOCATION COMMENT
// ----------------------------------------------------
async function handleAddLocationComment(e) {
  e.preventDefault();
  const fileId = document.getElementById('comment-file-id').value;
  const comment = document.getElementById('comment-text').value.trim();
  const author = document.getElementById('comment-author').value.trim();

  if (!comment) return;

  try {
    const res = await fetch(`/api/files/${fileId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment, author })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Location comment recorded successfully');
      document.getElementById('comment-text').value = '';
      // Refresh dossier
      openDossierModal(fileId);
      loadFiles();
    } else {
      showToast(data.error || 'Failed to add comment', 'error');
    }
  } catch (err) {
    console.error('Error adding comment:', err);
    showToast('Failed to save comment', 'error');
  }
}

// ----------------------------------------------------
// CHECK-OUT (ISSUE FILE)
// ----------------------------------------------------
function openCheckoutModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('checkout-file-code').textContent = file.file_number;
  document.getElementById('checkout-file-title').textContent = file.title;
  document.getElementById('form-checkout').dataset.fileId = file.id;

  // Clear inputs
  document.getElementById('checkout-officer-name').value = '';
  document.getElementById('checkout-officer-dept').value = '';
  document.getElementById('checkout-officer-contact').value = '';
  document.getElementById('checkout-remarks').value = '';

  // Default due date: 7 days from now
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  document.getElementById('checkout-due-date').value = nextWeek.toISOString().split('T')[0];

  openModal('modal-checkout');
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const fileId = e.target.dataset.fileId;
  const officer_name = document.getElementById('checkout-officer-name').value.trim();
  const holder_dept = document.getElementById('checkout-officer-dept').value.trim();
  const holder_contact = document.getElementById('checkout-officer-contact').value.trim();
  const due_date = document.getElementById('checkout-due-date').value;
  const remarks = document.getElementById('checkout-remarks').value.trim();
  const performed_by = document.getElementById('checkout-performed-by').value.trim();

  try {
    const res = await fetch(`/api/files/${fileId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officer_name,
        holder_dept,
        holder_contact,
        due_date,
        remarks,
        performed_by
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File issued to ${officer_name}`);
      closeModal('modal-checkout');
      loadStats();
      loadFiles();
    } else {
      showToast(data.error || 'Failed to issue file', 'error');
    }
  } catch (err) {
    console.error('Error during checkout:', err);
    showToast('Failed to process checkout', 'error');
  }
}

// ----------------------------------------------------
// CHECK-IN (RETURN FILE)
// ----------------------------------------------------
function openCheckinModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('checkin-file-code').textContent = file.file_number;
  document.getElementById('checkin-file-title').textContent = file.title;
  document.getElementById('checkin-current-holder').textContent = `${file.current_holder} (${file.holder_dept || 'Office'})`;
  document.getElementById('form-checkin').dataset.fileId = file.id;

  // Pre-fill cabinet and shelf
  document.getElementById('checkin-cabinet').value = file.cabinet;
  document.getElementById('checkin-shelf').value = file.shelf || 'Shelf 1';
  document.getElementById('checkin-box').value = file.box_number || '';
  document.getElementById('checkin-remarks').value = `Returned intact by ${file.current_holder}. Placed in ${file.cabinet}.`;

  openModal('modal-checkin');
}

async function handleCheckinSubmit(e) {
  e.preventDefault();
  const fileId = e.target.dataset.fileId;
  const cabinet = document.getElementById('checkin-cabinet').value.trim();
  const shelf = document.getElementById('checkin-shelf').value.trim();
  const box_number = document.getElementById('checkin-box').value.trim();
  const remarks = document.getElementById('checkin-remarks').value.trim();
  const performed_by = document.getElementById('checkin-performed-by').value.trim();

  try {
    const res = await fetch(`/api/files/${fileId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cabinet, shelf, box_number, remarks, performed_by })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File returned to ${cabinet} (${shelf})`);
      closeModal('modal-checkin');
      loadStats();
      loadFiles();
      loadCabinets();
    } else {
      showToast(data.error || 'Failed to return file', 'error');
    }
  } catch (err) {
    console.error('Error during checkin:', err);
    showToast('Failed to process return', 'error');
  }
}

// ----------------------------------------------------
// DIRECT TRANSFER TO ANOTHER OFFICER
// ----------------------------------------------------
function openTransferModal(fileId) {
  const file = state.files.find(f => f.id == fileId);
  if (!file) return;

  document.getElementById('transfer-file-code').textContent = file.file_number;
  document.getElementById('transfer-file-title').textContent = file.title;
  document.getElementById('transfer-current-holder').textContent = `${file.current_holder} (${file.holder_dept || 'Office'})`;
  document.getElementById('form-transfer').dataset.fileId = file.id;

  document.getElementById('transfer-new-officer').value = '';
  document.getElementById('transfer-new-dept').value = '';
  document.getElementById('transfer-new-contact').value = '';
  document.getElementById('transfer-due-date').value = file.due_date || '';
  document.getElementById('transfer-remarks').value = `Transferred directly from ${file.current_holder}.`;

  openModal('modal-transfer');
}

async function handleTransferSubmit(e) {
  e.preventDefault();
  const fileId = e.target.dataset.fileId;
  const new_officer_name = document.getElementById('transfer-new-officer').value.trim();
  const new_holder_dept = document.getElementById('transfer-new-dept').value.trim();
  const new_holder_contact = document.getElementById('transfer-new-contact').value.trim();
  const due_date = document.getElementById('transfer-due-date').value;
  const remarks = document.getElementById('transfer-remarks').value.trim();

  try {
    const res = await fetch(`/api/files/${fileId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_officer_name,
        new_holder_dept,
        new_holder_contact,
        due_date,
        remarks,
        performed_by: 'Registry Clerk'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File transferred to ${new_officer_name}`);
      closeModal('modal-transfer');
      loadStats();
      loadFiles();
    } else {
      showToast(data.error || 'Failed to transfer file', 'error');
    }
  } catch (err) {
    console.error('Error during transfer:', err);
    showToast('Failed to process transfer', 'error');
  }
}

// ----------------------------------------------------
// CREATE NEW FILE
// ----------------------------------------------------
async function handleCreateNewFile(e) {
  e.preventDefault();
  const file_number = document.getElementById('new-file-number').value.trim();
  const category = document.getElementById('new-file-category').value;
  const title = document.getElementById('new-file-title').value.trim();
  const description = document.getElementById('new-file-description').value.trim();
  const cabinet = document.getElementById('new-file-cabinet').value;
  const shelf = document.getElementById('new-file-shelf').value.trim();
  const box_number = document.getElementById('new-file-box').value.trim();
  const initial_comment = document.getElementById('new-file-comment').value.trim();

  try {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_number,
        category,
        title,
        description,
        cabinet,
        shelf,
        box_number,
        initial_comment,
        performed_by: 'Registry Clerk'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`File ${file_number} registered successfully!`);
      closeModal('modal-new-file');
      document.getElementById('form-new-file').reset();
      loadStats();
      loadFiles();
      loadCabinets();
    } else {
      showToast(data.error || 'Failed to create file', 'error');
    }
  } catch (err) {
    console.error('Error creating file:', err);
    showToast('Failed to save new file', 'error');
  }
}

// ----------------------------------------------------
// CABINETS DIRECTORY & STORAGE MAP
// ----------------------------------------------------
function renderCabinetsGrid() {
  const container = document.getElementById('cabinets-grid');
  if (!container) return;

  if (state.cabinets.length === 0) {
    container.innerHTML = '<p class="text-muted">No cabinets configured in the registry office.</p>';
    return;
  }

  container.innerHTML = state.cabinets.map(cab => {
    const shelvesCount = cab.shelves_count || 4;
    let shelfSlots = '';
    for (let i = 1; i <= shelvesCount; i++) {
      const shelfName = `Shelf ${i}`;
      // Count files on this shelf
      const filesOnShelf = state.files.filter(f => f.cabinet === cab.name && f.shelf === shelfName && f.status === 'in_office').length;
      shelfSlots += `
        <div class="shelf-slot">
          <span class="shelf-slot-name">${shelfName}</span>
          <span class="shelf-slot-files">${filesOnShelf} file${filesOnShelf === 1 ? '' : 's'}</span>
        </div>
      `;
    }

    return `
      <div class="cabinet-card">
        <div class="cabinet-card-top">
          <div class="cabinet-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="3" y1="15" x2="21" y2="15"></line>
              <circle cx="12" cy="6" r="1"></circle>
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="18" r="1"></circle>
            </svg>
          </div>
          <div class="cabinet-title-info">
            <div class="cabinet-name">${escapeHtml(cab.name)}</div>
            <div class="cabinet-room">📍 ${escapeHtml(cab.room || 'Registry Office')}</div>
          </div>
        </div>

        <div class="cabinet-stats-bar">
          <div class="cab-stat-item">
            <span class="stat-num">${cab.total_files}</span>
            <span class="stat-desc">Total Files</span>
          </div>
          <div class="cab-stat-item">
            <span class="stat-num tag-success">${cab.in_office_files}</span>
            <span class="stat-desc">In Cabinet</span>
          </div>
          <div class="cab-stat-item">
            <span class="stat-num tag-warning">${cab.issued_files}</span>
            <span class="stat-desc">Issued Out</span>
          </div>
        </div>

        <div class="cabinet-shelves-visual">
          ${shelfSlots}
        </div>

        <button class="btn btn-secondary btn-sm btn-filter-by-cabinet" data-cabinet="${escapeHtml(cab.name)}">
          🔍 View All Files in this Cabinet
        </button>
      </div>
    `;
  }).join('');

  // Attach click handler to filter by cabinet
  container.querySelectorAll('.btn-filter-by-cabinet').forEach(btn => {
    btn.addEventListener('click', () => {
      const cabName = btn.dataset.cabinet;
      state.activeCabinetFilter = cabName;
      document.getElementById('filter-cabinet').value = cabName;
      switchTab('tab-files');
      loadFiles();
    });
  });
}

async function handleCreateCabinet(e) {
  e.preventDefault();
  const name = document.getElementById('cab-name').value.trim();
  const room = document.getElementById('cab-room').value.trim();
  const shelves_count = document.getElementById('cab-shelves').value;
  const description = document.getElementById('cab-desc').value.trim();

  try {
    const res = await fetch('/api/cabinets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, room, shelves_count, description })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Cabinet "${name}" added`);
      closeModal('modal-cabinet');
      document.getElementById('form-cabinet').reset();
      loadCabinets();
      loadStats();
    } else {
      showToast(data.error || 'Failed to create cabinet', 'error');
    }
  } catch (err) {
    console.error('Error adding cabinet:', err);
    showToast('Failed to add cabinet', 'error');
  }
}

// ----------------------------------------------------
// INWARD & OUTWARD DISPATCH REGISTER
// ----------------------------------------------------
async function loadCorrespondence(type = 'all', q = '') {
  try {
    let url = `/api/correspondence?type=${encodeURIComponent(type)}`;
    if (q) url += `&q=${encodeURIComponent(q)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.correspondence = data.correspondence;
      renderCorrespondenceTable();
    }
  } catch (err) {
    console.error('Failed to load correspondence:', err);
  }
}

function renderCorrespondenceTable() {
  const tbody = document.getElementById('corr-table-body');
  const emptyState = document.getElementById('corr-empty-state');
  tbody.innerHTML = '';

  if (state.correspondence.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  state.correspondence.forEach(item => {
    const tr = document.createElement('tr');
    const isOut = item.type === 'outward';
    tr.innerHTML = `
      <td>
        <span class="status-pill ${isOut ? 'issued' : 'in-office'}">
          ${isOut ? '📤 OUTWARD' : '📥 INWARD'}
        </span>
      </td>
      <td><span class="file-ref">${escapeHtml(item.reference_no)}</span></td>
      <td>${escapeHtml(item.correspondence_date)}</td>
      <td>
        <strong>${escapeHtml(item.sender_or_recipient)}</strong>
        ${item.delivery_mode ? `<br><small style="color:#64748b;">${escapeHtml(item.delivery_mode)}</small>` : ''}
      </td>
      <td>
        <div style="font-weight:600;">${escapeHtml(item.subject)}</div>
        ${item.notes ? `<small style="color:#64748b;">${escapeHtml(item.notes)}</small>` : ''}
      </td>
      <td>
        ${item.file_number ? `<code class="tab-badge" style="cursor:pointer;" onclick="openDossierByNumber('${escapeHtml(item.file_number)}')">${escapeHtml(item.file_number)}</code>` : '<span style="color:#94a3b8;">None</span>'}
      </td>
      <td>
        <span class="tab-badge">${escapeHtml(item.status || 'Logged')}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openCorrespondenceModal(type) {
  document.getElementById('corr-type').value = type;
  document.getElementById('corr-modal-title').textContent = type === 'inward' ? 'Log Inward Mail / Incoming Letter' : 'Log Outward Dispatch / Outgoing Memo';
  document.getElementById('corr-party-label').textContent = type === 'inward' ? 'From (Sender) *' : 'To (Recipient / Addressee) *';
  document.getElementById('corr-party').placeholder = type === 'inward' ? 'e.g. Ministry of Finance, Public Service Dept' : 'e.g. Auditor General, Managing Director';

  // Populate file dropdown
  const fileSelect = document.getElementById('corr-file-id');
  fileSelect.innerHTML = '<option value="">-- No file selected (General) --</option>';
  state.files.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.file_number} - ${f.title}`;
    fileSelect.appendChild(opt);
  });

  // Suggest Reference Number
  const prefix = type === 'inward' ? 'IN' : 'OUT';
  const year = new Date().getFullYear();
  const randomSeq = String(Math.floor(Math.random() * 900) + 100);
  document.getElementById('corr-ref-no').value = `${prefix}-${year}-${randomSeq}`;

  openModal('modal-corr');
}

async function handleCreateCorrespondence(e) {
  e.preventDefault();
  const type = document.getElementById('corr-type').value;
  const reference_no = document.getElementById('corr-ref-no').value.trim();
  const correspondence_date = document.getElementById('corr-date').value;
  const sender_or_recipient = document.getElementById('corr-party').value.trim();
  const subject = document.getElementById('corr-subject').value.trim();
  const file_id = document.getElementById('corr-file-id').value;
  const delivery_mode = document.getElementById('corr-delivery').value;
  const officer_in_charge = document.getElementById('corr-officer').value.trim();
  const notes = document.getElementById('corr-notes').value.trim();

  try {
    const res = await fetch('/api/correspondence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        reference_no,
        correspondence_date,
        sender_or_recipient,
        subject,
        file_id: file_id || null,
        delivery_mode,
        officer_in_charge,
        notes
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeModal('modal-corr');
      document.getElementById('form-corr').reset();
      loadStats();
      loadCorrespondence();
    } else {
      showToast(data.error || 'Failed to save correspondence', 'error');
    }
  } catch (err) {
    console.error('Error logging correspondence:', err);
    showToast('Failed to save correspondence', 'error');
  }
}

// ----------------------------------------------------
// OVERDUE LIST & FOLLOW-UP ACTIONS
// ----------------------------------------------------
function renderOverdueList() {
  const tbody = document.getElementById('overdue-table-body');
  const emptyState = document.getElementById('overdue-empty-state');
  if (!tbody) return;

  tbody.innerHTML = '';
  const overdueFiles = state.files.filter(f => f.is_overdue);

  if (overdueFiles.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  overdueFiles.forEach(file => {
    const tr = document.createElement('tr');
    tr.classList.add('row-overdue');
    tr.innerHTML = `
      <td><span class="file-ref">${escapeHtml(file.file_number)}</span></td>
      <td>
        <strong style="color:#1e293b;">${escapeHtml(file.title)}</strong>
        <br><small style="color:#64748b;">Cabinet: ${escapeHtml(file.cabinet)}</small>
      </td>
      <td>
        <strong>${escapeHtml(file.current_holder)}</strong>
        <br><span style="font-size:0.8rem; color:#475569;">${escapeHtml(file.holder_dept || 'Office')}</span>
        ${file.holder_contact ? `<br><small style="color:#2563eb;">📞 ${escapeHtml(file.holder_contact)}</small>` : ''}
      </td>
      <td><span style="font-weight:600; color:#dc2626;">${escapeHtml(file.due_date)}</span></td>
      <td><span class="status-pill overdue">${Math.abs(file.days_diff)} days overdue</span></td>
      <td>
        <div class="action-cell-btns">
          <button class="btn btn-secondary btn-sm btn-overdue-note" data-id="${file.id}" title="Add reminder note">
            💬 Note
          </button>
          <button class="btn btn-success btn-sm btn-overdue-return" data-id="${file.id}" title="Process return into cabinet">
            📥 Return
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-overdue-note').forEach(btn => {
    btn.addEventListener('click', () => openDossierModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-overdue-return').forEach(btn => {
    btn.addEventListener('click', () => openCheckinModal(btn.dataset.id));
  });
}

// ----------------------------------------------------
// PRINT DOCKET ROUTING SLIP
// ----------------------------------------------------
function handlePrintDocketSlip() {
  const file = state.files.find(f => f.id == state.currentDossierFileId);
  if (!file) return;

  const printArea = document.getElementById('print-slip-area');
  printArea.innerHTML = `
    <div class="print-slip-card">
      <div style="text-align:center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin:0; text-transform:uppercase;">Registry Office File Routing & Custody Slip</h2>
        <p style="margin:4px 0 0 0; font-size:14px;">Official File Movement Docket</p>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding:6px; font-weight:bold; width:30%;">File Reference Number:</td>
          <td style="padding:6px; font-size:18px; font-weight:bold; font-family:monospace;">${escapeHtml(file.file_number)}</td>
        </tr>
        <tr>
          <td style="padding:6px; font-weight:bold;">Subject / Title:</td>
          <td style="padding:6px;">${escapeHtml(file.title)}</td>
        </tr>
        <tr>
          <td style="padding:6px; font-weight:bold;">Category:</td>
          <td style="padding:6px;">${escapeHtml(file.category)}</td>
        </tr>
        <tr>
          <td style="padding:6px; font-weight:bold;">Designated Cabinet Location:</td>
          <td style="padding:6px;">${escapeHtml(file.cabinet)} &bull; ${escapeHtml(file.shelf || 'Shelf 1')}</td>
        </tr>
        <tr>
          <td style="padding:6px; font-weight:bold;">Current Status:</td>
          <td style="padding:6px; font-weight:bold;">${file.status === 'in_office' ? 'IN REGISTRY CABINET' : 'ISSUED TO OFFICER'}</td>
        </tr>
        ${file.status === 'issued' ? `
          <tr>
            <td style="padding:6px; font-weight:bold;">Current Holder / Officer:</td>
            <td style="padding:6px;">${escapeHtml(file.current_holder)} (${escapeHtml(file.holder_dept || 'Office')})</td>
          </tr>
          <tr>
            <td style="padding:6px; font-weight:bold;">Scheduled Return Date:</td>
            <td style="padding:6px;">${escapeHtml(file.due_date || 'N/A')}</td>
          </tr>
        ` : ''}
      </table>

      <div style="border: 1px dashed #666; padding: 12px; margin-top: 20px;">
        <p style="margin:0 0 8px 0; font-weight:bold;">Officer Acknowledgment / Signature:</p>
        <br><br>
        <div style="display:flex; justify-content:space-between;">
          <span>Officer Signature: _______________________</span>
          <span>Date: ________________</span>
        </div>
      </div>
    </div>
  `;

  window.print();
}

// ----------------------------------------------------
// SPREADSHEET IMPORTERS (EXCEL, CSV, GOOGLE SHEETS)
// ----------------------------------------------------
async function handleUploadSpreadsheet(e) {
  e.preventDefault();
  const fileInput = document.getElementById('spreadsheet-file-input');
  if (!fileInput || !fileInput.files.length) {
    showToast('Please select a spreadsheet file first', 'error');
    return;
  }

  const cabinet = document.getElementById('import-cabinet').value;
  const shelf = document.getElementById('import-shelf').value;
  const category = document.getElementById('import-category').value;

  const formData = new FormData();
  formData.append('spreadsheet', fileInput.files[0]);
  formData.append('cabinet', cabinet);
  formData.append('shelf', shelf);
  formData.append('category', category);

  const btnSubmit = document.getElementById('btn-submit-upload');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Importing records...';

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
      document.getElementById('selected-file-name').textContent = '';
      await loadCabinets();
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Error uploading spreadsheet', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Start File Import';
  }
}

async function handleGoogleSheetImport(e) {
  e.preventDefault();
  const url = document.getElementById('gsheet-url').value.trim();
  const cabinet = document.getElementById('import-cabinet').value;
  const shelf = document.getElementById('import-shelf').value;
  const category = document.getElementById('import-category').value;

  const btnSubmit = document.getElementById('btn-submit-gsheet');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Fetching from Google Sheets...';

  try {
    const res = await fetch('/api/import/googlesheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, cabinet, shelf, category })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeModal('modal-import');
      await loadCabinets();
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Google Sheet import failed', 'error');
    }
  } catch (err) {
    console.error('Google sheet import error:', err);
    showToast('Error connecting to Google Sheet', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Fetch & Import from Google Sheets';
  }
}

async function handleQuickPresetImport(filePath) {
  const cabinet = document.getElementById('import-cabinet').value;
  const shelf = document.getElementById('import-shelf').value;
  const category = document.getElementById('import-category').value;

  showToast('Importing spreadsheet records into registry...');
  try {
    const res = await fetch('/api/import/local-preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, cabinet, shelf, category })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeModal('modal-import');
      await loadCabinets();
      await loadStats();
      await loadFiles();
    } else {
      showToast(data.error || 'Import failed', 'error');
    }
  } catch (err) {
    console.error('Preset import error:', err);
    showToast('Error importing preset file', 'error');
  }
}

function openDossierByNumber(fileNumber) {
  const file = state.files.find(f => f.file_number === fileNumber);
  if (file) {
    openDossierModal(file.id);
  }
}

// ----------------------------------------------------
// UI UTILITIES: MODALS, TOASTS, ESCAPING
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
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
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
