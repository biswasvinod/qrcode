// Constants
const API_BASE = '/api';

// State Management
let isServerMode = false;
let qrcodesList = [];
let selectedAnalyticsQrId = null;

// Chart Instances (to destroy and rebuild)
let timelineChart = null;
let devicesChart = null;
let browsersChart = null;
let osChart = null;

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Forms & Inputs
const qrCreateForm = document.getElementById('qr-create-form');
const qrTitleInput = document.getElementById('qr-title');
const qrUrlInput = document.getElementById('qr-url');
const qrColorDarkInput = document.getElementById('qr-color-dark');
const qrColorLightInput = document.getElementById('qr-color-light');
const qrMarginInput = document.getElementById('qr-margin');
const qrEccInput = document.getElementById('qr-ecc');
const qrDotsTypeSelect = document.getElementById('qr-dots-type');
const qrCornersTypeSelect = document.getElementById('qr-corners-type');
const qrLogoInput = document.getElementById('qr-logo');
const qrLivePreviewBox = document.getElementById('qr-live-preview-box');
const qrLivePreviewImg = document.getElementById('qr-live-preview-img');

// Modals
const editUrlModal = document.getElementById('edit-url-modal');
const editQrForm = document.getElementById('edit-qr-form');
const editQrIdInput = document.getElementById('edit-qr-id');
const editQrTitleInput = document.getElementById('edit-qr-title');
const editQrUrlInput = document.getElementById('edit-qr-url');
const closeModalBtn = document.getElementById('close-modal-btn');

// Lists & States
const qrListContainer = document.getElementById('qr-list-container');
const dashboardEmptyState = document.getElementById('dashboard-empty-state');
const analyticsEmptyState = document.getElementById('analytics-empty-state');
const analyticsDashboardContent = document.getElementById('analytics-dashboard-content');
const analyticsQrSelect = document.getElementById('analytics-qr-select');
const refreshAnalyticsBtn = document.getElementById('refresh-analytics-btn');
const scanLogsTbody = document.getElementById('scan-logs-tbody');

// Simulator Elements
const simQrSelect = document.getElementById('sim-qr-select');
const simDeviceSelect = document.getElementById('sim-device');
const simOsSelect = document.getElementById('sim-os');
const simBrowserSelect = document.getElementById('sim-browser');
const simTriggerBtn = document.getElementById('sim-trigger-btn');
const simRedirectBtn = document.getElementById('sim-redirect-btn');
const simStateWaiting = document.getElementById('sim-state-waiting');
const simStateScanning = document.getElementById('sim-state-scanning');
const simRedirectMsg = document.getElementById('sim-redirect-msg');

// KPIs
const kpiTotalQrs = document.getElementById('kpi-total-qrs');
const kpiTotalScans = document.getElementById('kpi-total-scans');
const kpiActiveQr = document.getElementById('kpi-active-qr');

// Toast
const toastNotification = document.getElementById('toast-notification');

// Local Storage DB Helpers
function getLocalDb() {
  let db = localStorage.getItem('qr_flow_db');
  if (!db) {
    db = { qrcodes: [], scans: [] };
    localStorage.setItem('qr_flow_db', JSON.stringify(db));
    return db;
  }
  try {
    return JSON.parse(db);
  } catch (e) {
    console.error('Error parsing local storage DB, resetting...', e);
    const newDb = { qrcodes: [], scans: [] };
    localStorage.setItem('qr_flow_db', JSON.stringify(newDb));
    return newDb;
  }
}

function saveLocalDb(db) {
  localStorage.setItem('qr_flow_db', JSON.stringify(db));
}

let serverNetworkUrl = '';

// Check Server Engine availability
async function checkServerMode() {
  if (window.location.protocol === 'file:') {
    try {
      const res = await fetch('http://localhost:3000/api/info');
      if (res.ok) {
        const info = await res.json();
        serverNetworkUrl = info.serverUrl;
        isServerMode = true;
        console.log('Connected to Python Local Network Server at:', serverNetworkUrl);
        return;
      }
    } catch (e) {
      isServerMode = false;
      console.log('Running in Serverless Mode (file protocol)');
      return;
    }
  }

  try {
    const response = await fetch('/api/info');
    if (response.ok) {
      const info = await response.json();
      serverNetworkUrl = info.serverUrl;
      isServerMode = true;
      console.log('Running in Connected API Server Mode:', serverNetworkUrl);
    } else {
      isServerMode = false;
    }
  } catch (err) {
    isServerMode = false;
  }
}

// Generate redirect link based on mode
function getRedirectLink(id) {
  if (isServerMode && serverNetworkUrl) {
    return `${serverNetworkUrl}/r/${id}`;
  } else if (isServerMode) {
    return `${window.location.origin}/r/${id}`;
  } else {
    // Local serverless mode uses query parameters on the index.html path
    const basePath = window.location.href.split('?')[0].split('#')[0];
    return `${basePath}?scan=${id}`;
  }
}

// Generate QR Code image client-side using browser QRCode Styling library (with offline fallback)
async function generateQrClientSide(text, customization = {}) {
  try {
    if (typeof QRCodeStyling !== 'undefined') {
      const options = {
        width: 600,
        height: 600,
        data: text,
        dotsOptions: {
          color: customization.colorDark || '#000000',
          type: customization.dotsType || 'square'
        },
        backgroundOptions: {
          color: customization.colorLight || '#ffffff'
        },
        cornersSquareOptions: {
          color: customization.colorDark || '#000000',
          type: customization.cornersType || 'square'
        },
        cornersDotOptions: {
          color: customization.colorDark || '#000000',
          type: customization.cornersType || 'square'
        },
        qrOptions: {
          typeNumber: 0,
          mode: 'Byte',
          errorCorrectionLevel: customization.ecc || 'M'
        }
      };

      if (customization.logo && typeof customization.logo === 'string' && customization.logo.trim() !== '') {
        options.image = customization.logo;
        options.imageOptions = {
          crossOrigin: "anonymous",
          margin: 6,
          imageSizeFactor: 0.3
        };
      }

      const qrCode = new QRCodeStyling(options);
      const blob = await qrCode.getRawData("png");
      if (blob) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    }
  } catch (err) {
    console.warn('QRCodeStyling failed or offline, falling back to PureQRCode:', err);
  }

  // Guaranteed PureQRCode Offline Fallback
  if (typeof PureQRCode !== 'undefined') {
    const qr = PureQRCode(0, customization.ecc || 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(8, parseInt(customization.margin) || 4);
  }

  throw new Error('QR Code generator engine failed to load');
}

// Initialize App
// Safe Initialization Engine (runs even if DOMContentLoaded already fired)
async function initApp() {
  await checkServerMode();
  setupTabs();
  loadQrCodes();
  
  // Setup forms
  if (qrCreateForm) qrCreateForm.addEventListener('submit', handleCreateQr);
  if (editQrForm) editQrForm.addEventListener('submit', handleUpdateQr);
  
  // Modal closers
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => editUrlModal.classList.remove('active'));
  window.addEventListener('click', (e) => {
    if (e.target === editUrlModal) editUrlModal.classList.remove('active');
  });

  // Selector changes
  if (analyticsQrSelect) {
    analyticsQrSelect.addEventListener('change', (e) => {
      selectedAnalyticsQrId = e.target.value;
      loadAnalyticsForQr(selectedAnalyticsQrId);
    });
  }
  
  if (refreshAnalyticsBtn) {
    refreshAnalyticsBtn.addEventListener('click', () => {
      if (selectedAnalyticsQrId) loadAnalyticsForQr(selectedAnalyticsQrId);
    });
  }

  // Simulator Triggers
  if (simTriggerBtn) simTriggerBtn.addEventListener('click', triggerSimulatedScan);
  if (simRedirectBtn) simRedirectBtn.addEventListener('click', openSimulatedRedirect);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Toast notification helper
function showToast(message, type = 'success') {
  toastNotification.textContent = message;
  toastNotification.style.borderLeftColor = type === 'error' ? 'var(--danger)' : 'var(--primary)';
  toastNotification.classList.add('active');
  setTimeout(() => {
    toastNotification.classList.remove('active');
  }, 3000);
}

// Tab Switching
function setupTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      // Refresh data on view change
      if (targetTab === 'dashboard-view') {
        loadQrCodes();
      } else if (targetTab === 'analytics-view') {
        if (qrcodesList.length > 0) {
          populateDropdowns();
          if (!selectedAnalyticsQrId) {
            selectedAnalyticsQrId = qrcodesList[0].id;
          }
          analyticsQrSelect.value = selectedAnalyticsQrId;
          loadAnalyticsForQr(selectedAnalyticsQrId);
        } else {
          showAnalyticsEmptyState(true);
        }
      } else if (targetTab === 'simulator-view') {
        populateDropdowns();
      }
    });
  });
}

// Fetch and render QR Codes list
async function loadQrCodes() {
  try {
    if (isServerMode) {
      const res = await fetch(`${API_BASE}/qrcodes`);
      if (!res.ok) throw new Error('Failed to load QR codes from server');
      qrcodesList = await res.json();
    } else {
      const db = getLocalDb();
      // Count scans per QR
      const scanCounts = {};
      db.scans.forEach(scan => {
        scanCounts[scan.qrcodeId] = (scanCounts[scan.qrcodeId] || 0) + 1;
      });
      qrcodesList = db.qrcodes.map(qr => ({
        ...qr,
        scanCount: scanCounts[qr.id] || 0
      }));
    }
    
    renderQrList();
    updateKpis();
    populateDropdowns();
  } catch (err) {
    console.error(err);
    showToast('Failed to fetch QR code list', 'error');
  }
}

// Render QR Code elements in grid
function renderQrList() {
  qrListContainer.innerHTML = '';
  
  if (qrcodesList.length === 0) {
    dashboardEmptyState.style.display = 'flex';
    return;
  }
  
  dashboardEmptyState.style.display = 'none';
  
  qrcodesList.forEach(qr => {
    const card = document.createElement('div');
    card.className = 'qr-item-card';
    
    const formattedDate = new Date(qr.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const redirectUrl = getRedirectLink(qr.id);

    card.innerHTML = `
      <div class="qr-item-header">
        <div>
          <div class="qr-item-title" title="${escapeHtml(qr.title)}">${escapeHtml(qr.title)}</div>
          <div class="qr-item-date">Created on ${formattedDate}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${qr.id}', '${escapeHtml(qr.title)}', '${escapeHtml(qr.destinationUrl)}')" style="width: auto; padding: 4px 8px;">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
      </div>
      
      <div class="qr-item-body">
        <div class="qr-image-wrapper" title="Click to view full image" onclick="viewQrImage('${qr.qrDataUrl}', '${escapeHtml(qr.title)}')">
          <img src="${qr.qrDataUrl}" alt="${escapeHtml(qr.title)}">
        </div>
        <div class="qr-stats-brief">
          <div class="stat-item">
            <span>Total Scans</span>
            <span>${qr.scanCount}</span>
          </div>
          <div class="stat-item" style="margin-top: 5px;">
            <button class="btn btn-secondary btn-sm" style="padding: 4px 6px;" onclick="goToAnalytics('${qr.id}')">
              <i class="fa-solid fa-chart-line"></i> Report
            </button>
            <a class="btn btn-primary btn-sm" style="padding: 4px 6px; text-decoration: none;" href="${qr.qrDataUrl}" download="${qr.title.replace(/\s+/g, '_')}_qr.png">
              <i class="fa-solid fa-download"></i> Save
            </a>
          </div>
        </div>
      </div>

      <div class="qr-item-links">
        <div class="link-row">
          <strong>Redirect URL:</strong>
          <span title="${redirectUrl}">${redirectUrl}</span>
          <button class="btn btn-secondary btn-sm" style="width: auto; padding: 2px 6px;" onclick="copyToClipboard('${redirectUrl}')" title="Copy Redirect Link">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
        <div class="link-row">
          <strong>Target Destination:</strong>
          <span title="${escapeHtml(qr.destinationUrl)}">${escapeHtml(qr.destinationUrl)}</span>
        </div>
      </div>
      
      <div style="margin-top: 10px; display: flex; gap: 8px;">
        <button class="btn btn-secondary btn-sm" onclick="goToSimulator('${qr.id}')" style="flex: 1;">
          <i class="fa-solid fa-laptop-code"></i> Test Scan
        </button>
        <button class="btn btn-secondary btn-sm" onclick="handleDeleteQr('${qr.id}')" style="width: auto; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    
    qrListContainer.appendChild(card);
  });
}

// Update High-Level KPIs
function updateKpis() {
  kpiTotalQrs.textContent = qrcodesList.length;
  
  const totalScans = qrcodesList.reduce((acc, curr) => acc + (curr.scanCount || 0), 0);
  kpiTotalScans.textContent = totalScans;

  let topQr = 'None';
  let maxScans = -1;
  qrcodesList.forEach(qr => {
    if (qr.scanCount > maxScans && qr.scanCount > 0) {
      maxScans = qr.scanCount;
      topQr = qr.title;
    }
  });

  kpiActiveQr.textContent = topQr;
}

// Populate dropdown selectors in Analytics & Simulator tabs
function populateDropdowns() {
  // Save current values if they exist
  const currentAnalyticsVal = analyticsQrSelect.value;
  const currentSimVal = simQrSelect.value;

  analyticsQrSelect.innerHTML = '';
  simQrSelect.innerHTML = '';

  if (qrcodesList.length === 0) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'No QR codes available';
    analyticsQrSelect.appendChild(emptyOpt.cloneNode(true));
    simQrSelect.appendChild(emptyOpt);
    return;
  }

  qrcodesList.forEach(qr => {
    const opt = document.createElement('option');
    opt.value = qr.id;
    opt.textContent = `${qr.title} (${qr.scanCount} scans)`;
    
    analyticsQrSelect.appendChild(opt.cloneNode(true));
    simQrSelect.appendChild(opt);
  });

  // Restore values if possible
  if (currentAnalyticsVal && qrcodesList.some(q => q.id === currentAnalyticsVal)) {
    analyticsQrSelect.value = currentAnalyticsVal;
  }
  if (currentSimVal && qrcodesList.some(q => q.id === currentSimVal)) {
    simQrSelect.value = currentSimVal;
  }
}

// Create QR Code Form Handler
async function handleCreateQr(e) {
  e.preventDefault();
  
  const title = qrTitleInput.value.trim();
  let destinationUrl = qrUrlInput.value.trim();
  
  if (destinationUrl && !/^https?:\/\//i.test(destinationUrl)) {
    destinationUrl = 'https://' + destinationUrl;
  }

  try {
    new URL(destinationUrl);
  } catch (err) {
    showToast('Invalid target URL format', 'error');
    return;
  }

  // Read logo upload if exists
  let logoDataUrl = "";
  if (qrLogoInput.files && qrLogoInput.files[0]) {
    const file = qrLogoInput.files[0];
    logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  const customization = {
    colorDark: qrColorDarkInput.value,
    colorLight: qrColorLightInput.value,
    margin: qrMarginInput.value,
    ecc: qrEccInput.value,
    dotsType: qrDotsTypeSelect.value,
    cornersType: qrCornersTypeSelect.value,
    logo: logoDataUrl
  };

  try {
    let qrDataUrl = '';
    
    if (isServerMode) {
      const id = Math.random().toString(36).substring(2, 10); // temporary ID for generation
      const redirectUrl = getRedirectLink(id);
      
      // Generate styled QR locally
      const generatedQrUrl = await generateQrClientSide(redirectUrl, customization);
      
      const res = await fetch(`${API_BASE}/qrcodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id,
          title, 
          destinationUrl, 
          customization,
          qrDataUrl: generatedQrUrl // pass client-rendered premium QR to server
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create QR Code on server');
      qrDataUrl = data.qrDataUrl;
    } else {
      // Local Serverless Generation
      const id = Math.random().toString(36).substring(2, 10);
      const redirectUrl = getRedirectLink(id);
      
      qrDataUrl = await generateQrClientSide(redirectUrl, customization);
      
      const db = getLocalDb();
      const newQr = {
        id,
        title,
        destinationUrl,
        customization,
        qrDataUrl,
        createdAt: new Date().toISOString()
      };
      
      db.qrcodes.push(newQr);
      saveLocalDb(db);
    }

    // Show Preview
    qrLivePreviewImg.src = qrDataUrl;
    qrLivePreviewBox.style.display = 'flex';
    
    showToast('Premium Dynamic QR Code created successfully!');
    qrCreateForm.reset();
    
    // Refresh List
    loadQrCodes();
  } catch (err) {
    console.error(err);
    showToast(err.message || err, 'error');
  }
}

// Open Edit Target URL Modal
function openEditModal(id, title, url) {
  editQrIdInput.value = id;
  editQrTitleInput.value = title;
  editQrUrlInput.value = url;
  editUrlModal.classList.add('active');
}

// Update QR Code target URL form handler
async function handleUpdateQr(e) {
  e.preventDefault();
  
  const id = editQrIdInput.value;
  const title = editQrTitleInput.value.trim();
  let destinationUrl = editQrUrlInput.value.trim();

  if (destinationUrl && !/^https?:\/\//i.test(destinationUrl)) {
    destinationUrl = 'https://' + destinationUrl;
  }

  try {
    new URL(destinationUrl);
  } catch (err) {
    showToast('Invalid target URL format', 'error');
    return;
  }

  try {
    if (isServerMode) {
      const res = await fetch(`${API_BASE}/qrcodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, destinationUrl })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update QR Code');
    } else {
      const db = getLocalDb();
      const index = db.qrcodes.findIndex(q => q.id === id);
      if (index === -1) throw new Error('QR Code not found locally');
      
      db.qrcodes[index].title = title;
      db.qrcodes[index].destinationUrl = destinationUrl;
      
      saveLocalDb(db);
    }

    showToast('Redirect target link updated successfully!');
    editUrlModal.classList.remove('active');
    
    // Refresh List
    loadQrCodes();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Delete QR Code Handler
async function handleDeleteQr(id) {
  const confirmDelete = confirm('Are you sure you want to delete this QR Code? All associated scan analytics will be deleted permanently.');
  if (!confirmDelete) return;

  try {
    if (isServerMode) {
      const res = await fetch(`${API_BASE}/qrcodes/${id}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete QR Code');
    } else {
      const db = getLocalDb();
      db.qrcodes = db.qrcodes.filter(q => q.id !== id);
      db.scans = db.scans.filter(s => s.qrcodeId !== id);
      saveLocalDb(db);
    }

    showToast('QR Code deleted successfully');
    
    // If deleted QR is the active analytics one, clear selection
    if (selectedAnalyticsQrId === id) {
      selectedAnalyticsQrId = null;
    }
    
    loadQrCodes();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Navigate to specific views programmatically
function goToAnalytics(id) {
  selectedAnalyticsQrId = id;
  const tabBtn = document.querySelector('.tab-btn[data-tab="analytics-view"]');
  if (tabBtn) tabBtn.click();
}

function goToSimulator(id) {
  const tabBtn = document.querySelector('.tab-btn[data-tab="simulator-view"]');
  if (tabBtn) {
    tabBtn.click();
    simQrSelect.value = id;
  }
}

// Fetch scan analytics and render charts
async function loadAnalyticsForQr(id) {
  if (!id) {
    showAnalyticsEmptyState(true);
    return;
  }

  try {
    let qrcode = null;
    let scans = [];

    if (isServerMode) {
      const res = await fetch(`${API_BASE}/qrcodes/${id}`);
      if (!res.ok) throw new Error('Failed to load analytics details');
      const data = await res.json();
      qrcode = data.qrcode;
      scans = data.scans;
    } else {
      const db = getLocalDb();
      qrcode = db.qrcodes.find(q => q.id === id);
      if (!qrcode) throw new Error('QR Code not found');
      scans = db.scans.filter(s => s.qrcodeId === id);
    }
    
    if (!scans || scans.length === 0) {
      showAnalyticsEmptyState(true);
      return;
    }

    showAnalyticsEmptyState(false);
    
    // Render charts
    renderTimelineChart(scans);
    renderPieChart(scans);
    renderBarChart(scans, 'browser', 'browsers-bar-chart', 'Top Browsers', browsersChart, (c) => browsersChart = c);
    renderBarChart(scans, 'os', 'os-bar-chart', 'Top Operating Systems', osChart, (c) => osChart = c);
    
    // Populate Logs table
    renderScanLogs(scans);
  } catch (err) {
    console.error(err);
    showToast('Error loading analytics', 'error');
  }
}

function showAnalyticsEmptyState(show) {
  if (show) {
    analyticsEmptyState.style.display = 'flex';
    analyticsDashboardContent.style.display = 'none';
  } else {
    analyticsEmptyState.style.display = 'none';
    analyticsDashboardContent.style.display = 'block';
  }
}

// RENDER CHARTS FUNCTIONS

// Timeline scan history line chart
function renderTimelineChart(scans) {
  const ctx = document.getElementById('scans-timeline-chart').getContext('2d');
  
  // Group scans by time blocks
  const groupedData = {};
  scans.forEach(scan => {
    const d = new Date(scan.timestamp);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + 
                String(d.getHours()).padStart(2, '0') + ':' + 
                String(Math.floor(d.getMinutes()/5)*5).padStart(2, '0');
    groupedData[key] = (groupedData[key] || 0) + 1;
  });

  const labels = Object.keys(groupedData).sort((a,b) => new Date(a) - new Date(b));
  const data = labels.map(label => groupedData[label]);

  if (timelineChart) timelineChart.destroy();
  
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Scans',
        data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#ec4899',
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
        y: { 
          grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
          ticks: { color: '#94a3b8', stepSize: 1 },
          beginAtZero: true
        }
      }
    }
  });
}

// Devices Pie Chart
function renderPieChart(scans) {
  const ctx = document.getElementById('devices-pie-chart').getContext('2d');
  
  const counts = { Mobile: 0, Tablet: 0, Desktop: 0 };
  scans.forEach(s => {
    if (counts[s.device] !== undefined) counts[s.device]++;
  });

  if (devicesChart) devicesChart.destroy();
  
  devicesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Mobile', 'Tablet', 'Desktop'],
      datasets: [{
        data: [counts.Mobile, counts.Tablet, counts.Desktop],
        backgroundColor: ['#10b981', '#3b82f6', '#6366f1'],
        borderWidth: 2,
        borderColor: '#151d30'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f1f5f9', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// Bar Chart renderer
function renderBarChart(scans, property, canvasId, labelText, chartInstance, saveInstanceCallback) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  const counts = {};
  scans.forEach(s => {
    const val = s[property] || 'Unknown';
    counts[val] = (counts[val] || 0) + 1;
  });

  const sortedKeys = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 5);
  const data = sortedKeys.map(k => counts[k]);

  if (chartInstance) chartInstance.destroy();
  
  const newInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedKeys,
      datasets: [{
        label: 'Scans',
        data,
        backgroundColor: 'rgba(236, 72, 153, 0.75)',
        hoverBackgroundColor: '#ec4899',
        borderWidth: 0,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { 
          grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
          ticks: { color: '#94a3b8', stepSize: 1 },
          beginAtZero: true
        }
      }
    }
  });

  saveInstanceCallback(newInstance);
}

// Render scan logs table
function renderScanLogs(scans) {
  scanLogsTbody.innerHTML = '';
  const sortedScans = [...scans].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  sortedScans.forEach(scan => {
    const row = document.createElement('tr');
    const formattedTime = new Date(scan.timestamp).toLocaleString();
    const deviceBadgeClass = `device-badge badge-${scan.device.toLowerCase()}`;

    row.innerHTML = `
      <td>${formattedTime}</td>
      <td><code style="color: var(--text-muted); font-size: 0.8rem;">${scan.ip}</code></td>
      <td><span class="${deviceBadgeClass}">${scan.device}</span></td>
      <td><i class="${getOsIcon(scan.os)}"></i> ${scan.os}</td>
      <td><i class="${getBrowserIcon(scan.browser)}"></i> ${scan.browser}</td>
    `;
    scanLogsTbody.appendChild(row);
  });
}

function getOsIcon(os) {
  os = os.toLowerCase();
  if (os.includes('ios') || os.includes('iphone')) return 'fa-brands fa-apple';
  if (os.includes('mac')) return 'fa-brands fa-apple';
  if (os.includes('android')) return 'fa-brands fa-android';
  if (os.includes('win')) return 'fa-brands fa-windows';
  if (os.includes('linux')) return 'fa-brands fa-linux';
  return 'fa-solid fa-laptop';
}

function getBrowserIcon(browser) {
  browser = browser.toLowerCase();
  if (browser.includes('safari')) return 'fa-brands fa-safari';
  if (browser.includes('chrome')) return 'fa-brands fa-chrome';
  if (browser.includes('firefox')) return 'fa-brands fa-firefox';
  if (browser.includes('edge')) return 'fa-brands fa-edge';
  if (browser.includes('opera')) return 'fa-brands fa-opera';
  return 'fa-solid fa-globe';
}

// SIMULATOR ACTIONS

// Trigger simulated scan
async function triggerSimulatedScan() {
  const qrcodeId = simQrSelect.value;
  if (!qrcodeId) {
    showToast('Please create and select a QR code to scan', 'error');
    return;
  }

  const device = simDeviceSelect.value;
  const os = simOsSelect.value;
  const browser = simBrowserSelect.value;

  simStateWaiting.style.display = 'none';
  simStateScanning.style.display = 'flex';
  simTriggerBtn.disabled = true;

  try {
    let destUrl = '';
    if (isServerMode) {
      const res = await fetch(`${API_BASE}/simulate-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrcodeId, device, os, browser })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');
      destUrl = data.destinationUrl;
    } else {
      const db = getLocalDb();
      const qrcode = db.qrcodes.find(q => q.id === qrcodeId);
      if (!qrcode) throw new Error('QR Code not found locally');
      
      destUrl = qrcode.destinationUrl;
      
      const newScan = {
        id: Math.random().toString(36).substring(2, 10),
        qrcodeId,
        timestamp: new Date().toISOString(),
        ip: '127.0.0.1 (Simulated)',
        device,
        browser,
        os
      };
      
      db.scans.push(newScan);
      saveLocalDb(db);
    }

    simRedirectMsg.innerHTML = `Scan registered! Target destination:<br><a href="${destUrl}" target="_blank" style="word-break: break-all; font-weight:600;">${escapeHtml(destUrl)}</a>`;
    showToast('Scan registered in database!');
    
    // Refresh background lists and analytics
    loadQrCodes();
    if (selectedAnalyticsQrId === qrcodeId) {
      loadAnalyticsForQr(qrcodeId);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
    simRedirectMsg.textContent = 'Scanning error occurred.';
  } finally {
    setTimeout(() => {
      simStateScanning.style.display = 'none';
      simStateWaiting.style.display = 'flex';
      simTriggerBtn.disabled = false;
    }, 4000);
  }
}

// Open redirect URL in new window tab
function openSimulatedRedirect() {
  const qrcodeId = simQrSelect.value;
  if (!qrcodeId) {
    showToast('Please select a QR code to redirect', 'error');
    return;
  }
  const redirectUrl = getRedirectLink(qrcodeId);
  window.open(redirectUrl, '_blank');
}

// Copy to Clipboard Utility
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied to clipboard!');
  }).catch(err => {
    console.error('Could not copy text: ', err);
    showToast('Could not copy text', 'error');
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function viewQrImage(dataUrl, title) {
  const w = window.open();
  w.document.write(`
    <html>
      <head>
        <title>QR Code - ${escapeHtml(title)}</title>
        <style>
          body { display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #0b0f19; margin: 0; }
          img { max-width: 90%; height: auto; border: 16px solid white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        </style>
      </head>
      <body>
        <img src="${dataUrl}">
      </body>
    </html>
  `);
}
