/**
 * Holy Star POS v2.2 - Unified Multi-Store SaaS Application Logic (app.js)
 * Features:
 * - Clean Unified Store Login & Create New Store (0 Products, 0 Debtors, 0 Sales on New Store)
 * - Strict Store Data Isolation by `store_id`
 * - Smart Ghanaian Master Product Catalog Autocomplete + Custom Camera Photos
 * - Live Camera Barcode & QR Scanner (Checkout & Stock Entry)
 * - Hardened Atomic Checkout, Debtors Credit Book, Close-Day Seal & Cloud/Local Sync Heartbeat
 */

const HOLY_STAR_SECRET = 'HOLY_STAR_SECRET_2026';
const ALPHANUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============================================================================
// PURE-JS FIPS 180-4 SHA-256 & DETERMINISTIC TOKEN ENGINE
// ============================================================================

function sha256Bytes(asciiStr) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const utf8 = unescape(encodeURIComponent(asciiStr));
  const words = [];
  const asciiBitLength = utf8.length * 8;

  let h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = asciiBitLength;

  const w = new Array(64);
  for (let j = 0; j < words.length; j += 16) {
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];

    for (let i = 0; i < 64; i++) {
      if (i < 16) {
        w[i] = words[j + i] | 0;
      } else {
        const gamma0x = w[i - 15];
        const gamma0 = rightRotate(gamma0x, 7) ^ rightRotate(gamma0x, 18) ^ (gamma0x >>> 3);
        const gamma1x = w[i - 2];
        const gamma1 = rightRotate(gamma1x, 17) ^ rightRotate(gamma1x, 19) ^ (gamma1x >>> 10);
        w[i] = (w[i - 16] + gamma0 + w[i - 7] + gamma1) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);

      const t1 = (hh + sigma1 + ch + k[i] + w[i]) | 0;
      const t2 = (sigma0 + maj) | 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  const bytes = [];
  for (let i = 0; i < 8; i++) {
    bytes.push((h[i] >>> 24) & 0xff);
    bytes.push((h[i] >>> 16) & 0xff);
    bytes.push((h[i] >>> 8) & 0xff);
    bytes.push(h[i] & 0xff);
  }
  return bytes;
}

function generateDeterministicToken(shopId, planDays, issueCode) {
  const cleanShop = String(shopId || '').trim().toUpperCase();
  const cleanDays = String(Number(planDays) || 30).trim();
  const cleanIssue = String(issueCode || '').trim().toUpperCase();
  const payload = `${cleanShop}|${cleanDays}|${cleanIssue}|${HOLY_STAR_SECRET}`;
  const digest = sha256Bytes(payload);

  let token = '';
  for (let i = 0; i < 8; i++) {
    const idx = ((digest[i * 2] << 8) | digest[i * 2 + 1]) % ALPHANUM_CHARS.length;
    token += ALPHANUM_CHARS[idx];
  }
  return token;
}

function generateDailyAuditSeal(shopId, dateStr, totalRevenue, grossProfit, cashCollected, momoRecorded, newCreditGiven) {
  const payload = [
    String(shopId || '').trim().toUpperCase(),
    String(dateStr || '').trim(),
    Number(totalRevenue || 0).toFixed(2),
    Number(grossProfit || 0).toFixed(2),
    Number(cashCollected || 0).toFixed(2),
    Number(momoRecorded || 0).toFixed(2),
    Number(newCreditGiven || 0).toFixed(2),
    HOLY_STAR_SECRET
  ].join('|');

  const digest = sha256Bytes(payload);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = ((digest[i * 2] << 8) | digest[i * 2 + 1]) % ALPHANUM_CHARS.length;
    code += ALPHANUM_CHARS[idx];
  }
  return `HS-SEAL-${code}`;
}

window.HolyStarCrypto = {
  generateDeterministicToken,
  generateDailyAuditSeal
};

// ============================================================================
// APPLICATION STATE
// ============================================================================

const AppState = {
  session: null,
  store: null,
  settings: null,
  products: [],
  debtors: [],
  cart: [],
  selectedPosCategory: 'All',
  posSearchQuery: '',
  inventorySearchQuery: '',
  debtorFilter: 'ALL',
  debtorSearchQuery: '',
  activeSaleReceipt: null,
  selectedReportDate: '',
  dailyReport: null,
  licenseStatus: {
    active: true,
    expired: false,
    tampered: false,
    daysLeft: 7,
    hoursLeft: 168
  },
  currentProductThumbnail: '',
  barcodeScanner: {
    active: false,
    targetMode: 'POS', // 'POS' or 'STOCK_INPUT'
    stream: null,
    scanInterval: null
  }
};

// ============================================================================
// HELPERS & FORMATTING
// ============================================================================

function formatGHS(amount) {
  const num = Number(amount || 0);
  return 'GHS ' + num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatShortTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

function cleanPhoneForWhatsApp(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '233' + digits.substring(1);
  } else if (digits.length === 9) {
    digits = '233' + digits;
  }
  return digits;
}

function compressImageToDataUrl(file, maxSize = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// INITIALIZATION & BOOTSTRAP
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.HolyStarDB.init();
    AppState.selectedReportDate = window.HolyStarDB.formatLocalDate();

    const dateInput = document.getElementById('report-date-picker');
    if (dateInput) {
      dateInput.value = AppState.selectedReportDate;
    }

    bindUIEvents();
    await checkAuthAndBoot();

    // Auto-sync heartbeat when device comes back online
    window.addEventListener('online', () => {
      const storeId = window.HolyStarDB.getActiveStoreId();
      if (storeId) {
        window.HolyStarDB.syncTelemetryHeartbeat(storeId, 'network_reconnected');
      }
    });

    // Periodic clock & license check every 30 seconds
    setInterval(async () => {
      if (AppState.store) {
        await verifyClockAndLicenseState();
      }
    }, 30000);
  } catch (err) {
    console.error('Initialization failed:', err);
    showToast('Failed to initialize local database: ' + err.message, 'error');
  }
});

async function checkAuthAndBoot() {
  const session = window.HolyStarDB.getActiveSession();
  const activeStore = session && session.store_id
    ? await window.HolyStarDB.getStoreById(session.store_id)
    : null;

  if (!session || !activeStore) {
    window.HolyStarDB.clearActiveSession();
    await showAuthOverlay();
    return;
  }

  AppState.session = session;
  AppState.store = activeStore;
  AppState.settings = activeStore;
  hideAuthOverlay();
  await refreshAllData();
  window.HolyStarDB.syncTelemetryHeartbeat(activeStore.store_id, 'session_resume');
}

async function showAuthOverlay() {
  const overlay = document.getElementById('auth-screen-overlay');
  if (overlay) overlay.classList.remove('hidden');

  const stores = await window.HolyStarDB.getAllStores();
  const selectWrap = document.getElementById('login-saved-stores-wrap');
  const selectEl = document.getElementById('login-saved-store-select');
  const loginIdInput = document.getElementById('login-identifier');

  if (stores.length > 0 && selectWrap && selectEl) {
    selectWrap.classList.remove('hidden');
    selectEl.innerHTML = `<option value="">-- Choose a registered store (${stores.length}) --</option>` +
      stores.map((s) => `<option value="${escapeHtml(s.owner_phone || s.store_id)}">${escapeHtml(s.store_name)} (${escapeHtml(s.store_id)} • ${escapeHtml(s.owner_phone)})</option>`).join('');
    if (stores.length === 1 && loginIdInput && !loginIdInput.value) {
      loginIdInput.value = stores[0].owner_phone || stores[0].store_id;
      selectEl.value = stores[0].owner_phone || stores[0].store_id;
    }
  } else if (selectWrap) {
    selectWrap.classList.add('hidden');
    // Default to Create New Store tab if zero stores exist on device
    switchAuthTab('register');
  }
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-screen-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.authTab === tab);
  });
  const loginPanel = document.getElementById('auth-panel-login');
  const regPanel = document.getElementById('auth-panel-register');
  if (loginPanel) loginPanel.classList.toggle('hidden', tab !== 'login');
  if (regPanel) regPanel.classList.toggle('hidden', tab !== 'register');
}

async function refreshAllData() {
  const store = await window.HolyStarDB.getActiveStore();
  if (!store) {
    await showAuthOverlay();
    return;
  }

  AppState.store = store;
  AppState.settings = store;

  const storeId = store.store_id;
  const [products, debtors, dailyReport] = await Promise.all([
    window.HolyStarDB.getAllProducts(storeId),
    window.HolyStarDB.getAllDebtors(storeId),
    window.HolyStarDB.getDailyReport(AppState.selectedReportDate || window.HolyStarDB.formatLocalDate())
  ]);

  AppState.products = products;
  AppState.debtors = debtors;
  AppState.dailyReport = dailyReport;

  await verifyClockAndLicenseState();
  renderHeaderInfo();
  renderPosCategories();
  renderPosProductGrid();
  renderCart();
  renderInventoryView();
  renderDebtorsView();
  renderReportsView();
  await renderSettingsView();
}

// ============================================================================
// ANTI-TAMPER CLOCK GUARD & LICENSE LOCK ENGINE
// ============================================================================

async function verifyClockAndLicenseState() {
  const clockResult = await window.HolyStarDB.TouchClock();
  const store = await window.HolyStarDB.getActiveStore();
  if (!store) return;

  AppState.store = store;
  AppState.settings = store;

  const now = Date.now();
  const expiry = Number(store.license_expiry || 0);
  const msRemaining = expiry - now;
  const isExpired = msRemaining <= 0;
  const isTampered = !clockResult.valid || Boolean(store.clock_tampered);

  const daysLeft = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const hoursLeft = Math.max(0, Math.ceil(msRemaining / (60 * 60 * 1000)));

  AppState.licenseStatus = {
    active: !isExpired && !isTampered,
    expired: isExpired,
    tampered: isTampered,
    daysLeft,
    hoursLeft,
    message: !clockResult.valid ? clockResult.message : ''
  };

  renderLicenseBannerAndPill();
}

function renderLicenseBannerAndPill() {
  const pill = document.getElementById('license-status-pill');
  const pillText = document.getElementById('license-pill-text');
  const banner = document.getElementById('lock-banner');
  const bannerTitle = document.getElementById('lock-banner-title');
  const bannerDesc = document.getElementById('lock-banner-desc');
  const checkoutBtn = document.getElementById('btn-complete-sale');

  if (!pill || !pillText || !banner) return;

  const { active, expired, tampered, daysLeft } = AppState.licenseStatus;

  pill.classList.remove('license-active', 'license-warning', 'license-locked');

  if (tampered) {
    pill.classList.add('license-locked');
    pillText.textContent = '🔒 Clock Tamper Locked';
    banner.classList.remove('hidden');
    bannerTitle.textContent = '🔒 System Clock Tampering Detected — POS Checkout Locked';
    bannerDesc.textContent = AppState.licenseStatus.message || 'Your device date/time was rolled backward. Correct your phone/PC clock or activate a valid renewal token.';
  } else if (expired) {
    pill.classList.add('license-locked');
    pillText.textContent = '🔒 Subscription Expired';
    banner.classList.remove('hidden');
    bannerTitle.textContent = '🔒 Subscription Expired — Read-Only Mode Active';
    bannerDesc.textContent = `You can still view Inventory, Debtors, and Reports, but new POS sales are locked. Enter an 8-character renewal token for Store ID ${AppState.store?.store_id || ''} in Settings.`;
  } else if (daysLeft <= 2) {
    pill.classList.add('license-warning');
    pillText.textContent = `⚠️ ${daysLeft} Day${daysLeft === 1 ? '' : 's'} Left`;
    banner.classList.add('hidden');
  } else {
    pill.classList.add('license-active');
    pillText.textContent = `✔ Active (${daysLeft}d left)`;
    banner.classList.add('hidden');
  }

  if (checkoutBtn) {
    if (!active) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = tampered ? '🔒 Locked (Fix Device Clock)' : '🔒 Locked (Renew License)';
    } else {
      checkoutBtn.disabled = AppState.cart.length === 0;
      checkoutBtn.textContent = '✅ Complete Sale & Generate Receipt';
    }
  }
}

function renderHeaderInfo() {
  const s = AppState.store || {};
  const nameEl = document.getElementById('header-shop-name');
  const idEl = document.getElementById('header-shop-id');
  const catEl = document.getElementById('header-shop-category');
  const locEl = document.getElementById('header-shop-location');

  if (nameEl) nameEl.textContent = s.store_name || s.shop_name || 'Holy Star POS';
  if (idEl) idEl.textContent = s.store_id || s.shop_id || 'HS-0000';
  if (catEl) catEl.textContent = s.store_category || 'Retail';
  if (locEl) locEl.textContent = s.location || 'Ghana';
}

// ============================================================================
// SMART MASTER PRODUCT CATALOG AUTOCOMPLETE (catalog.js)
// ============================================================================

function searchMasterCatalog(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !Array.isArray(window.MASTER_CATALOG)) return [];

  const scored = [];
  for (const item of window.MASTER_CATALOG) {
    const nameLower = String(item.name || '').toLowerCase();
    const catLower = String(item.category || '').toLowerCase();
    const kwLower = String(item.keywords || '').toLowerCase();
    const barcodeStr = String(item.barcode || '');

    let score = 0;
    if (nameLower.startsWith(q)) score = 100;
    else if (nameLower.includes(q)) score = 80;
    else if (kwLower.includes(q)) score = 65;
    else if (catLower.includes(q)) score = 40;
    else if (barcodeStr && barcodeStr.includes(q)) score = 90;

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.item);
}

function renderCatalogSuggestions(query) {
  const dropdown = document.getElementById('catalog-autocomplete-list');
  if (!dropdown) return;

  const matches = searchMasterCatalog(query);
  if (matches.length === 0) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  dropdown.classList.remove('hidden');
  dropdown.innerHTML = matches.map((m, idx) => {
    const thumb = window.getCatalogProductThumb ? window.getCatalogProductThumb(m) : '';
    return `
      <div class="autocomplete-item" data-catalog-idx="${idx}" data-catalog-name="${escapeHtml(m.name)}">
        <img src="${thumb}" alt="" />
        <div style="flex:1; min-width:0;">
          <div class="autocomplete-item-title">${escapeHtml(m.name)}</div>
          <div class="autocomplete-item-meta">${escapeHtml(m.category)} ${m.barcode ? '• Barcode: ' + escapeHtml(m.barcode) : ''}</div>
        </div>
        <span class="badge badge-info" style="font-size:0.68rem;">Tap to Fill</span>
      </div>
    `;
  }).join('');

  dropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
    el.addEventListener('click', () => {
      const targetName = el.dataset.catalogName;
      const item = (window.MASTER_CATALOG || []).find((x) => x.name === targetName);
      if (item) {
        applyCatalogItemToForm(item);
      }
      dropdown.classList.add('hidden');
    });
  });
}

function applyCatalogItemToForm(item) {
  const nameInput = document.getElementById('product-name-input');
  const catInput = document.getElementById('product-category-input');
  const barcodeInput = document.getElementById('product-barcode-input');
  const thumbPreview = document.getElementById('product-thumb-preview');

  if (nameInput) nameInput.value = item.name;
  if (catInput) catInput.value = item.category;
  if (barcodeInput && !barcodeInput.value && item.barcode) {
    barcodeInput.value = item.barcode;
  }

  const thumb = window.getCatalogProductThumb ? window.getCatalogProductThumb(item) : '';
  AppState.currentProductThumbnail = thumb;
  if (thumbPreview && thumb) {
    thumbPreview.src = thumb;
  }

  const costInput = document.getElementById('product-cost-input');
  if (costInput) costInput.focus();
}

// ============================================================================
// CAMERA BARCODE & QR SCANNER (BarcodeDetector + Fallback)
// ============================================================================

async function openBarcodeScanner(targetMode = 'POS') {
  AppState.barcodeScanner.targetMode = targetMode;
  const modal = document.getElementById('modal-barcode-scanner');
  const video = document.getElementById('scanner-video-el');
  const statusEl = document.getElementById('scanner-status-text');
  const manualInput = document.getElementById('scanner-manual-code-input');

  if (!modal || !video) return;
  modal.classList.remove('hidden');
  if (manualInput) {
    manualInput.value = '';
    setTimeout(() => manualInput.focus(), 150);
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl) {
      statusEl.textContent = 'Camera access requires HTTPS or localhost. Type barcode below or use a USB/Bluetooth scanner.';
    }
    return;
  }

  try {
    if (statusEl) statusEl.textContent = 'Starting rear camera...';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    AppState.barcodeScanner.stream = stream;
    AppState.barcodeScanner.active = true;
    video.srcObject = stream;
    await video.play();

    if ('BarcodeDetector' in window) {
      if (statusEl) statusEl.textContent = 'Point camera steadily at product barcode or QR code...';
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
      });

      AppState.barcodeScanner.scanInterval = setInterval(async () => {
        if (!AppState.barcodeScanner.active || video.readyState < 2) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            const rawCode = String(barcodes[0].rawValue).trim();
            if (rawCode) {
              handleDetectedBarcode(rawCode);
            }
          }
        } catch (scanErr) {
          // Ignore frame detection error
        }
      }, 280);
    } else {
      if (statusEl) {
        statusEl.textContent = 'Camera active! Align barcode or enter digits below if your browser lacks native BarcodeDetector.';
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Camera permission denied or unavailable. Enter barcode manually below.';
    }
  }
}

function stopBarcodeScanner() {
  AppState.barcodeScanner.active = false;
  if (AppState.barcodeScanner.scanInterval) {
    clearInterval(AppState.barcodeScanner.scanInterval);
    AppState.barcodeScanner.scanInterval = null;
  }
  if (AppState.barcodeScanner.stream) {
    AppState.barcodeScanner.stream.getTracks().forEach((t) => t.stop());
    AppState.barcodeScanner.stream = null;
  }
  const video = document.getElementById('scanner-video-el');
  if (video) {
    video.srcObject = null;
  }
  const modal = document.getElementById('modal-barcode-scanner');
  if (modal) modal.classList.add('hidden');
}

function handleDetectedBarcode(code) {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return;

  const mode = AppState.barcodeScanner.targetMode;
  stopBarcodeScanner();

  if (mode === 'STOCK_INPUT') {
    const barcodeInput = document.getElementById('product-barcode-input');
    if (barcodeInput) barcodeInput.value = cleanCode;

    if (Array.isArray(window.MASTER_CATALOG)) {
      const catMatch = window.MASTER_CATALOG.find((m) => String(m.barcode) === cleanCode);
      if (catMatch) {
        applyCatalogItemToForm(catMatch);
        showToast(`Matched "${catMatch.name}" from Master Catalog!`, 'success');
        return;
      }
    }
    showToast(`Barcode ${cleanCode} captured!`, 'success');
    return;
  }

  // POS Checkout Mode: Find product in store inventory by barcode
  const matchedProduct = AppState.products.find(
    (p) => String(p.barcode || '').trim().toLowerCase() === cleanCode.toLowerCase()
  );

  if (matchedProduct) {
    addToCart(matchedProduct.id);
    showToast(`Scanned & added: ${matchedProduct.name}`, 'success');
  } else {
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      searchInput.value = cleanCode;
      AppState.posSearchQuery = cleanCode;
      renderPosProductGrid();
    }
    showToast(`No item in stock with barcode "${cleanCode}". Add it in Stock & Profit tab!`, 'error');
  }
}

// ============================================================================
// TAB 1: POS CHECKOUT & CART LOGIC
// ============================================================================

function renderPosCategories() {
  const container = document.getElementById('pos-category-pills');
  if (!container) return;

  const categories = ['All', ...new Set(AppState.products.map((p) => p.category || 'General'))];
  container.innerHTML = categories
    .map((cat) => {
      const isActive = AppState.selectedPosCategory === cat ? 'active' : '';
      return `<button type="button" class="cat-pill ${isActive}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    })
    .join('');

  container.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      AppState.selectedPosCategory = btn.dataset.cat;
      renderPosCategories();
      renderPosProductGrid();
    });
  });
}

function getDisplayThumbForProduct(p) {
  if (p.thumbnail) return p.thumbnail;
  if (window.getCatalogProductThumb) {
    return window.getCatalogProductThumb({
      name: p.name,
      category: p.category,
      emoji: '📦',
      color: '#1e3a8a'
    });
  }
  return '';
}

function renderPosProductGrid() {
  const grid = document.getElementById('pos-product-grid');
  if (!grid) return;

  const query = AppState.posSearchQuery.trim().toLowerCase();
  const filtered = AppState.products.filter((p) => {
    const matchCategory = AppState.selectedPosCategory === 'All' || (p.category || 'General') === AppState.selectedPosCategory;
    const matchSearch =
      !query ||
      String(p.name || '').toLowerCase().includes(query) ||
      String(p.category || '').toLowerCase().includes(query) ||
      String(p.barcode || '').toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">📦</div>
        <p style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">
          ${AppState.products.length === 0 ? 'Your Store Inventory is Empty (0 Products)' : 'No matching products found'}
        </p>
        <p style="font-size:0.82rem; margin-bottom:0.75rem;">
          ${AppState.products.length === 0
            ? 'Go to the "Stock & Profit" tab to add your first item (with smart Ghanaian product autocomplete!).'
            : 'Try clearing your search filter or switching category.'}
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const stock = Number(p.stock_qty || 0);
      const alertLevel = Number(p.low_stock_alert || 5);
      const isOut = stock <= 0;
      const isLow = !isOut && stock <= alertLevel;

      let stockClass = 'stock-ok';
      let stockLabel = `${stock} in stock`;
      if (isOut) {
        stockClass = 'stock-empty';
        stockLabel = 'Out of Stock';
      } else if (isLow) {
        stockClass = 'stock-low';
        stockLabel = `Low: ${stock} left`;
      }

      const inCartItem = AppState.cart.find((c) => c.productId === p.id);
      const inCartBadge = inCartItem ? `<span class="badge badge-info" style="font-size:0.7rem;">In Cart: ${inCartItem.qty}</span>` : '';
      const thumbSrc = getDisplayThumbForProduct(p);

      return `
        <div class="product-tile ${isOut ? 'out-of-stock' : ''}" data-product-id="${escapeHtml(p.id)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.45rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
              ${thumbSrc ? `<img src="${thumbSrc}" class="product-tile-thumb" alt="" />` : ''}
              <div style="min-width:0;">
                <span class="product-tile-cat">${escapeHtml(p.category || 'General')}</span>
                <div class="product-tile-name" style="margin-top:0.15rem;">${escapeHtml(p.name)}</div>
              </div>
            </div>
            ${inCartBadge}
          </div>
          <div class="product-tile-footer">
            <span class="product-tile-price">${formatGHS(p.selling_price)}</span>
            <span class="product-tile-stock ${stockClass}">${stockLabel}</span>
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('.product-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const pid = tile.dataset.productId;
      addToCart(pid);
    });
  });
}

function addToCart(productId) {
  const product = AppState.products.find((p) => p.id === productId);
  if (!product) return;

  const available = Number(product.stock_qty || 0);
  if (available <= 0) {
    showToast(`"${product.name}" is out of stock! Please restock first.`, 'error');
    return;
  }

  const existing = AppState.cart.find((item) => item.productId === productId);
  if (existing) {
    if (existing.qty + 1 > available) {
      showToast(`Cannot exceed available stock (${available}) for "${product.name}".`, 'error');
      return;
    }
    existing.qty += 1;
  } else {
    AppState.cart.push({
      productId: product.id,
      name: product.name,
      cost_price: Number(product.cost_price || 0),
      selling_price: Number(product.selling_price || 0),
      max_stock: available,
      qty: 1
    });
  }

  renderCart();
  renderPosProductGrid();
}

function updateCartItemQty(productId, newQty) {
  const product = AppState.products.find((p) => p.id === productId);
  const maxStock = product ? Number(product.stock_qty || 0) : 0;

  const idx = AppState.cart.findIndex((c) => c.productId === productId);
  if (idx === -1) return;

  const parsed = Math.floor(Number(newQty));
  if (isNaN(parsed) || parsed <= 0) {
    AppState.cart.splice(idx, 1);
  } else if (parsed > maxStock) {
    AppState.cart[idx].qty = maxStock;
    showToast(`Maximum available stock for "${product.name}" is ${maxStock}.`, 'error');
  } else {
    AppState.cart[idx].qty = parsed;
  }

  renderCart();
  renderPosProductGrid();
}

function getCartTotals() {
  let totalAmount = 0;
  let totalProfit = 0;
  let totalItemsCount = 0;

  for (const item of AppState.cart) {
    const qty = Number(item.qty || 0);
    const sell = Number(item.selling_price || 0);
    const cost = Number(item.cost_price || 0);
    totalAmount += sell * qty;
    totalProfit += (sell - cost) * qty;
    totalItemsCount += qty;
  }

  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    totalItemsCount
  };
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const countBadge = document.getElementById('cart-count-badge');
  const subtotalEl = document.getElementById('cart-subtotal-text');
  const profitEl = document.getElementById('cart-profit-text');
  const totalEl = document.getElementById('cart-total-text');

  if (!container) return;

  const { totalAmount, totalProfit, totalItemsCount } = getCartTotals();

  if (countBadge) countBadge.textContent = `${totalItemsCount} item${totalItemsCount === 1 ? '' : 's'}`;
  if (subtotalEl) subtotalEl.textContent = formatGHS(totalAmount);
  if (profitEl) profitEl.textContent = formatGHS(totalProfit);
  if (totalEl) totalEl.textContent = formatGHS(totalAmount);

  if (AppState.cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:1.5rem 0.75rem;">
        <div class="empty-state-icon" style="font-size:1.65rem;">🛒</div>
        <p style="font-size:0.84rem;">Cart is empty. Tap any product or scan a barcode to add it.</p>
      </div>
    `;
  } else {
    container.innerHTML = AppState.cart
      .map((item) => {
        const lineSubtotal = Number((item.selling_price * item.qty).toFixed(2));
        return `
          <div class="cart-item-row" data-cart-id="${escapeHtml(item.productId)}">
            <div class="cart-item-info">
              <div class="cart-item-title">${escapeHtml(item.name)}</div>
              <div class="cart-item-meta">${formatGHS(item.selling_price)} each (Max: ${item.max_stock})</div>
            </div>
            <div class="cart-qty-controls">
              <button type="button" class="qty-btn btn-qty-dec" data-id="${escapeHtml(item.productId)}">−</button>
              <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.max_stock}" data-id="${escapeHtml(item.productId)}" />
              <button type="button" class="qty-btn btn-qty-inc" data-id="${escapeHtml(item.productId)}">+</button>
            </div>
            <div class="cart-item-subtotal">${formatGHS(lineSubtotal)}</div>
            <button type="button" class="cart-remove-btn" title="Remove item" data-id="${escapeHtml(item.productId)}">✕</button>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-qty-dec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = AppState.cart.find((c) => c.productId === id);
        if (item) updateCartItemQty(id, item.qty - 1);
      });
    });

    container.querySelectorAll('.btn-qty-inc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = AppState.cart.find((c) => c.productId === id);
        if (item) updateCartItemQty(id, item.qty + 1);
      });
    });

    container.querySelectorAll('.qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        updateCartItemQty(input.dataset.id, input.value);
      });
    });

    container.querySelectorAll('.cart-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateCartItemQty(btn.dataset.id, 0);
      });
    });
  }

  updatePaymentcalculations();
  renderLicenseBannerAndPill();
}

function getSelectedPaymentMethod() {
  const radio = document.querySelector('input[name="payment_method"]:checked');
  return radio ? radio.value : 'Cash';
}

function updatePaymentcalculations() {
  const method = getSelectedPaymentMethod();
  const { totalAmount } = getCartTotals();

  const cashBox = document.getElementById('cash-payment-fields');
  const momoBox = document.getElementById('momo-payment-fields');
  const creditBox = document.getElementById('credit-payment-fields');

  if (cashBox) cashBox.classList.toggle('hidden', method !== 'Cash');
  if (momoBox) momoBox.classList.toggle('hidden', method !== 'MoMo');
  if (creditBox) creditBox.classList.toggle('hidden', method !== 'Credit');

  const tenderedInput = document.getElementById('cash-tendered-input');
  const changeDisplay = document.getElementById('cash-change-display');
  if (tenderedInput && changeDisplay) {
    const tenderedVal = tenderedInput.value === '' ? totalAmount : Number(tenderedInput.value);
    const change = Math.max(0, tenderedVal - totalAmount);
    changeDisplay.textContent = formatGHS(change);
  }

  const depositInput = document.getElementById('credit-initial-deposit');
  const balanceDisplay = document.getElementById('credit-balance-owed-display');
  if (depositInput && balanceDisplay) {
    const dep = Math.max(0, Number(depositInput.value || 0));
    const owed = Math.max(0, totalAmount - dep);
    balanceDisplay.textContent = formatGHS(owed);
  }
}

async function handleCompleteSale() {
  await verifyClockAndLicenseState();
  if (!AppState.licenseStatus.active) {
    showToast('Checkout is locked. Please renew your subscription or fix your device clock in Settings.', 'error');
    return;
  }

  if (AppState.cart.length === 0) {
    showToast('Your cart is empty. Add at least one item.', 'error');
    return;
  }

  const paymentMethod = getSelectedPaymentMethod();
  const { totalAmount } = getCartTotals();

  const tenderedInput = document.getElementById('cash-tendered-input');
  const cashTendered = tenderedInput && tenderedInput.value !== '' ? Number(tenderedInput.value) : totalAmount;

  if (paymentMethod === 'Cash' && cashTendered < totalAmount) {
    showToast(`Cash tendered (${formatGHS(cashTendered)}) is less than total sale (${formatGHS(totalAmount)}). Use Credit Book if customer is paying partially.`, 'error');
    return;
  }

  const momoRef = document.getElementById('momo-ref-input')?.value || '';
  const initialDeposit = Number(document.getElementById('credit-initial-deposit')?.value || 0);
  const depositMethod = document.getElementById('credit-deposit-method')?.value || 'Cash';

  const customerInfo = {
    name: document.getElementById('credit-customer-name')?.value || '',
    phone: document.getElementById('credit-customer-phone')?.value || '',
    location: document.getElementById('credit-customer-location')?.value || '',
    due_date: document.getElementById('credit-due-date')?.value || ''
  };

  if (paymentMethod === 'Credit') {
    if (!customerInfo.name.trim() || !customerInfo.phone.trim() || !customerInfo.location.trim()) {
      showToast('Credit Sale requires Customer Name, Phone Number, and Location/Landmark.', 'error');
      return;
    }
    if (initialDeposit >= totalAmount) {
      showToast('Initial deposit equals or exceeds total amount. Choose Cash or MoMo instead of Credit.', 'error');
      return;
    }
  }

  try {
    const result = await window.HolyStarDB.processCheckout({
      cartItems: AppState.cart,
      paymentMethod,
      cashTendered,
      momoRef,
      initialDeposit,
      depositMethod,
      customerInfo
    });

    AppState.cart = [];
    if (tenderedInput) tenderedInput.value = '';
    if (document.getElementById('momo-ref-input')) document.getElementById('momo-ref-input').value = '';
    if (document.getElementById('credit-customer-name')) document.getElementById('credit-customer-name').value = '';
    if (document.getElementById('credit-customer-phone')) document.getElementById('credit-customer-phone').value = '';
    if (document.getElementById('credit-customer-location')) document.getElementById('credit-customer-location').value = '';
    if (document.getElementById('credit-initial-deposit')) document.getElementById('credit-initial-deposit').value = '0';

    const cashRadio = document.querySelector('input[name="payment_method"][value="Cash"]');
    if (cashRadio) cashRadio.checked = true;

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'checkout_sale');
    showSaleReceiptModal(result.sale);
    showToast(`Sale ${result.sale.id} completed (${formatGHS(result.sale.total_amount)})!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to complete sale.', 'error');
  }
}

function showSaleReceiptModal(sale) {
  if (!sale) return;
  AppState.activeSaleReceipt = sale;
  const modal = document.getElementById('modal-sale-receipt');
  const content = document.getElementById('receipt-preview-body');
  if (!modal || !content) return;

  const s = AppState.store || {};
  const itemsLines = (sale.items || [])
    .map((item) => `${item.qty}x ${item.name} @ ${formatGHS(item.selling_price)} = ${formatGHS(item.subtotal)}`)
    .join('\n');

  let paymentBreakdown = `Payment Method: ${sale.payment_method}`;
  if (sale.payment_method === 'Cash') {
    paymentBreakdown += `\nCash Tendered: ${formatGHS(sale.cash_tendered)}\nChange Given: ${formatGHS(sale.change_given)}`;
  } else if (sale.payment_method === 'MoMo') {
    paymentBreakdown += `\nMoMo Ref: ${sale.momo_ref || 'Verified'}`;
  } else if (sale.payment_method === 'Credit') {
    paymentBreakdown += `\nCustomer: ${sale.customer_name} (${sale.customer_phone})\nInitial Deposit (${sale.deposit_method}): ${formatGHS(sale.initial_deposit)}\nBalance Owed (Debt Book): ${formatGHS(sale.balance_owed)}`;
  }

  const receiptText = [
    `★ ${String(s.store_name || 'HOLY STAR POS').toUpperCase()} ★`,
    `Location: ${s.location || 'Ghana'} | Tel: ${s.owner_phone || '-'}`,
    `Store ID: ${s.store_id || 'HS-0000'}`,
    `--------------------------------`,
    `Receipt: ${sale.id}`,
    `Date: ${formatDateTime(sale.timestamp)}`,
    `--------------------------------`,
    itemsLines,
    `--------------------------------`,
    `TOTAL: ${formatGHS(sale.total_amount)}`,
    paymentBreakdown,
    `--------------------------------`,
    `Thank you for shopping with us!`
  ].join('\n');

  content.textContent = receiptText;
  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 2: INVENTORY & PROFIT MARGIN ENGINE
// ============================================================================

function renderInventoryView() {
  const tbody = document.getElementById('inventory-table-body');
  const totalCountEl = document.getElementById('inv-stat-products');
  const lowStockCountEl = document.getElementById('inv-stat-low-stock');
  const stockCostValueEl = document.getElementById('inv-stat-cost-value');
  const projectedProfitEl = document.getElementById('inv-stat-projected-profit');

  if (!tbody) return;

  let lowStockCount = 0;
  let totalCostVal = 0;
  let totalProjProfit = 0;

  for (const p of AppState.products) {
    const qty = Number(p.stock_qty || 0);
    const alertLvl = Number(p.low_stock_alert || 5);
    const cost = Number(p.cost_price || 0);
    const sell = Number(p.selling_price || 0);

    if (qty <= alertLvl) lowStockCount++;
    totalCostVal += cost * qty;
    totalProjProfit += (sell - cost) * qty;
  }

  if (totalCountEl) totalCountEl.textContent = String(AppState.products.length);
  if (lowStockCountEl) lowStockCountEl.textContent = String(lowStockCount);
  if (stockCostValueEl) stockCostValueEl.textContent = formatGHS(totalCostVal);
  if (projectedProfitEl) projectedProfitEl.textContent = formatGHS(totalProjProfit);

  const query = AppState.inventorySearchQuery.trim().toLowerCase();
  const filtered = AppState.products.filter((p) => {
    if (!query) return true;
    return (
      String(p.name || '').toLowerCase().includes(query) ||
      String(p.category || '').toLowerCase().includes(query) ||
      String(p.barcode || '').toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);">
          No products in your store yet. Click <strong>+ Add New Product</strong> to add items (start typing for instant Ghanaian product suggestions!).
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((p) => {
      const cost = Number(p.cost_price || 0);
      const sell = Number(p.selling_price || 0);
      const unitProfit = Number((sell - cost).toFixed(2));
      const marginPct = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
      const qty = Number(p.stock_qty || 0);
      const alertLvl = Number(p.low_stock_alert || 5);

      let stockBadge = `<span class="badge badge-success">${qty} units</span>`;
      if (qty <= 0) {
        stockBadge = `<span class="badge badge-danger">Out of Stock (0)</span>`;
      } else if (qty <= alertLvl) {
        stockBadge = `<span class="badge badge-warning">Low Stock (${qty})</span>`;
      }

      const thumbSrc = getDisplayThumbForProduct(p);

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              ${thumbSrc ? `<img src="${thumbSrc}" style="width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid var(--border);" alt="" />` : ''}
              <div>
                <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(p.name)}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary);">
                  ${escapeHtml(p.category || 'General')} ${p.barcode ? `• 📊 ${escapeHtml(p.barcode)}` : ''}
                </div>
              </div>
            </div>
          </td>
          <td style="font-weight:600;">${formatGHS(cost)}</td>
          <td style="font-weight:800; color:var(--primary);">${formatGHS(sell)}</td>
          <td>
            <span style="font-weight:700; color:${unitProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${formatGHS(unitProfit)} (${marginPct}%)
            </span>
          </td>
          <td>${stockBadge}</td>
          <td>${formatGHS(sell * qty)}</td>
          <td>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-success btn-sm btn-restock-item" data-id="${escapeHtml(p.id)}">+ Restock</button>
              <button type="button" class="btn btn-outline btn-sm btn-edit-item" data-id="${escapeHtml(p.id)}">Edit</button>
              <button type="button" class="btn btn-danger btn-sm btn-delete-item" data-id="${escapeHtml(p.id)}">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.btn-restock-item').forEach((btn) => {
    btn.addEventListener('click', () => openRestockModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-edit-item').forEach((btn) => {
    btn.addEventListener('click', () => openProductModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-delete-item').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteProduct(btn.dataset.id));
  });
}

function openProductModal(productId = null) {
  const modal = document.getElementById('modal-product-form');
  const titleEl = document.getElementById('modal-product-title');
  const idInput = document.getElementById('product-id-input');
  const nameInput = document.getElementById('product-name-input');
  const catInput = document.getElementById('product-category-input');
  const barcodeInput = document.getElementById('product-barcode-input');
  const costInput = document.getElementById('product-cost-input');
  const sellInput = document.getElementById('product-selling-input');
  const qtyInput = document.getElementById('product-stock-input');
  const alertInput = document.getElementById('product-alert-input');
  const thumbPreview = document.getElementById('product-thumb-preview');
  const dropdown = document.getElementById('catalog-autocomplete-list');

  if (!modal) return;
  if (dropdown) dropdown.classList.add('hidden');

  if (productId) {
    const p = AppState.products.find((item) => item.id === productId);
    if (!p) return;
    titleEl.textContent = '✏️ Edit Product & Pricing';
    idInput.value = p.id;
    nameInput.value = p.name;
    catInput.value = p.category || 'General';
    if (barcodeInput) barcodeInput.value = p.barcode || '';
    costInput.value = p.cost_price;
    sellInput.value = p.selling_price;
    qtyInput.value = p.stock_qty;
    alertInput.value = p.low_stock_alert || 5;
    AppState.currentProductThumbnail = p.thumbnail || getDisplayThumbForProduct(p);
    if (thumbPreview) thumbPreview.src = AppState.currentProductThumbnail;
  } else {
    titleEl.textContent = '➕ Add New Product to Stock';
    idInput.value = '';
    nameInput.value = '';
    catInput.value = 'Provision & Mini-Mart';
    if (barcodeInput) barcodeInput.value = '';
    costInput.value = '';
    sellInput.value = '';
    qtyInput.value = '';
    alertInput.value = '5';
    AppState.currentProductThumbnail = window.createEmojiSvgDataUrl
      ? window.createEmojiSvgDataUrl('📦', '#1e3a8a')
      : '';
    if (thumbPreview) thumbPreview.src = AppState.currentProductThumbnail;
  }

  updateLiveUnitProfitPreview();
  modal.classList.remove('hidden');
  nameInput.focus();
}

function updateLiveUnitProfitPreview() {
  const cost = Number(document.getElementById('product-cost-input')?.value || 0);
  const sell = Number(document.getElementById('product-selling-input')?.value || 0);
  const previewEl = document.getElementById('product-live-profit-preview');
  if (!previewEl) return;

  const profit = Number((sell - cost).toFixed(2));
  previewEl.textContent = `Unit Profit: ${formatGHS(profit)}`;
  previewEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
}

async function handleSaveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('product-id-input')?.value || '';
  const name = document.getElementById('product-name-input')?.value || '';
  const category = document.getElementById('product-category-input')?.value || 'General';
  const barcode = document.getElementById('product-barcode-input')?.value || '';
  const cost_price = document.getElementById('product-cost-input')?.value;
  const selling_price = document.getElementById('product-selling-input')?.value;
  const stock_qty = document.getElementById('product-stock-input')?.value;
  const low_stock_alert = document.getElementById('product-alert-input')?.value || 5;

  try {
    const saved = await window.HolyStarDB.saveProduct({
      id: id || undefined,
      name,
      category,
      barcode,
      thumbnail: AppState.currentProductThumbnail || '',
      cost_price,
      selling_price,
      stock_qty,
      low_stock_alert
    });

    document.getElementById('modal-product-form')?.classList.add('hidden');
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'inventory_saved');
    showToast(`Saved "${saved.name}" (${saved.stock_qty} in stock).`, 'success');
  } catch (err) {
    showToast(err.message || 'Could not save product.', 'error');
  }
}

function openRestockModal(productId) {
  const product = AppState.products.find((p) => p.id === productId);
  if (!product) return;

  document.getElementById('restock-product-id').value = product.id;
  document.getElementById('restock-product-name').textContent = `${product.name} (Current Stock: ${product.stock_qty})`;
  document.getElementById('restock-qty-input').value = '';
  document.getElementById('restock-cost-input').value = product.cost_price;
  document.getElementById('restock-selling-input').value = product.selling_price;

  document.getElementById('modal-restock')?.classList.remove('hidden');
  document.getElementById('restock-qty-input')?.focus();
}

async function handleRestockSubmit(e) {
  e.preventDefault();
  const productId = document.getElementById('restock-product-id')?.value;
  const addQty = document.getElementById('restock-qty-input')?.value;
  const newCost = document.getElementById('restock-cost-input')?.value;
  const newSell = document.getElementById('restock-selling-input')?.value;

  try {
    const updated = await window.HolyStarDB.restockProduct(productId, addQty, newCost, newSell);
    document.getElementById('modal-restock')?.classList.add('hidden');
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'inventory_restocked');
    showToast(`Restocked "${updated.name}". New Stock: ${updated.stock_qty} units.`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to restock item.', 'error');
  }
}

async function handleDeleteProduct(productId) {
  const product = AppState.products.find((p) => p.id === productId);
  if (!product) return;

  if (!confirm(`Delete "${product.name}" from your store inventory?`)) return;

  try {
    await window.HolyStarDB.deleteProduct(productId);
    AppState.cart = AppState.cart.filter((c) => c.productId !== productId);
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'inventory_deleted');
    showToast(`Deleted "${product.name}".`, 'info');
  } catch (err) {
    showToast('Failed to delete product: ' + err.message, 'error');
  }
}

// ============================================================================
// TAB 3: DEBTORS BOOK (CREDIT LEDGER) & 1-TAP WHATSAPP REMINDERS
// ============================================================================

function renderDebtorsView() {
  const tbody = document.getElementById('debtors-table-body');
  const totalOwedEl = document.getElementById('debtor-stat-total-owed');
  const unpaidCountEl = document.getElementById('debtor-stat-unpaid-count');
  const clearedCountEl = document.getElementById('debtor-stat-cleared-count');

  if (!tbody) return;

  let totalOutstanding = 0;
  let unpaidCustomers = 0;
  let clearedCustomers = 0;

  for (const d of AppState.debtors) {
    const owed = Number(d.total_owed || 0);
    if (owed > 0) {
      totalOutstanding += owed;
      unpaidCustomers++;
    } else {
      clearedCustomers++;
    }
  }

  if (totalOwedEl) totalOwedEl.textContent = formatGHS(totalOutstanding);
  if (unpaidCountEl) unpaidCountEl.textContent = String(unpaidCustomers);
  if (clearedCountEl) clearedCountEl.textContent = String(clearedCustomers);

  const query = AppState.debtorSearchQuery.trim().toLowerCase();
  const filtered = AppState.debtors.filter((d) => {
    const owed = Number(d.total_owed || 0);
    if (AppState.debtorFilter === 'UNPAID' && owed <= 0) return false;
    if (AppState.debtorFilter === 'CLEARED' && owed > 0) return false;

    if (!query) return true;
    return (
      String(d.name || '').toLowerCase().includes(query) ||
      String(d.phone || '').toLowerCase().includes(query) ||
      String(d.location || '').toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">
          No debtor records in this store. Credit sales from POS Checkout or manual entries will appear here.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((d) => {
      const owed = Number(d.total_owed || 0);
      const isCleared = owed <= 0;

      const latestItemsSummary = getDebtorItemsSummaryText(d);

      return `
        <tr>
          <td>
            <div style="font-weight:800; color:var(--text-primary);">${escapeHtml(d.name)}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary);">📞 ${escapeHtml(d.phone)}</div>
          </td>
          <td>
            <span style="font-size:0.84rem; font-weight:600;">📍 ${escapeHtml(d.location)}</span>
            ${d.due_date ? `<div style="font-size:0.74rem; color:var(--warning);">Due: ${escapeHtml(d.due_date)}</div>` : ''}
          </td>
          <td style="max-width:220px; font-size:0.8rem; color:var(--text-secondary);">
            ${escapeHtml(latestItemsSummary)}
          </td>
          <td>
            <span style="font-weight:900; font-size:0.98rem; color:${isCleared ? 'var(--success)' : 'var(--danger)'};">
              ${formatGHS(owed)}
            </span>
            <div style="font-size:0.73rem; color:var(--text-muted);">Paid so far: ${formatGHS(d.total_paid || 0)}</div>
          </td>
          <td>
            ${
              isCleared
                ? `<span class="badge badge-success">✔ Cleared</span>`
                : `<span class="badge badge-danger">Unpaid</span>`
            }
          </td>
          <td>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              ${
                !isCleared
                  ? `<button type="button" class="btn btn-primary btn-sm btn-pay-debt" data-id="${escapeHtml(d.id)}">💵 Record Payment</button>
                     <button type="button" class="btn btn-whatsapp btn-sm btn-remind-whatsapp" data-id="${escapeHtml(d.id)}" title="Send WhatsApp Reminder">💬 WhatsApp</button>
                     <button type="button" class="btn btn-outline btn-sm btn-remind-sms" data-id="${escapeHtml(d.id)}" title="Send SMS Reminder">📩 SMS</button>`
                  : ''
              }
              <button type="button" class="btn btn-outline btn-sm btn-debtor-history" data-id="${escapeHtml(d.id)}">📜 History</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.btn-pay-debt').forEach((btn) => {
    btn.addEventListener('click', () => openRecordPaymentModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-remind-whatsapp').forEach((btn) => {
    btn.addEventListener('click', () => sendDebtorReminder(btn.dataset.id, 'WHATSAPP'));
  });

  tbody.querySelectorAll('.btn-remind-sms').forEach((btn) => {
    btn.addEventListener('click', () => sendDebtorReminder(btn.dataset.id, 'SMS'));
  });

  tbody.querySelectorAll('.btn-debtor-history').forEach((btn) => {
    btn.addEventListener('click', () => openDebtorHistoryModal(btn.dataset.id));
  });
}

function getDebtorItemsSummaryText(debtor) {
  if (!Array.isArray(debtor.history) || debtor.history.length === 0) return 'Credit balance';
  const creditEntries = debtor.history.filter((h) => h.type === 'CREDIT_SALE' || h.type === 'MANUAL_CREDIT');
  if (creditEntries.length === 0) return 'Credit balance';

  const latest = creditEntries[0];
  if (Array.isArray(latest.items) && latest.items.length > 0) {
    return latest.items.map((i) => `${i.qty}x ${i.name}`).join(', ');
  }
  return latest.note || 'Credit purchase';
}

function buildDebtorReminderMessage(debtor) {
  const shopName = AppState.store?.store_name || 'Holy Star POS Shop';
  const shopPhone = AppState.store?.owner_phone || '';
  const itemsText = getDebtorItemsSummaryText(debtor);
  const lastDate = debtor.updated_at ? new Date(debtor.updated_at).toLocaleDateString('en-GB') : 'recently';
  const duePart = debtor.due_date ? ` (Due Date: ${debtor.due_date})` : '';

  return (
    `Hello ${debtor.name}, friendly reminder from *${shopName}*: ` +
    `Your outstanding credit balance for items taken on ${lastDate} (${itemsText}) is *${formatGHS(debtor.total_owed)}*${duePart}. ` +
    `Kindly pass by the shop or send Mobile Money${shopPhone ? ' to ' + shopPhone : ''} to clear your balance. Thank you!`
  );
}

function sendDebtorReminder(debtorId, channel = 'WHATSAPP') {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  const message = buildDebtorReminderMessage(debtor);
  const cleanPhone = cleanPhoneForWhatsApp(debtor.phone);

  if (channel === 'WHATSAPP') {
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const smsUrl = `sms:${debtor.phone}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  }
}

function openRecordPaymentModal(debtorId) {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  document.getElementById('pay-debtor-id').value = debtor.id;
  document.getElementById('pay-debtor-name').textContent = `${debtor.name} (${debtor.phone})`;
  document.getElementById('pay-debtor-current-owed').textContent = formatGHS(debtor.total_owed);
  const amountInput = document.getElementById('pay-debtor-amount');
  amountInput.value = debtor.total_owed;
  amountInput.max = debtor.total_owed;
  document.getElementById('pay-debtor-note').value = '';

  document.getElementById('modal-record-payment')?.classList.remove('hidden');
  amountInput.focus();
}

async function handleRecordDebtorPayment(e) {
  e.preventDefault();
  const debtorId = document.getElementById('pay-debtor-id')?.value;
  const amount = document.getElementById('pay-debtor-amount')?.value;
  const paymentMethod = document.getElementById('pay-debtor-method')?.value || 'Cash';
  const note = document.getElementById('pay-debtor-note')?.value || '';

  try {
    const { debtor, paymentEntry } = await window.HolyStarDB.recordDebtorPayment({
      debtorId,
      amount,
      paymentMethod,
      note
    });

    document.getElementById('modal-record-payment')?.classList.add('hidden');
    await refreshAllData();
    showToast(
      `Recorded ${formatGHS(paymentEntry.amount_paid)} (${paymentMethod}) from ${debtor.name}. Remaining balance: ${formatGHS(debtor.total_owed)}`,
      'success'
    );
  } catch (err) {
    showToast(err.message || 'Failed to record payment.', 'error');
  }
}

async function handleAddManualDebtor(e) {
  e.preventDefault();
  const name = document.getElementById('manual-debtor-name')?.value;
  const phone = document.getElementById('manual-debtor-phone')?.value;
  const location = document.getElementById('manual-debtor-location')?.value;
  const amountOwed = document.getElementById('manual-debtor-amount')?.value;
  const itemDescription = document.getElementById('manual-debtor-items')?.value;
  const dueDate = document.getElementById('manual-debtor-due')?.value;

  try {
    const debtor = await window.HolyStarDB.addManualDebtor({
      name,
      phone,
      location,
      amountOwed,
      itemDescription,
      dueDate
    });

    document.getElementById('modal-manual-debtor')?.classList.add('hidden');
    e.target.reset();
    await refreshAllData();
    showToast(`Added credit record for ${debtor.name} (${formatGHS(debtor.total_owed)}).`, 'success');
  } catch (err) {
    showToast(err.message || 'Could not add debtor.', 'error');
  }
}

function openDebtorHistoryModal(debtorId) {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  const modal = document.getElementById('modal-debtor-history');
  const titleEl = document.getElementById('history-debtor-title');
  const metaEl = document.getElementById('history-debtor-meta');
  const listEl = document.getElementById('history-debtor-timeline');

  if (!modal || !listEl) return;

  titleEl.textContent = `📜 Credit Ledger — ${debtor.name}`;
  metaEl.textContent = `Phone: ${debtor.phone} • Location: ${debtor.location} • Current Balance Owed: ${formatGHS(debtor.total_owed)}`;

  const history = Array.isArray(debtor.history) ? debtor.history : [];
  if (history.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-secondary);">No transactions logged.</p>`;
  } else {
    listEl.innerHTML = history
      .map((h) => {
        if (h.type === 'PAYMENT') {
          return `
            <div style="border-left:4px solid var(--success); background:var(--success-bg); padding:0.7rem; border-radius:6px; margin-bottom:0.6rem;">
              <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--success);">
                <span>💵 Debt Repayment (${escapeHtml(h.payment_method)})</span>
                <span>− ${formatGHS(h.amount_paid)}</span>
              </div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.2rem;">
                ${formatDateTime(h.timestamp)} • Balance: ${formatGHS(h.balance_before)} → <strong>${formatGHS(h.balance_after)}</strong>
              </div>
              <div style="font-size:0.8rem; margin-top:0.2rem;">${escapeHtml(h.note || '')}</div>
            </div>
          `;
        } else {
          const itemsStr = Array.isArray(h.items)
            ? h.items.map((i) => `${i.qty}x ${i.name} (${formatGHS(i.subtotal)})`).join(', ')
            : h.note || 'Credit purchase';
          return `
            <div style="border-left:4px solid var(--danger); background:var(--danger-bg); padding:0.7rem; border-radius:6px; margin-bottom:0.6rem;">
              <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--danger);">
                <span>📝 Credit Taken ${h.sale_id ? `(#${escapeHtml(h.sale_id)})` : ''}</span>
                <span>+ ${formatGHS(h.amount_added_to_debt)}</span>
              </div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.2rem;">
                ${formatDateTime(h.timestamp)} • Total Items: ${formatGHS(h.total_credit_sale)} (Initial Deposit: ${formatGHS(h.initial_deposit || 0)})
              </div>
              <div style="font-size:0.8rem; margin-top:0.25rem; font-weight:600;">Items: ${escapeHtml(itemsStr)}</div>
            </div>
          `;
        }
      })
      .join('');
  }

  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 4: SALES HISTORY, GROSS PROFIT & CLOSE-DAY WHATSAPP REPORT
// ============================================================================

function renderReportsView() {
  const report = AppState.dailyReport;
  if (!report) return;

  const m = report.metrics;
  const revEl = document.getElementById('metric-revenue');
  const salesCountEl = document.getElementById('metric-sales-count');
  const profitEl = document.getElementById('metric-profit');
  const cashEl = document.getElementById('metric-cash');
  const cashSubEl = document.getElementById('metric-cash-sub');
  const momoEl = document.getElementById('metric-momo');
  const momoSubEl = document.getElementById('metric-momo-sub');
  const creditEl = document.getElementById('metric-credit');

  if (revEl) revEl.textContent = formatGHS(m.totalRevenue);
  if (salesCountEl) salesCountEl.textContent = `${m.salesCount} sale${m.salesCount === 1 ? '' : 's'} completed`;
  if (profitEl) profitEl.textContent = formatGHS(m.grossProfit);
  if (cashEl) cashEl.textContent = formatGHS(m.cashCollected);
  if (cashSubEl) cashSubEl.textContent = `Sales: ${formatGHS(m.cashFromSales)} + Debt Paid: ${formatGHS(m.cashFromDebtors)}`;
  if (momoEl) momoEl.textContent = formatGHS(m.momoRecorded);
  if (momoSubEl) momoSubEl.textContent = `Sales: ${formatGHS(m.momoFromSales)} + Debt Paid: ${formatGHS(m.momoFromDebtors)}`;
  if (creditEl) creditEl.textContent = formatGHS(m.newCreditGiven);

  const salesTbody = document.getElementById('sales-table-body');
  if (salesTbody) {
    if (report.sales.length === 0) {
      salesTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:1.75rem; color:var(--text-secondary);">
            No sales recorded for ${escapeHtml(report.dateStr)}.
          </td>
        </tr>
      `;
    } else {
      salesTbody.innerHTML = report.sales
        .map((s) => {
          const itemSummary = (s.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ');
          let methodBadge = `<span class="badge badge-success">💵 Cash</span>`;
          if (s.payment_method === 'MoMo') {
            methodBadge = `<span class="badge badge-info">📱 MoMo</span>`;
          } else if (s.payment_method === 'Credit') {
            methodBadge = `<span class="badge badge-danger">📒 Credit (${escapeHtml(s.customer_name)})</span>`;
          }

          return `
            <tr>
              <td style="font-weight:800; font-family:monospace;">${escapeHtml(s.id)}</td>
              <td>${formatShortTime(s.timestamp)}</td>
              <td style="max-width:250px;">${escapeHtml(itemSummary)}</td>
              <td>${methodBadge}</td>
              <td style="font-weight:800;">${formatGHS(s.total_amount)}</td>
              <td style="font-weight:700; color:var(--success);">${formatGHS(s.total_profit)}</td>
              <td>
                <button type="button" class="btn btn-outline btn-sm btn-view-receipt" data-id="${escapeHtml(s.id)}">🧾 View</button>
              </td>
            </tr>
          `;
        })
        .join('');

      salesTbody.querySelectorAll('.btn-view-receipt').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sale = report.sales.find((x) => x.id === btn.dataset.id);
          if (sale) showSaleReceiptModal(sale);
        });
      });
    }
  }

  const repayTbody = document.getElementById('repayments-table-body');
  if (repayTbody) {
    if (report.repayments.length === 0) {
      repayTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:1.25rem; color:var(--text-secondary);">
            No debtor repayments recorded on ${escapeHtml(report.dateStr)}.
          </td>
        </tr>
      `;
    } else {
      repayTbody.innerHTML = report.repayments
        .map((r) => `
          <tr>
            <td>${formatShortTime(r.timestamp)}</td>
            <td style="font-weight:700;">${escapeHtml(r.debtor_name)} (${escapeHtml(r.debtor_phone)})</td>
            <td><span class="badge ${r.payment_method === 'MoMo' ? 'badge-info' : 'badge-success'}">${escapeHtml(r.payment_method)}</span></td>
            <td style="font-weight:800; color:var(--success);">${formatGHS(r.amount_paid)}</td>
            <td>${formatGHS(r.balance_after)}</td>
            <td>${escapeHtml(r.note || '')}</td>
          </tr>
        `)
        .join('');
    }
  }
}

function buildCloseDaySummaryText() {
  const report = AppState.dailyReport;
  const s = AppState.store || {};
  if (!report) return '';

  const m = report.metrics;
  const shopId = s.store_id || s.shop_id || 'HS-0000';
  const seal = generateDailyAuditSeal(
    shopId,
    report.dateStr,
    m.totalRevenue,
    m.grossProfit,
    m.cashCollected,
    m.momoRecorded,
    m.newCreditGiven
  );

  const lowStockItems = AppState.products.filter((p) => Number(p.stock_qty || 0) <= Number(p.low_stock_alert || 5));
  const lowStockLine = lowStockItems.length > 0
    ? lowStockItems.slice(0, 6).map((p) => `${p.name} (${p.stock_qty})`).join(', ')
    : 'All items well stocked';

  return [
    `📊 *HOLY STAR POS — CLOSE OF DAY REPORT*`,
    `🏪 *Shop:* ${s.store_name || 'Holy Star Shop'} (${shopId})`,
    `📅 *Date:* ${report.dateStr}`,
    `--------------------------------`,
    `💰 *Total Sales Revenue:* ${formatGHS(m.totalRevenue)} (${m.salesCount} sales)`,
    `📈 *Actual Gross Profit:* ${formatGHS(m.grossProfit)}`,
    `--------------------------------`,
    `💵 *CASH IN DRAWER:* ${formatGHS(m.cashCollected)}`,
    `   • Cash Sales: ${formatGHS(m.cashFromSales)}`,
    `   • Cash Debt Repayments: ${formatGHS(m.cashFromDebtors)}`,
    `📱 *MOMO RECORDED:* ${formatGHS(m.momoRecorded)}`,
    `   • MoMo Sales: ${formatGHS(m.momoFromSales)}`,
    `   • MoMo Debt Repayments: ${formatGHS(m.momoFromDebtors)}`,
    `📒 *New Credit Given Today:* ${formatGHS(m.newCreditGiven)}`,
    `--------------------------------`,
    `⚠️ *Low Stock Alert (${lowStockItems.length}):* ${lowStockLine}`,
    `🔐 *Audit Seal:* *${seal}*`
  ].join('\n');
}

function openCloseDayModal() {
  const modal = document.getElementById('modal-close-day');
  const preview = document.getElementById('close-day-report-preview');
  if (!modal || !preview) return;

  preview.textContent = buildCloseDaySummaryText();
  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 5: SETTINGS, PREPAID TOKEN ACTIVATION & BACKUP / RESTORE
// ============================================================================

async function renderSettingsView() {
  const s = AppState.store || {};

  const shopIdDisplay = document.getElementById('settings-display-shop-id');
  const statusDisplay = document.getElementById('settings-license-status-text');
  const expiryDisplay = document.getElementById('settings-license-expiry-date');
  const planDisplay = document.getElementById('settings-license-plan');
  const clockStatusDisplay = document.getElementById('settings-clock-status');

  if (shopIdDisplay) shopIdDisplay.textContent = s.store_id || s.shop_id || 'HS-0000';
  if (planDisplay) planDisplay.textContent = s.license_plan || '7-Day Initial Trial';
  if (expiryDisplay) expiryDisplay.textContent = formatDateTime(s.license_expiry);

  if (statusDisplay) {
    if (AppState.licenseStatus.tampered) {
      statusDisplay.innerHTML = `<span class="badge badge-danger">🔒 Clock Tamper Locked</span>`;
    } else if (AppState.licenseStatus.expired) {
      statusDisplay.innerHTML = `<span class="badge badge-danger">🔒 Expired</span>`;
    } else {
      statusDisplay.innerHTML = `<span class="badge badge-success">✔ Active (${AppState.licenseStatus.daysLeft} days left)</span>`;
    }
  }

  if (clockStatusDisplay) {
    clockStatusDisplay.innerHTML = AppState.licenseStatus.tampered
      ? `<span style="color:var(--danger); font-weight:700;">⚠️ Clock Rollback Detected (Last valid: ${formatDateTime(s.last_seen_timestamp)})</span>`
      : `<span style="color:var(--success); font-weight:700;">✔ Verified Monotonic (${formatDateTime(s.last_seen_timestamp)})</span>`;
  }

  const nameInput = document.getElementById('settings-shop-name');
  const catInput = document.getElementById('settings-shop-category');
  const ownerNameInput = document.getElementById('settings-owner-name');
  const phoneInput = document.getElementById('settings-owner-phone');
  const locInput = document.getElementById('settings-shop-location');

  if (nameInput) nameInput.value = s.store_name || s.shop_name || '';
  if (catInput && s.store_category) catInput.value = s.store_category;
  if (ownerNameInput) ownerNameInput.value = s.owner_name || '';
  if (phoneInput) phoneInput.value = s.owner_phone || '';
  if (locInput) locInput.value = s.location || '';

  const usedTokens = await window.HolyStarDB.getUsedTokens();
  const usedBody = document.getElementById('used-tokens-tbody');
  if (usedBody) {
    if (usedTokens.length === 0) {
      usedBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary);">No tokens redeemed yet in this store.</td></tr>`;
    } else {
      usedBody.innerHTML = usedTokens
        .map((t) => `
          <tr>
            <td style="font-family:monospace; font-weight:800;">${escapeHtml(t.token)}</td>
            <td>${escapeHtml(t.issue_code)}</td>
            <td>+${escapeHtml(t.plan_days)} Days</td>
            <td>${formatDateTime(t.activated_at)}</td>
          </tr>
        `)
        .join('');
    }
  }
}

/**
 * Verify an 8-character token against the active store ID.
 * Supports explicit or auto-detected Issue Codes (`001`..`500`) and Plan Days (`7`, `14`, `30`, or Custom `1..365`).
 */
function matchSubscriptionToken(shopId, enteredToken, optionalIssueCode, selectedPlanOption) {
  const candidateIssueCodes = [];
  if (optionalIssueCode) {
    candidateIssueCodes.push(optionalIssueCode);
  } else {
    // Auto-scan standard serial codes 001..200 and 1..200 plus current month/year codes
    for (let i = 1; i <= 200; i++) {
      candidateIssueCodes.push(String(i).padStart(3, '0'));
      candidateIssueCodes.push(String(i));
    }
    const now = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const yr = String(now.getFullYear()).slice(-2);
    for (const m of months) {
      candidateIssueCodes.push(`${m}${yr}`);
    }
    candidateIssueCodes.push('ADMIN', 'RENEW', 'SAAS', 'POS');
  }

  // Candidate plan days: prioritize selected plan or common plans (7, 14, 30, 60, 90, 180, 365), then 1..365
  const candidateDays = [];
  const pushUniqueDay = (d) => {
    const n = Number(d);
    if (n >= 1 && n <= 365 && !candidateDays.includes(n)) candidateDays.push(n);
  };

  if (selectedPlanOption && selectedPlanOption !== 'AUTO') {
    pushUniqueDay(selectedPlanOption);
  }
  [7, 14, 30, 60, 90, 180, 365].forEach(pushUniqueDay);
  for (let d = 1; d <= 365; d++) {
    pushUniqueDay(d);
  }

  for (const issueCode of candidateIssueCodes) {
    for (const d of candidateDays) {
      const expected = generateDeterministicToken(shopId, d, issueCode);
      if (expected === enteredToken) {
        return { matchedDays: d, matchedIssueCode: issueCode };
      }
    }
  }

  return null;
}

async function handleActivateToken(e) {
  e.preventDefault();
  const issueCodeInput = document.getElementById('token-issue-code');
  const tokenInput = document.getElementById('token-code-input');
  const planSelect = document.getElementById('token-plan-days');

  const rawIssue = String(issueCodeInput?.value || '').trim().toUpperCase();
  const enteredToken = String(tokenInput?.value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const selectedPlan = planSelect?.value || 'AUTO';

  if (!enteredToken || enteredToken.length !== 8) {
    showToast('Please enter a valid 8-character alphanumeric Unlock Token.', 'error');
    return;
  }

  const shopId = AppState.store?.store_id || 'HS-0000';

  // Match token (first with user-supplied issue code if present, then auto-scan if needed)
  let matchResult = matchSubscriptionToken(shopId, enteredToken, rawIssue, selectedPlan);
  if (!matchResult && rawIssue) {
    matchResult = matchSubscriptionToken(shopId, enteredToken, '', selectedPlan);
  }

  if (!matchResult) {
    showToast(
      `Invalid Unlock Token "${enteredToken}" for Store ID ${shopId}. Verify that your Store ID matches the token generated in Super-Admin.`,
      'error'
    );
    return;
  }

  const { matchedDays, matchedIssueCode } = matchResult;
  const tokenId = `${shopId}-${matchedDays}D-${matchedIssueCode}-${enteredToken}`;
  const alreadyUsed = await window.HolyStarDB.isTokenUsed(tokenId);
  if (alreadyUsed) {
    showToast(`This token (${enteredToken}) has already been used on this store and cannot be replayed.`, 'error');
    return;
  }

  try {
    await window.HolyStarDB.recordUsedToken({
      token_id: tokenId,
      token: enteredToken,
      issue_code: matchedIssueCode,
      plan_days: matchedDays
    });

    await window.HolyStarDB.extendStoreLicense(matchedDays, `${matchedDays}-Day Prepaid Pass`);

    if (issueCodeInput) issueCodeInput.value = '';
    if (tokenInput) tokenInput.value = '';

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(shopId, 'license_renewed');
    showToast(`🎉 Token Verified! Subscription extended by +${matchedDays} days!`, 'success');
  } catch (err) {
    showToast('Failed to activate token: ' + err.message, 'error');
  }
}

async function handleSaveShopSettings(e) {
  e.preventDefault();
  const shopName = String(document.getElementById('settings-shop-name')?.value || '').trim();
  const shopCat = String(document.getElementById('settings-shop-category')?.value || 'Provision & Mini-Mart').trim();
  const ownerName = String(document.getElementById('settings-owner-name')?.value || '').trim();
  const ownerPhone = String(document.getElementById('settings-owner-phone')?.value || '').trim();
  const location = String(document.getElementById('settings-shop-location')?.value || '').trim();

  if (!shopName) {
    showToast('Store Name cannot be empty.', 'error');
    return;
  }

  try {
    await window.HolyStarDB.updateActiveStoreSettings({
      store_name: shopName,
      shop_name: shopName,
      store_category: shopCat,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      location
    });

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'settings_updated');
    showToast('Store profile updated and synced!', 'success');
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

async function handleSimulateExpiredLicense() {
  try {
    await window.HolyStarDB.updateActiveStoreSettings({
      license_expiry: Date.now() - 60 * 1000,
      license_plan: 'Expired (Simulated for Testing)'
    });
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'license_expired_sim');
    showToast('License set to Expired! Try generating an Unlock Token in Super-Admin to unlock.', 'info');
  } catch (err) {
    showToast('Failed to simulate expiry: ' + err.message, 'error');
  }
}

async function handleExportBackup() {
  try {
    const payload = await window.HolyStarDB.exportFullBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = window.HolyStarDB.formatLocalDate();
    a.href = url;
    a.download = `HolyStarPOS_Backup_${payload.shop_id}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Full store JSON backup downloaded!', 'success');
  } catch (err) {
    showToast('Backup export failed: ' + err.message, 'error');
  }
}

async function handleImportBackup(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!confirm(`Restore backup from ${json.exported_at || 'file'}? This will update store ${json.shop_id || ''}.`)) {
      e.target.value = '';
      return;
    }

    await window.HolyStarDB.restoreFullBackup(json);
    e.target.value = '';
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'backup_restored');
    showToast('Database backup restored!', 'success');
  } catch (err) {
    e.target.value = '';
    showToast('Restore failed: ' + err.message, 'error');
  }
}

// ============================================================================
// UI EVENT BINDINGS
// ============================================================================

function bindUIEvents() {
  // Auth Tabs
  document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAuthTab(btn.dataset.authTab);
    });
  });

  // Saved stores dropdown on login
  document.getElementById('login-saved-store-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const idInput = document.getElementById('login-identifier');
    if (val && idInput) idInput.value = val;
  });

  // Login Form Submit
  document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier')?.value;
    const password = document.getElementById('login-password')?.value;

    try {
      AppState.cart = [];
      AppState.products = [];
      AppState.debtors = [];
      const { store, session } = await window.HolyStarDB.loginToStore({ identifier, password });
      AppState.store = store;
      AppState.session = session;
      document.getElementById('login-password').value = '';
      hideAuthOverlay();
      await refreshAllData();
      window.HolyStarDB.syncTelemetryHeartbeat(store.store_id, 'store_login');
      showToast(`Welcome back to ${store.store_name}!`, 'success');
    } catch (err) {
      showToast(err.message || 'Login failed.', 'error');
    }
  });

  // Register New Store Form Submit (100% Empty Store Guaranteed)
  document.getElementById('form-auth-register')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const storeName = document.getElementById('reg-store-name')?.value;
    const storeCategory = document.getElementById('reg-store-category')?.value;
    const ownerName = document.getElementById('reg-owner-name')?.value;
    const ownerPhone = document.getElementById('reg-owner-phone')?.value;
    const password = document.getElementById('reg-owner-password')?.value;
    const location = document.getElementById('reg-store-location')?.value;

    try {
      // Reset in-memory state so new store starts 100% blank
      AppState.cart = [];
      AppState.products = [];
      AppState.debtors = [];
      AppState.dailyReport = null;

      const store = await window.HolyStarDB.registerNewStore({
        storeName,
        storeCategory,
        ownerName,
        ownerPhone,
        password,
        location
      });

      AppState.store = store;
      AppState.session = window.HolyStarDB.getActiveSession();
      e.target.reset();
      hideAuthOverlay();
      await refreshAllData();
      window.HolyStarDB.syncTelemetryHeartbeat(store.store_id, 'store_registered');
      showToast(`🎉 Store "${store.store_name}" (${store.store_id}) created with 0 items! 7-Day Free Trial active.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not create store.', 'error');
    }
  });

  // Log Out / Switch Store Button
  document.getElementById('btn-logout-store')?.addEventListener('click', async () => {
    window.HolyStarDB.clearActiveSession();
    AppState.session = null;
    AppState.store = null;
    AppState.cart = [];
    AppState.products = [];
    AppState.debtors = [];
    await showAuthOverlay();
    showToast('Logged out of store.', 'info');
  });

  // Main Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const targetId = tabBtn.dataset.tab;
      switchTab(targetId);
    });
  });

  document.getElementById('license-status-pill')?.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  document.getElementById('btn-unlock-now')?.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  // POS Search & Barcode Scanner
  const posSearch = document.getElementById('pos-search-input');
  if (posSearch) {
    posSearch.addEventListener('input', () => {
      AppState.posSearchQuery = posSearch.value;
      renderPosProductGrid();
    });
  }

  document.getElementById('btn-pos-scan-barcode')?.addEventListener('click', () => {
    openBarcodeScanner('POS');
  });

  document.getElementById('btn-scan-product-barcode')?.addEventListener('click', () => {
    openBarcodeScanner('STOCK_INPUT');
  });

  document.getElementById('form-manual-barcode-scan')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('scanner-manual-code-input')?.value;
    if (code) handleDetectedBarcode(code);
  });

  document.getElementById('btn-close-scanner-modal')?.addEventListener('click', () => {
    stopBarcodeScanner();
  });

  // Clear Cart
  document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
    AppState.cart = [];
    renderCart();
    renderPosProductGrid();
  });

  // Payment Method Radio Toggle
  document.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
    radio.addEventListener('change', updatePaymentcalculations);
  });

  document.getElementById('cash-tendered-input')?.addEventListener('input', updatePaymentcalculations);
  document.getElementById('credit-initial-deposit')?.addEventListener('input', updatePaymentcalculations);

  // Complete Sale
  document.getElementById('btn-complete-sale')?.addEventListener('click', handleCompleteSale);

  // Inventory Search & Modals
  const invSearch = document.getElementById('inventory-search-input');
  if (invSearch) {
    invSearch.addEventListener('input', () => {
      AppState.inventorySearchQuery = invSearch.value;
      renderInventoryView();
    });
  }

  document.getElementById('btn-open-add-product')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('product-cost-input')?.addEventListener('input', updateLiveUnitProfitPreview);
  document.getElementById('product-selling-input')?.addEventListener('input', updateLiveUnitProfitPreview);
  document.getElementById('form-product')?.addEventListener('submit', handleSaveProductForm);
  document.getElementById('form-restock')?.addEventListener('submit', handleRestockSubmit);

  // Smart Catalog Autocomplete on Product Name Input
  const prodNameInput = document.getElementById('product-name-input');
  if (prodNameInput) {
    prodNameInput.addEventListener('input', () => {
      renderCatalogSuggestions(prodNameInput.value);
    });
    prodNameInput.addEventListener('focus', () => {
      if (prodNameInput.value.trim().length > 0) {
        renderCatalogSuggestions(prodNameInput.value);
      }
    });
  }

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('catalog-autocomplete-list');
    if (dropdown && !dropdown.contains(e.target) && e.target !== prodNameInput) {
      dropdown.classList.add('hidden');
    }
  });

  // Product Photo Upload / Camera Capture
  document.getElementById('product-photo-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 160);
      AppState.currentProductThumbnail = dataUrl;
      const preview = document.getElementById('product-thumb-preview');
      if (preview) preview.src = dataUrl;
      showToast('Product photo attached!', 'success');
    } catch (err) {
      showToast('Failed to process photo.', 'error');
    }
  });

  // Debtors Filter & Search
  document.querySelectorAll('.debtor-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.debtor-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.debtorFilter = btn.dataset.filter;
      renderDebtorsView();
    });
  });

  const debtorSearch = document.getElementById('debtor-search-input');
  if (debtorSearch) {
    debtorSearch.addEventListener('input', () => {
      AppState.debtorSearchQuery = debtorSearch.value;
      renderDebtorsView();
    });
  }

  document.getElementById('btn-open-manual-debtor')?.addEventListener('click', () => {
    document.getElementById('modal-manual-debtor')?.classList.remove('hidden');
  });

  document.getElementById('form-manual-debtor')?.addEventListener('submit', handleAddManualDebtor);
  document.getElementById('form-record-payment')?.addEventListener('submit', handleRecordDebtorPayment);

  // Reports Date Picker & Close-Day Report
  const reportDateInput = document.getElementById('report-date-picker');
  if (reportDateInput) {
    reportDateInput.addEventListener('change', async () => {
      AppState.selectedReportDate = reportDateInput.value || window.HolyStarDB.formatLocalDate();
      AppState.dailyReport = await window.HolyStarDB.getDailyReport(AppState.selectedReportDate);
      renderReportsView();
    });
  }

  document.getElementById('btn-report-today')?.addEventListener('click', async () => {
    AppState.selectedReportDate = window.HolyStarDB.formatLocalDate();
    if (reportDateInput) reportDateInput.value = AppState.selectedReportDate;
    AppState.dailyReport = await window.HolyStarDB.getDailyReport(AppState.selectedReportDate);
    renderReportsView();
  });

  document.getElementById('btn-open-close-day')?.addEventListener('click', openCloseDayModal);

  document.getElementById('btn-send-close-day-whatsapp')?.addEventListener('click', () => {
    const text = buildCloseDaySummaryText();
    const ownerPhone = cleanPhoneForWhatsApp(AppState.store?.owner_phone || '');
    const url = ownerPhone
      ? `https://wa.me/${ownerPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  document.getElementById('btn-send-close-day-sms')?.addEventListener('click', () => {
    const text = buildCloseDaySummaryText();
    const ownerPhone = AppState.store?.owner_phone || '';
    window.location.href = `sms:${ownerPhone}?body=${encodeURIComponent(text)}`;
  });

  document.getElementById('btn-copy-close-day')?.addEventListener('click', async () => {
    const text = buildCloseDaySummaryText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('Close-Day report copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy automatically. Select and copy the text box.', 'info');
    }
  });

  // Receipt Modal Share & Print
  document.getElementById('btn-share-receipt-whatsapp')?.addEventListener('click', () => {
    const text = document.getElementById('receipt-preview-body')?.textContent || '';
    const phone = cleanPhoneForWhatsApp(AppState.activeSaleReceipt?.customer_phone || '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  // Settings & License Activation
  document.getElementById('form-activate-token')?.addEventListener('submit', handleActivateToken);
  document.getElementById('form-shop-settings')?.addEventListener('submit', handleSaveShopSettings);
  document.getElementById('btn-simulate-expiry')?.addEventListener('click', handleSimulateExpiredLicense);
  document.getElementById('btn-export-backup')?.addEventListener('click', handleExportBackup);
  document.getElementById('input-import-backup')?.addEventListener('change', handleImportBackup);

  // Close Modal Buttons
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close-modal');
      if (target === 'modal-barcode-scanner') {
        stopBarcodeScanner();
      } else {
        document.getElementById(target)?.classList.add('hidden');
      }
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}
