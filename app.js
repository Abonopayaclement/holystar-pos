/**
 * Holy Star POS v2.3 - Unified Multi-Store SaaS Application Logic (app.js)
 * Features:
 * - Immediate non-blocking UI Event Binding (0ms button responsiveness)
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
  selectedPaymentMethod: 'Cash',
  selectedPosCategory: 'All',
  posSearchQuery: '',
  inventorySearchQuery: '',
  inventoryStockFilter: 'ALL',
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
  if (isNaN(d.getTime())) return '-';
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
  if (isNaN(d.getTime())) return '-';
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

function getProductThumb(p) {
  if (!p) return 'icon-192.png';
  if (p.image_url) return p.image_url;
  if (p.thumbnail) return p.thumbnail;
  if (typeof window.generateProductSvgThumbnail === 'function') {
    return window.generateProductSvgThumbnail(p.name, p.category);
  }
  return 'icon-192.png';
}

// ============================================================================
// INITIALIZATION & BOOTSTRAP (NON-BLOCKING UI BINDING FIRST)
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Bind all UI event listeners IMMEDIATELY so buttons are never dead
  try {
    bindUIEvents();
    registerServiceWorkerSafe();
  } catch (bindErr) {
    console.error('UI binding error:', bindErr);
  }

  // 2. Initialize IndexedDB and boot store session
  try {
    await window.HolyStarDB.init();
    AppState.selectedReportDate = window.HolyStarDB.formatLocalDate();

    const dateInput = document.getElementById('sales-date-picker');
    if (dateInput) {
      dateInput.value = AppState.selectedReportDate;
    }

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
    showToast('Database notice: ' + err.message, 'error');
    await showAuthOverlay();
  }
});

function registerServiceWorkerSafe() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }
}

async function checkAuthAndBoot() {
  const session = window.HolyStarDB.getActiveSession();
  const activeStore = session && session.store_id
    ? await window.HolyStarDB.getStoreById(session.store_id)
    : null;

  if (!session || !activeStore) {
    window.HolyStarDB.logoutSession();
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

  let stores = [];
  try {
    stores = await window.HolyStarDB.getAllStores();
  } catch (e) {
    stores = [];
  }

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
    switchAuthTab('login');
  } else {
    if (selectWrap) selectWrap.classList.add('hidden');
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
  populateExistingDebtorsDropdown();
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
  const clockBanner = document.getElementById('clock-tamper-banner');
  const clockMsg = document.getElementById('clock-tamper-msg');
  const expiredBanner = document.getElementById('expired-license-banner');
  const checkoutBtn = document.getElementById('btn-complete-sale');

  const { active, expired, tampered, daysLeft } = AppState.licenseStatus;

  if (pill && pillText) {
    pill.classList.remove('license-active', 'license-warning', 'license-locked');
    if (tampered) {
      pill.classList.add('license-locked');
      pillText.textContent = '🔒 Clock Tamper Locked';
    } else if (expired) {
      pill.classList.add('license-locked');
      pillText.textContent = '🔒 Subscription Expired';
    } else if (daysLeft <= 2) {
      pill.classList.add('license-warning');
      pillText.textContent = `⚠️ ${daysLeft} Day${daysLeft === 1 ? '' : 's'} Left`;
    } else {
      pill.classList.add('license-active');
      pillText.textContent = `✔ Active (${daysLeft}d left)`;
    }
  }

  if (clockBanner) {
    clockBanner.classList.toggle('hidden', !tampered);
    if (tampered && clockMsg && AppState.licenseStatus.message) {
      clockMsg.textContent = AppState.licenseStatus.message;
    }
  }

  if (expiredBanner) {
    expiredBanner.classList.toggle('hidden', tampered || !expired);
  }

  if (checkoutBtn) {
    const { totalAmount } = getCartTotals();
    if (!active) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = tampered ? '🔒 Locked (Fix Device Clock)' : '🔒 Locked (Renew License in Settings)';
    } else {
      checkoutBtn.disabled = AppState.cart.length === 0;
      checkoutBtn.textContent = `✅ Complete Sale (${formatGHS(totalAmount)})`;
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
  if (locEl) locEl.textContent = s.shop_location || s.location || 'Ghana';
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
    const barcodeStr = String(item.suggested_barcode || item.barcode || '');

    let score = 0;
    if (nameLower.startsWith(q)) score = 100;
    else if (nameLower.includes(q)) score = 80;
    else if (catLower.includes(q)) score = 45;
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
    const thumb = getProductThumb(m);
    const barcode = m.suggested_barcode || m.barcode || '';
    return `
      <div class="autocomplete-item" data-catalog-idx="${idx}" data-catalog-name="${escapeHtml(m.name)}">
        <img src="${thumb}" alt="" />
        <div style="flex:1; min-width:0;">
          <div class="autocomplete-item-title">${escapeHtml(m.name)}</div>
          <div class="autocomplete-item-meta">${escapeHtml(m.category)} ${barcode ? '• Barcode: ' + escapeHtml(barcode) : ''}</div>
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
  const nameInput = document.getElementById('prod-name');
  const catInput = document.getElementById('prod-category');
  const barcodeInput = document.getElementById('prod-barcode');
  const thumbPreview = document.getElementById('prod-image-preview');
  const imgDataInput = document.getElementById('prod-image-data');

  if (nameInput) nameInput.value = item.name;
  if (catInput) catInput.value = item.category;
  const suggestedCode = item.suggested_barcode || item.barcode || '';
  if (barcodeInput && !barcodeInput.value && suggestedCode) {
    barcodeInput.value = suggestedCode;
  }

  const thumb = getProductThumb(item);
  AppState.currentProductThumbnail = thumb;
  if (imgDataInput) imgDataInput.value = thumb;
  if (thumbPreview && thumb) {
    thumbPreview.src = thumb;
  }

  const costInput = document.getElementById('prod-cost');
  if (costInput) costInput.focus();
}

// ============================================================================
// CAMERA BARCODE & QR SCANNER (BarcodeDetector + Quick-Tap Simulator)
// ============================================================================

async function openBarcodeScanner(targetMode = 'POS') {
  AppState.barcodeScanner.targetMode = targetMode;
  const modal = document.getElementById('modal-barcode-scanner');
  const video = document.getElementById('scanner-video');
  const statusEl = document.getElementById('scanner-status-msg');
  const manualInput = document.getElementById('manual-barcode-input');
  const quickList = document.getElementById('scanner-quick-list');

  if (!modal) return;
  modal.classList.remove('hidden');

  if (manualInput) {
    manualInput.value = '';
    setTimeout(() => manualInput.focus(), 120);
  }

  // Populate quick-tap barcode simulator chips from store products or master catalog
  if (quickList) {
    const sampleSource = AppState.products.length > 0
      ? AppState.products.filter((p) => p.barcode).slice(0, 8)
      : (window.MASTER_CATALOG || []).slice(0, 8);

    quickList.innerHTML = sampleSource.map((item) => {
      const code = item.barcode || item.suggested_barcode || '6031100100010';
      return `<button type="button" class="btn btn-outline btn-sm btn-quick-barcode" data-code="${escapeHtml(code)}" style="font-size:0.72rem;">📊 ${escapeHtml(item.name.slice(0, 18))} (${escapeHtml(code)})</button>`;
    }).join('');

    quickList.querySelectorAll('.btn-quick-barcode').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleDetectedBarcode(btn.dataset.code);
      });
    });
  }

  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl) {
      statusEl.textContent = 'Camera unavailable or requires HTTPS. Type barcode below or tap a quick-test barcode.';
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
    } else if (statusEl) {
      statusEl.textContent = 'Camera active! Enter barcode digits below or tap a quick-test item.';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Camera permission not granted. Type barcode manually or tap a quick-test barcode below.';
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
  const video = document.getElementById('scanner-video');
  if (video) video.srcObject = null;
  document.getElementById('modal-barcode-scanner')?.classList.add('hidden');
}

function handleDetectedBarcode(code) {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return;

  const mode = AppState.barcodeScanner.targetMode;
  stopBarcodeScanner();

  if (mode === 'STOCK_INPUT') {
    const barcodeInput = document.getElementById('prod-barcode');
    if (barcodeInput) barcodeInput.value = cleanCode;

    if (Array.isArray(window.MASTER_CATALOG)) {
      const catMatch = window.MASTER_CATALOG.find(
        (m) => String(m.suggested_barcode || m.barcode) === cleanCode
      );
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
    showToast(`No item in your store with barcode "${cleanCode}". Click "+ Add Product" to add it!`, 'error');
  }
}

// ============================================================================
// TAB 1: POS CHECKOUT & CART LOGIC
// ============================================================================

function renderPosCategories() {
  const container = document.getElementById('pos-category-chips');
  if (!container) return;

  const categories = ['All', ...new Set(AppState.products.map((p) => p.category || 'General'))];
  container.innerHTML = categories
    .map((cat) => {
      const isActive = AppState.selectedPosCategory === cat ? 'active' : '';
      return `<button type="button" class="category-chip ${isActive}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    })
    .join('');

  container.querySelectorAll('.category-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      AppState.selectedPosCategory = btn.dataset.cat;
      renderPosCategories();
      renderPosProductGrid();
    });
  });
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
        <div style="font-size:2rem; margin-bottom:0.35rem;">📦</div>
        <p style="font-weight:800; color:var(--text-primary); margin-bottom:0.25rem;">
          ${AppState.products.length === 0 ? 'Your Store Inventory is Empty (0 Products)' : 'No matching products found'}
        </p>
        <p style="font-size:0.82rem; margin-bottom:0.75rem;">
          ${AppState.products.length === 0
            ? 'Click "➕ Add Product" above to add your first item (with smart Ghanaian product autocomplete!).'
            : 'Try clearing your search filter or switching category.'}
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const stock = Number(p.stock_qty || 0);
      const alertLevel = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);
      const isOut = stock <= 0;
      const isLow = !isOut && stock <= alertLevel;

      let stockBadgeClass = 'badge-success';
      let stockLabel = `${stock} in stock`;
      if (isOut) {
        stockBadgeClass = 'badge-danger';
        stockLabel = 'Out of Stock';
      } else if (isLow) {
        stockBadgeClass = 'badge-warning';
        stockLabel = `Low: ${stock} left`;
      }

      const inCartItem = AppState.cart.find((c) => c.id === p.id);
      const inCartBadge = inCartItem ? `<span class="badge badge-info" style="font-size:0.7rem;">In Cart: ${inCartItem.qty}</span>` : '';
      const thumbSrc = getProductThumb(p);

      return `
        <div class="product-card ${isOut ? 'out-of-stock' : ''}" data-product-id="${escapeHtml(p.id)}">
          <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.45rem;">
            <img src="${thumbSrc}" class="product-thumb-sm" alt="" />
            <div style="flex:1; min-width:0;">
              <div class="product-category-tag">${escapeHtml(p.category || 'General')}</div>
              <div class="product-name">${escapeHtml(p.name)}</div>
            </div>
          </div>
          <div class="product-meta-row">
            <span class="product-price">${formatGHS(p.selling_price)}</span>
            <div style="display:flex; align-items:center; gap:0.25rem; flex-wrap:wrap;">
              ${inCartBadge}
              <span class="badge ${stockBadgeClass}">${stockLabel}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('.product-card').forEach((tile) => {
    tile.addEventListener('click', () => {
      addToCart(tile.dataset.productId);
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

  const existing = AppState.cart.find((item) => item.id === productId);
  if (existing) {
    if (existing.qty + 1 > available) {
      showToast(`Cannot exceed available stock (${available}) for "${product.name}".`, 'error');
      return;
    }
    existing.qty += 1;
  } else {
    AppState.cart.push({
      id: product.id,
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

  const idx = AppState.cart.findIndex((c) => c.id === productId);
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
  const countEl = document.getElementById('cart-total-items');
  const totalEl = document.getElementById('cart-total-amount');

  if (!container) return;

  const { totalAmount, totalItemsCount } = getCartTotals();

  if (countEl) countEl.textContent = String(totalItemsCount);
  if (totalEl) totalEl.textContent = formatGHS(totalAmount);

  if (AppState.cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state">Cart is empty. Tap any product or scan a barcode to add it.</div>
    `;
  } else {
    container.innerHTML = AppState.cart
      .map((item) => {
        const lineSubtotal = Number((item.selling_price * item.qty).toFixed(2));
        return `
          <div class="cart-item" data-cart-id="${escapeHtml(item.id)}">
            <div class="cart-item-info">
              <div class="cart-item-title">${escapeHtml(item.name)}</div>
              <div class="cart-item-price">${formatGHS(item.selling_price)} × ${item.qty} = <strong>${formatGHS(lineSubtotal)}</strong></div>
            </div>
            <div class="cart-qty-controls">
              <button type="button" class="qty-btn btn-qty-dec" data-id="${escapeHtml(item.id)}">−</button>
              <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.max_stock}" data-id="${escapeHtml(item.id)}" />
              <button type="button" class="qty-btn btn-qty-inc" data-id="${escapeHtml(item.id)}">+</button>
              <button type="button" class="btn-remove-item" title="Remove item" data-id="${escapeHtml(item.id)}">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-qty-dec').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = AppState.cart.find((c) => c.id === id);
        if (item) updateCartItemQty(id, item.qty - 1);
      });
    });

    container.querySelectorAll('.btn-qty-inc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = AppState.cart.find((c) => c.id === id);
        if (item) updateCartItemQty(id, item.qty + 1);
      });
    });

    container.querySelectorAll('.qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        updateCartItemQty(input.dataset.id, input.value);
      });
    });

    container.querySelectorAll('.btn-remove-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateCartItemQty(btn.dataset.id, 0);
      });
    });
  }

  updatePaymentCalculations();
  renderLicenseBannerAndPill();
}

function populateExistingDebtorsDropdown() {
  const select = document.getElementById('credit-existing-select');
  if (!select) return;

  select.innerHTML = `<option value="">-- New Customer or Select Existing (${AppState.debtors.length}) --</option>` +
    AppState.debtors.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.phone)} • Owed: ${formatGHS(d.total_owed)})</option>`).join('');
}

function updatePaymentCalculations() {
  const method = AppState.selectedPaymentMethod || 'Cash';
  const { totalAmount } = getCartTotals();

  const cashBox = document.getElementById('cash-calculator-box');
  const creditBox = document.getElementById('credit-customer-fields');

  if (cashBox) cashBox.classList.toggle('hidden', method !== 'Cash');
  if (creditBox) creditBox.classList.toggle('hidden', method !== 'Credit');

  const tenderedInput = document.getElementById('cash-tendered-input');
  const changeDisplay = document.getElementById('cash-change-output');
  if (tenderedInput && changeDisplay) {
    const tenderedVal = tenderedInput.value === '' ? totalAmount : Number(tenderedInput.value);
    const change = Math.max(0, tenderedVal - totalAmount);
    changeDisplay.textContent = formatGHS(change);
  }

  const depositInput = document.getElementById('credit-initial-deposit');
  const balanceDisplay = document.getElementById('credit-balance-preview-amount');
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

  const paymentMethod = AppState.selectedPaymentMethod || 'Cash';
  const { totalAmount } = getCartTotals();

  const tenderedInput = document.getElementById('cash-tendered-input');
  const cashTendered = tenderedInput && tenderedInput.value !== '' ? Number(tenderedInput.value) : totalAmount;

  if (paymentMethod === 'Cash' && cashTendered < totalAmount) {
    showToast(`Cash given (${formatGHS(cashTendered)}) is less than total due (${formatGHS(totalAmount)}). Select Credit if customer is paying partially.`, 'error');
    return;
  }

  const creditDetails = {
    customerName: document.getElementById('credit-customer-name')?.value || '',
    customerPhone: document.getElementById('credit-customer-phone')?.value || '',
    customerLocation: document.getElementById('credit-customer-location')?.value || '',
    initialDeposit: Number(document.getElementById('credit-initial-deposit')?.value || 0),
    depositMethod: document.getElementById('credit-deposit-method')?.value || 'Cash',
    dueDate: document.getElementById('credit-due-date')?.value || ''
  };

  try {
    const result = await window.HolyStarDB.processAtomicCheckout({
      cartItems: AppState.cart,
      paymentMethod,
      creditDetails
    });

    AppState.cart = [];
    if (tenderedInput) tenderedInput.value = '';
    if (document.getElementById('credit-existing-select')) document.getElementById('credit-existing-select').value = '';
    if (document.getElementById('credit-customer-name')) document.getElementById('credit-customer-name').value = '';
    if (document.getElementById('credit-customer-phone')) document.getElementById('credit-customer-phone').value = '';
    if (document.getElementById('credit-customer-location')) document.getElementById('credit-customer-location').value = '';
    if (document.getElementById('credit-initial-deposit')) document.getElementById('credit-initial-deposit').value = '0';

    selectPaymentMethod('Cash');

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'checkout_sale');
    showSaleReceiptModal(result.sale);
    showToast(`Sale ${result.sale.id} completed (${formatGHS(result.sale.total_amount)})!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to complete sale.', 'error');
  }
}

function selectPaymentMethod(method) {
  AppState.selectedPaymentMethod = method;
  document.querySelectorAll('.pay-method-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  updatePaymentCalculations();
}

function showSaleReceiptModal(sale) {
  if (!sale) return;
  AppState.activeSaleReceipt = sale;
  const modal = document.getElementById('modal-receipt');
  const content = document.getElementById('printable-receipt');
  if (!modal || !content) return;

  const s = AppState.store || {};
  const itemsHtml = (sale.items || [])
    .map((item) => `
      <div class="receipt-line">
        <span>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}</span>
        <strong>${formatGHS(item.subtotal)}</strong>
      </div>
    `)
    .join('');

  let creditHtml = '';
  if (sale.payment_method === 'Credit' && sale.customer) {
    creditHtml = `
      <div class="receipt-divider"></div>
      <div class="receipt-line"><span>Customer:</span><strong>${escapeHtml(sale.customer.name)}</strong></div>
      <div class="receipt-line"><span>Phone:</span><span>${escapeHtml(sale.customer.phone)}</span></div>
      <div class="receipt-line"><span>Initial Deposit:</span><span>${formatGHS(sale.initial_deposit)}</span></div>
      <div class="receipt-line"><span>Balance Owed:</span><strong>${formatGHS(sale.balance_owed)}</strong></div>
    `;
  }

  content.innerHTML = `
    <div class="receipt-header">
      <h4>★ ${escapeHtml(s.store_name || 'HOLY STAR POS')} ★</h4>
      <div>${escapeHtml(s.shop_location || s.location || 'Ghana')}</div>
      <div>Tel: ${escapeHtml(s.owner_phone || '-')} • ID: ${escapeHtml(s.store_id || 'HS-0000')}</div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-line"><span>Receipt:</span><strong>${escapeHtml(sale.id)}</strong></div>
    <div class="receipt-line"><span>Date:</span><span>${escapeHtml(formatDateTime(sale.timestamp))}</span></div>
    <div class="receipt-line"><span>Payment:</span><strong>${escapeHtml(sale.payment_method)}</strong></div>
    <div class="receipt-divider"></div>
    ${itemsHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-line receipt-total">
      <span>TOTAL PAID/DUE:</span>
      <span>${formatGHS(sale.total_amount)}</span>
    </div>
    ${creditHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-footer">Thank you for shopping with us!</div>
  `;

  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 2: INVENTORY & STOCK MANAGEMENT
// ============================================================================

function renderInventoryView() {
  const tbody = document.getElementById('inventory-table-body');
  const totalCountEl = document.getElementById('inv-metric-count');
  const stockCostEl = document.getElementById('inv-metric-cost');
  const retailValEl = document.getElementById('inv-metric-retail');
  const estMarginEl = document.getElementById('inv-metric-margin');
  const alertsCountEl = document.getElementById('inv-metric-alerts');
  const navBadgeStock = document.getElementById('nav-badge-stock');

  if (!tbody) return;

  let lowOrOutCount = 0;
  let totalCostVal = 0;
  let totalRetailVal = 0;
  let totalProjProfit = 0;

  for (const p of AppState.products) {
    const qty = Number(p.stock_qty || 0);
    const alertLvl = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);
    const cost = Number(p.cost_price || 0);
    const sell = Number(p.selling_price || 0);

    if (qty <= alertLvl) lowOrOutCount++;
    totalCostVal += cost * qty;
    totalRetailVal += sell * qty;
    totalProjProfit += (sell - cost) * qty;
  }

  if (totalCountEl) totalCountEl.textContent = String(AppState.products.length);
  if (stockCostEl) stockCostEl.textContent = formatGHS(totalCostVal);
  if (retailValEl) retailValEl.textContent = formatGHS(totalRetailVal);
  if (estMarginEl) estMarginEl.textContent = `Est. Profit: ${formatGHS(totalProjProfit)}`;
  if (alertsCountEl) alertsCountEl.textContent = String(lowOrOutCount);

  if (navBadgeStock) {
    navBadgeStock.textContent = String(lowOrOutCount);
    navBadgeStock.classList.toggle('hidden', lowOrOutCount === 0);
  }

  const query = AppState.inventorySearchQuery.trim().toLowerCase();
  const stockFilter = AppState.inventoryStockFilter || 'ALL';

  const filtered = AppState.products.filter((p) => {
    const qty = Number(p.stock_qty || 0);
    const alertLvl = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);
    if (stockFilter === 'OUT' && qty > 0) return false;
    if (stockFilter === 'LOW' && (qty <= 0 || qty > alertLvl)) return false;

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
        <td colspan="9" style="text-align:center; padding:2rem; color:var(--text-secondary);">
          ${AppState.products.length === 0
            ? 'Your store has 0 products. Click <strong>"➕ Add New Product"</strong> to add items (with smart Ghanaian product autocomplete!).'
            : 'No products match your current filter.'}
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
      const alertLvl = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);

      let statusBadge = `<span class="badge badge-success">In Stock</span>`;
      if (qty <= 0) {
        statusBadge = `<span class="badge badge-danger">Out of Stock</span>`;
      } else if (qty <= alertLvl) {
        statusBadge = `<span class="badge badge-warning">Low Stock</span>`;
      }

      const thumbSrc = getProductThumb(p);

      return `
        <tr>
          <td>
            <img src="${thumbSrc}" class="product-thumb-sm" alt="" />
          </td>
          <td>
            <div style="font-weight:800; color:var(--text-primary);">${escapeHtml(p.name)}</div>
            ${p.barcode ? `<div style="font-size:0.74rem; color:var(--text-secondary); font-family:monospace;">📊 ${escapeHtml(p.barcode)}</div>` : ''}
          </td>
          <td><span class="badge badge-neutral">${escapeHtml(p.category || 'General')}</span></td>
          <td style="font-weight:600;">${formatGHS(cost)}</td>
          <td style="font-weight:800; color:var(--primary);">${formatGHS(sell)}</td>
          <td>
            <span style="font-weight:700; color:${unitProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${formatGHS(unitProfit)} (${marginPct}%)
            </span>
          </td>
          <td style="font-weight:900; font-size:0.95rem;">${qty}</td>
          <td>${statusBadge}</td>
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
  const modal = document.getElementById('modal-product');
  const titleEl = document.getElementById('modal-product-title');
  const idInput = document.getElementById('prod-id');
  const imgDataInput = document.getElementById('prod-image-data');
  const nameInput = document.getElementById('prod-name');
  const catInput = document.getElementById('prod-category');
  const barcodeInput = document.getElementById('prod-barcode');
  const costInput = document.getElementById('prod-cost');
  const sellInput = document.getElementById('prod-price');
  const qtyInput = document.getElementById('prod-stock');
  const alertInput = document.getElementById('prod-threshold');
  const thumbPreview = document.getElementById('prod-image-preview');
  const dropdown = document.getElementById('catalog-autocomplete-list');

  if (!modal) return;
  if (dropdown) dropdown.classList.add('hidden');

  if (productId) {
    const p = AppState.products.find((item) => item.id === productId);
    if (!p) return;
    if (titleEl) titleEl.textContent = '✏️ Edit Product & Pricing';
    if (idInput) idInput.value = p.id;
    if (nameInput) nameInput.value = p.name;
    if (catInput) catInput.value = p.category || 'General';
    if (barcodeInput) barcodeInput.value = p.barcode || '';
    if (costInput) costInput.value = p.cost_price;
    if (sellInput) sellInput.value = p.selling_price;
    if (qtyInput) qtyInput.value = p.stock_qty;
    if (alertInput) alertInput.value = p.low_stock_threshold ?? p.low_stock_alert ?? 5;
    AppState.currentProductThumbnail = getProductThumb(p);
    if (imgDataInput) imgDataInput.value = AppState.currentProductThumbnail;
    if (thumbPreview) thumbPreview.src = AppState.currentProductThumbnail;
  } else {
    if (titleEl) titleEl.textContent = '➕ Add New Product';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = '';
    if (barcodeInput) barcodeInput.value = '';
    if (costInput) costInput.value = '';
    if (sellInput) sellInput.value = '';
    if (qtyInput) qtyInput.value = '10';
    if (alertInput) alertInput.value = '5';
    AppState.currentProductThumbnail = typeof window.generateProductSvgThumbnail === 'function'
      ? window.generateProductSvgThumbnail('New Item', 'General')
      : 'icon-192.png';
    if (imgDataInput) imgDataInput.value = AppState.currentProductThumbnail;
    if (thumbPreview) thumbPreview.src = AppState.currentProductThumbnail;
  }

  updateLiveUnitProfitPreview();
  modal.classList.remove('hidden');
  if (nameInput) setTimeout(() => nameInput.focus(), 80);
}

function updateLiveUnitProfitPreview() {
  const cost = Number(document.getElementById('prod-cost')?.value || 0);
  const sell = Number(document.getElementById('prod-price')?.value || 0);
  const previewEl = document.getElementById('prod-profit-preview');
  if (!previewEl) return;

  const profit = Number((sell - cost).toFixed(2));
  const pct = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
  previewEl.textContent = `Unit Profit: ${formatGHS(profit)} (${pct}%)`;
  previewEl.style.color = profit >= 0 ? '#166534' : '#991b1b';
}

async function handleSaveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id')?.value || '';
  const name = document.getElementById('prod-name')?.value || '';
  const category = document.getElementById('prod-category')?.value || 'General';
  const barcode = document.getElementById('prod-barcode')?.value || '';
  const cost_price = document.getElementById('prod-cost')?.value;
  const selling_price = document.getElementById('prod-price')?.value;
  const stock_qty = document.getElementById('prod-stock')?.value;
  const low_stock_threshold = document.getElementById('prod-threshold')?.value || 5;

  try {
    const saved = await window.HolyStarDB.saveProduct({
      id: id || undefined,
      name,
      category,
      barcode,
      image_url: AppState.currentProductThumbnail || '',
      cost_price,
      selling_price,
      stock_qty,
      low_stock_threshold
    });

    document.getElementById('modal-product')?.classList.add('hidden');
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

  const idInput = document.getElementById('restock-prod-id');
  const nameEl = document.getElementById('restock-prod-name');
  const curQtyEl = document.getElementById('restock-current-qty');
  const addQtyInput = document.getElementById('restock-add-qty');

  if (idInput) idInput.value = product.id;
  if (nameEl) nameEl.textContent = product.name;
  if (curQtyEl) curQtyEl.textContent = String(product.stock_qty);
  if (addQtyInput) addQtyInput.value = '10';

  document.getElementById('modal-restock')?.classList.remove('hidden');
  if (addQtyInput) setTimeout(() => addQtyInput.focus(), 80);
}

async function handleRestockSubmit(e) {
  e.preventDefault();
  const productId = document.getElementById('restock-prod-id')?.value;
  const addQty = document.getElementById('restock-add-qty')?.value;

  try {
    const updated = await window.HolyStarDB.restockProduct(productId, addQty);
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
    AppState.cart = AppState.cart.filter((c) => c.id !== productId);
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
  const totalOwedEl = document.getElementById('debtors-total-unpaid');
  const unpaidCountEl = document.getElementById('debtors-unpaid-count');
  const recoveredEl = document.getElementById('debtors-total-recovered');
  const navBadgeDebtors = document.getElementById('nav-badge-debtors');

  if (!tbody) return;

  let totalOutstanding = 0;
  let unpaidCustomers = 0;
  let totalRecovered = 0;

  for (const d of AppState.debtors) {
    const owed = Number(d.total_owed || 0);
    totalRecovered += Number(d.total_paid || 0);
    if (owed > 0) {
      totalOutstanding += owed;
      unpaidCustomers++;
    }
  }

  if (totalOwedEl) totalOwedEl.textContent = formatGHS(totalOutstanding);
  if (unpaidCountEl) unpaidCountEl.textContent = String(unpaidCustomers);
  if (recoveredEl) recoveredEl.textContent = formatGHS(totalRecovered);

  if (navBadgeDebtors) {
    navBadgeDebtors.textContent = String(unpaidCustomers);
    navBadgeDebtors.classList.toggle('hidden', unpaidCustomers === 0);
  }

  const query = AppState.debtorSearchQuery.trim().toLowerCase();
  const statusFilter = AppState.debtorFilter || 'ALL';

  const filtered = AppState.debtors.filter((d) => {
    const owed = Number(d.total_owed || 0);
    if (statusFilter === 'Unpaid' && owed <= 0) return false;
    if (statusFilter === 'Cleared' && owed > 0) return false;

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
        <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);">
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

      return `
        <tr>
          <td>
            <div style="font-weight:800; color:var(--text-primary);">${escapeHtml(d.name)}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(getDebtorItemsSummaryText(d))}</div>
          </td>
          <td style="font-weight:700;">📞 ${escapeHtml(d.phone)}</td>
          <td>
            <span>📍 ${escapeHtml(d.location)}</span>
            ${d.due_date ? `<div style="font-size:0.73rem; color:var(--warning);">Due: ${escapeHtml(d.due_date)}</div>` : ''}
          </td>
          <td>
            <span style="font-weight:900; font-size:0.98rem; color:${isCleared ? 'var(--success)' : 'var(--danger)'};">
              ${formatGHS(owed)}
            </span>
          </td>
          <td style="font-size:0.78rem; color:var(--text-secondary);">${formatDateTime(d.updated_at)}</td>
          <td>
            ${isCleared
              ? `<span class="badge badge-success">✔ Cleared</span>`
              : `<span class="badge badge-danger">Unpaid</span>`}
          </td>
          <td>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              ${!isCleared
                ? `<button type="button" class="btn btn-primary btn-sm btn-pay-debt" data-id="${escapeHtml(d.id)}">💵 Pay</button>
                   <button type="button" class="btn btn-whatsapp btn-sm btn-remind-whatsapp" data-id="${escapeHtml(d.id)}">💬 WhatsApp</button>
                   <button type="button" class="btn btn-outline btn-sm btn-remind-sms" data-id="${escapeHtml(d.id)}">📩 SMS</button>`
                : ''}
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
    window.location.href = `sms:${debtor.phone}?body=${encodeURIComponent(message)}`;
  }
}

function openRecordPaymentModal(debtorId) {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  const idInput = document.getElementById('pay-debtor-id');
  const nameEl = document.getElementById('pay-debtor-name');
  const phoneEl = document.getElementById('pay-debtor-phone');
  const owedEl = document.getElementById('pay-debtor-current-owed');
  const amountInput = document.getElementById('pay-amount-input');
  const noteInput = document.getElementById('pay-note-input');

  if (idInput) idInput.value = debtor.id;
  if (nameEl) nameEl.textContent = debtor.name;
  if (phoneEl) phoneEl.textContent = `${debtor.phone} • ${debtor.location}`;
  if (owedEl) owedEl.textContent = formatGHS(debtor.total_owed);
  if (amountInput) {
    amountInput.value = debtor.total_owed;
    amountInput.max = debtor.total_owed;
  }
  if (noteInput) noteInput.value = '';

  document.getElementById('modal-debtor-payment')?.classList.remove('hidden');
  if (amountInput) setTimeout(() => amountInput.focus(), 80);
}

async function handleRecordDebtorPayment(e) {
  e.preventDefault();
  const debtorId = document.getElementById('pay-debtor-id')?.value;
  const amount = document.getElementById('pay-amount-input')?.value;
  const paymentMethod = document.getElementById('pay-method-select')?.value || 'Cash';
  const note = document.getElementById('pay-note-input')?.value || '';

  try {
    const { debtor, paymentEntry } = await window.HolyStarDB.recordDebtorPayment({
      debtorId,
      amount,
      paymentMethod,
      note
    });

    document.getElementById('modal-debtor-payment')?.classList.add('hidden');
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
  const name = document.getElementById('mdebtor-name')?.value;
  const phone = document.getElementById('mdebtor-phone')?.value;
  const location = document.getElementById('mdebtor-location')?.value;
  const amountOwed = document.getElementById('mdebtor-amount')?.value;
  const itemDescription = document.getElementById('mdebtor-desc')?.value;
  const dueDate = document.getElementById('mdebtor-due')?.value;

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
  const summaryEl = document.getElementById('history-debtor-summary');
  const listEl = document.getElementById('history-timeline-list');

  if (!modal || !listEl) return;

  if (titleEl) titleEl.textContent = `📜 Credit Ledger — ${debtor.name}`;
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div><strong>Phone:</strong> ${escapeHtml(debtor.phone)} • <strong>Location:</strong> ${escapeHtml(debtor.location)}</div>
      <div style="margin-top:0.25rem;"><strong>Total Paid:</strong> ${formatGHS(debtor.total_paid || 0)} • <strong>Balance Owed:</strong> <span style="color:var(--danger); font-weight:800;">${formatGHS(debtor.total_owed)}</span></div>
    `;
  }

  const history = Array.isArray(debtor.history) ? debtor.history : [];
  if (history.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-secondary);">No transactions logged.</p>`;
  } else {
    listEl.innerHTML = history
      .map((h) => {
        if (h.type === 'PAYMENT') {
          return `
            <div style="border-left:4px solid var(--success); background:var(--success-bg); padding:0.7rem; border-radius:6px;">
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
            <div style="border-left:4px solid var(--danger); background:var(--danger-bg); padding:0.7rem; border-radius:6px;">
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
          const custName = s.customer ? s.customer.name : (s.customer_name || '');
          let methodBadge = `<span class="badge badge-success">💵 Cash</span>`;
          if (s.payment_method === 'MoMo') {
            methodBadge = `<span class="badge badge-info">📱 MoMo</span>`;
          } else if (s.payment_method === 'Credit') {
            methodBadge = `<span class="badge badge-danger">📒 Credit ${custName ? `(${escapeHtml(custName)})` : ''}</span>`;
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

  const lowStockItems = AppState.products.filter(
    (p) => Number(p.stock_qty || 0) <= Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5)
  );
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
  const preview = document.getElementById('close-day-report-text');
  const phoneDisplay = document.getElementById('close-day-owner-phone-display');
  const waBtn = document.getElementById('btn-close-day-whatsapp');
  const smsBtn = document.getElementById('btn-close-day-sms');

  if (!modal || !preview) return;

  const text = buildCloseDaySummaryText();
  preview.textContent = text;

  const ownerPhone = AppState.store?.owner_phone || '';
  if (phoneDisplay) phoneDisplay.textContent = ownerPhone || 'Not set';

  const cleanPhone = cleanPhoneForWhatsApp(ownerPhone);
  if (waBtn) {
    waBtn.href = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  if (smsBtn) {
    smsBtn.href = `sms:${ownerPhone}?body=${encodeURIComponent(text)}`;
  }

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
      ? `<span style="color:var(--danger); font-weight:700;">⚠️ Clock Rollback Detected</span>`
      : `<span style="color:var(--success); font-weight:700;">✔ Verified</span>`;
  }

  const setShopId = document.getElementById('setting-shop-id');
  const setShopName = document.getElementById('setting-shop-name');
  const setOwnerPhone = document.getElementById('setting-owner-phone');
  const setShopLoc = document.getElementById('setting-shop-location');

  if (setShopId) setShopId.value = s.store_id || s.shop_id || 'HS-0000';
  if (setShopName) setShopName.value = s.store_name || s.shop_name || '';
  if (setOwnerPhone) setOwnerPhone.value = s.owner_phone || '';
  if (setShopLoc) setShopLoc.value = s.shop_location || s.location || '';

  const usedTokens = await window.HolyStarDB.getUsedTokens();
  const usedList = document.getElementById('used-tokens-list');
  if (usedList) {
    if (usedTokens.length === 0) {
      usedList.textContent = 'No tokens used yet.';
    } else {
      usedList.innerHTML = usedTokens
        .map((t) => `<div style="padding:0.2rem 0; border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(t.token_code || t.token)}</strong> (+${escapeHtml(t.plan_days)}d • #${escapeHtml(t.issue_code)}) — ${escapeHtml(formatDateTime(t.applied_at || t.activated_at))}</div>`)
        .join('');
    }
  }

  const telemetryPre = document.getElementById('telemetry-json-preview');
  if (telemetryPre) {
    const summary = await window.HolyStarDB.getStoreTelemetrySummary(s.store_id);
    telemetryPre.textContent = JSON.stringify(summary || {}, null, 2);
  }
}

function matchSubscriptionToken(shopId, enteredToken, optionalIssueCode, selectedPlanOption) {
  const candidateIssueCodes = [];
  if (optionalIssueCode) {
    candidateIssueCodes.push(optionalIssueCode);
  } else {
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
  const tokenKey = `${shopId}-${matchedDays}D-${matchedIssueCode}-${enteredToken}`;

  try {
    await window.HolyStarDB.applyLicenseToken({
      tokenKey,
      tokenCode: enteredToken,
      issueCode: matchedIssueCode,
      planDays: matchedDays,
      shopId
    });

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
  const shopName = String(document.getElementById('setting-shop-name')?.value || '').trim();
  const ownerPhone = String(document.getElementById('setting-owner-phone')?.value || '').trim();
  const location = String(document.getElementById('setting-shop-location')?.value || '').trim();

  if (!shopName) {
    showToast('Store Name cannot be empty.', 'error');
    return;
  }

  try {
    await window.HolyStarDB.saveSettings({
      store_name: shopName,
      shop_name: shopName,
      owner_phone: ownerPhone,
      shop_location: location,
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
    await window.HolyStarDB.saveSettings({
      license_expiry: Date.now() - 60 * 1000,
      license_plan: 'Expired (Simulated for Testing)'
    });
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'license_expired_sim');
    showToast('License set to Expired! Generate an Unlock Token in Super-Admin to unlock.', 'info');
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

async function handleRestoreBackupClick() {
  const fileInput = document.getElementById('restore-file-input');
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast('Please select a HolyStarPOS .json backup file first.', 'error');
    return;
  }

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!confirm(`Restore backup from ${json.exported_at || 'file'}?`)) {
      return;
    }

    await window.HolyStarDB.restoreFullBackup(json);
    fileInput.value = '';
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'backup_restored');
    showToast('Database backup restored successfully!', 'success');
  } catch (err) {
    showToast('Restore failed: ' + err.message, 'error');
  }
}

// ============================================================================
// UI EVENT BINDINGS (100% NULL-SAFE & MATCHED TO INDEX.HTML)
// ============================================================================

function bindUIEvents() {
  // 1. Auth Tabs
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
      const passEl = document.getElementById('login-password');
      if (passEl) passEl.value = '';
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
    const store_name = document.getElementById('reg-store-name')?.value;
    const store_category = document.getElementById('reg-store-category')?.value;
    const owner_name = document.getElementById('reg-owner-name')?.value;
    const owner_phone = document.getElementById('reg-owner-phone')?.value;
    const owner_password = document.getElementById('reg-owner-password')?.value;
    const store_location = document.getElementById('reg-store-location')?.value;

    try {
      AppState.cart = [];
      AppState.products = [];
      AppState.debtors = [];
      AppState.dailyReport = null;

      const { store, session } = await window.HolyStarDB.registerNewStore({
        store_name,
        store_category,
        owner_name,
        owner_phone,
        owner_password,
        store_location
      });

      AppState.store = store;
      AppState.session = session;
      e.target.reset();
      hideAuthOverlay();
      await refreshAllData();
      window.HolyStarDB.syncTelemetryHeartbeat(store.store_id, 'store_registered');
      showToast(`🎉 Store "${store.store_name}" (${store.store_id}) created with 0 items! 7-Day Free Trial active.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not create store.', 'error');
    }
  });

  // 2. Log Out / Switch Store Button (Immediate Response)
  document.getElementById('btn-logout-store')?.addEventListener('click', async () => {
    window.HolyStarDB.logoutSession();
    AppState.session = null;
    AppState.store = null;
    AppState.cart = [];
    AppState.products = [];
    AppState.debtors = [];
    await showAuthOverlay();
    showToast('Logged out of store.', 'info');
  });

  // 3. Main Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      switchTab(tabBtn.dataset.tab);
    });
  });

  document.getElementById('license-status-pill')?.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  document.getElementById('btn-banner-unlock')?.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  document.getElementById('btn-recheck-clock')?.addEventListener('click', async () => {
    await verifyClockAndLicenseState();
    showToast('Device clock re-checked.', 'info');
  });

  // 4. Add Product Modal Triggers (Both POS Tab & Inventory Tab)
  document.getElementById('btn-pos-add-stock')?.addEventListener('click', () => {
    openProductModal(null);
  });

  document.getElementById('btn-open-product-modal')?.addEventListener('click', () => {
    openProductModal(null);
  });

  // 5. POS Search & Barcode Scanner
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

  document.getElementById('btn-modal-scan-barcode')?.addEventListener('click', () => {
    openBarcodeScanner('STOCK_INPUT');
  });

  document.getElementById('form-manual-barcode')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('manual-barcode-input')?.value;
    if (code) handleDetectedBarcode(code);
  });

  document.getElementById('btn-close-scanner')?.addEventListener('click', stopBarcodeScanner);
  document.getElementById('btn-cancel-scanner')?.addEventListener('click', stopBarcodeScanner);

  // 6. Cart & Payment Method Controls
  document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
    AppState.cart = [];
    renderCart();
    renderPosProductGrid();
  });

  document.querySelectorAll('.pay-method-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectPaymentMethod(btn.dataset.method || 'Cash');
    });
  });

  document.getElementById('cash-tendered-input')?.addEventListener('input', updatePaymentCalculations);
  document.getElementById('credit-initial-deposit')?.addEventListener('input', updatePaymentCalculations);

  document.getElementById('credit-existing-select')?.addEventListener('change', (e) => {
    const debtorId = e.target.value;
    const debtor = AppState.debtors.find((d) => d.id === debtorId);
    if (debtor) {
      document.getElementById('credit-customer-name').value = debtor.name || '';
      document.getElementById('credit-customer-phone').value = debtor.phone || '';
      document.getElementById('credit-customer-location').value = debtor.location || '';
    }
  });

  document.getElementById('btn-complete-sale')?.addEventListener('click', handleCompleteSale);

  // 7. Inventory Search, Filter & Product Form
  const invSearch = document.getElementById('inv-search-input');
  if (invSearch) {
    invSearch.addEventListener('input', () => {
      AppState.inventorySearchQuery = invSearch.value;
      renderInventoryView();
    });
  }

  const invFilter = document.getElementById('inv-stock-filter');
  if (invFilter) {
    invFilter.addEventListener('change', () => {
      AppState.inventoryStockFilter = invFilter.value;
      renderInventoryView();
    });
  }

  document.getElementById('prod-cost')?.addEventListener('input', updateLiveUnitProfitPreview);
  document.getElementById('prod-price')?.addEventListener('input', updateLiveUnitProfitPreview);
  document.getElementById('form-product')?.addEventListener('submit', handleSaveProductForm);
  document.getElementById('form-restock')?.addEventListener('submit', handleRestockSubmit);

  // Smart Catalog Autocomplete on `#prod-name`
  const prodNameInput = document.getElementById('prod-name');
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
  document.getElementById('prod-image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 160);
      AppState.currentProductThumbnail = dataUrl;
      const preview = document.getElementById('prod-image-preview');
      const imgData = document.getElementById('prod-image-data');
      if (preview) preview.src = dataUrl;
      if (imgData) imgData.value = dataUrl;
      showToast('Product photo attached!', 'success');
    } catch (err) {
      showToast('Failed to process photo.', 'error');
    }
  });

  // 8. Debtors Filter, Search & Modals
  const debtorSearch = document.getElementById('debtors-search-input');
  if (debtorSearch) {
    debtorSearch.addEventListener('input', () => {
      AppState.debtorSearchQuery = debtorSearch.value;
      renderDebtorsView();
    });
  }

  const debtorStatusSelect = document.getElementById('debtors-status-filter');
  if (debtorStatusSelect) {
    debtorStatusSelect.addEventListener('change', () => {
      AppState.debtorFilter = debtorStatusSelect.value;
      renderDebtorsView();
    });
  }

  document.getElementById('btn-open-manual-debtor-modal')?.addEventListener('click', () => {
    document.getElementById('modal-manual-debtor')?.classList.remove('hidden');
  });

  document.getElementById('form-manual-debtor')?.addEventListener('submit', handleAddManualDebtor);
  document.getElementById('form-debtor-payment')?.addEventListener('submit', handleRecordDebtorPayment);

  document.getElementById('btn-pay-full-balance')?.addEventListener('click', () => {
    const debtorId = document.getElementById('pay-debtor-id')?.value;
    const debtor = AppState.debtors.find((d) => d.id === debtorId);
    const amountInput = document.getElementById('pay-amount-input');
    if (debtor && amountInput) {
      amountInput.value = debtor.total_owed;
    }
  });

  // 9. Sales Reports & Close-Day Modal
  const reportDateInput = document.getElementById('sales-date-picker');
  if (reportDateInput) {
    reportDateInput.addEventListener('change', async () => {
      AppState.selectedReportDate = reportDateInput.value || window.HolyStarDB.formatLocalDate();
      AppState.dailyReport = await window.HolyStarDB.getDailyReport(AppState.selectedReportDate);
      renderReportsView();
    });
  }

  document.getElementById('btn-sales-today')?.addEventListener('click', async () => {
    AppState.selectedReportDate = window.HolyStarDB.formatLocalDate();
    if (reportDateInput) reportDateInput.value = AppState.selectedReportDate;
    AppState.dailyReport = await window.HolyStarDB.getDailyReport(AppState.selectedReportDate);
    renderReportsView();
  });

  document.getElementById('btn-open-close-day-modal')?.addEventListener('click', openCloseDayModal);

  document.getElementById('btn-close-day-copy')?.addEventListener('click', async () => {
    const text = buildCloseDaySummaryText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('Close-Day report copied to clipboard!', 'success');
    } catch {
      showToast('Select and copy the report text above.', 'info');
    }
  });

  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  // 10. Settings & License Activation
  document.getElementById('form-activate-token')?.addEventListener('submit', handleActivateToken);
  document.getElementById('form-shop-settings')?.addEventListener('submit', handleSaveShopSettings);
  document.getElementById('btn-simulate-expiry')?.addEventListener('click', handleSimulateExpiredLicense);
  document.getElementById('btn-export-backup')?.addEventListener('click', handleExportBackup);
  document.getElementById('btn-restore-backup')?.addEventListener('click', handleRestoreBackupClick);

  document.getElementById('btn-copy-telemetry')?.addEventListener('click', async () => {
    const text = document.getElementById('telemetry-json-preview')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      showToast('Telemetry JSON copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy automatically.', 'info');
    }
  });

  // 11. Universal Modal Close Buttons (`[data-close]` and `[data-close-modal]`)
  document.querySelectorAll('[data-close], [data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close') || btn.getAttribute('data-close-modal');
      if (target === 'modal-barcode-scanner') {
        stopBarcodeScanner();
      } else if (target) {
        document.getElementById(target)?.classList.add('hidden');
      }
    });
  });
}

function switchTab(tabId) {
  if (!tabId) return;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}
