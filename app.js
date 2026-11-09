/**
 * Holy Star POS v3.0 - Application Logic (app.js)
 * Features:
 * - Clean 1-Word Navigation & Decluttered Header
 * - Compact 5-Per-Row Product Grid
 * - Smart Cash Shortfall -> Automatic Debtor Prompt & Optional Non-Blocking Receipt Banner
 * - Sales Period Filters (Today, Pick Date, This Week, This Month, All-Time) + Close Day Archive & Sync Prompt
 * - Manual `Sync Database Online` with Offline Connection Alert
 * - Cross-Device Cloud Login & Hydration across Phone and PC
 */

const HOLY_STAR_SECRET = 'HOLY_STAR_SECRET_2026';
const ALPHANUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const OFFLINE_SYNC_ALERT_MSG =
  'You do not have an active internet connection. Please connect to the internet before updating your database online.';

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
  closedDays: [],
  cart: [],
  selectedPaymentMethod: 'Cash',
  selectedPosCategory: 'All',
  posSearchQuery: '',
  inventorySearchQuery: '',
  inventoryStockFilter: 'ALL',
  debtorFilter: 'ALL',
  debtorSearchQuery: '',
  activeSaleReceipt: null,
  selectedSalesPeriod: 'TODAY', // 'TODAY' | 'DATE' | 'WEEK' | 'MONTH' | 'ALL'
  selectedReportDate: '',
  dailyReport: null,
  shortfallCashGiven: 0,
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
    targetMode: 'POS',
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

function validate10DigitPhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  return /^\d{10}$/.test(clean) ? clean : null;
}

function initPhoneInputsFormatting() {
  const ids = [
    'reg-owner-phone',
    'momo-phone-input',
    'credit-customer-phone',
    'shortfall-cust-phone',
    'mdebtor-phone',
    'setting-owner-phone'
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('maxlength', '10');
      el.setAttribute('inputmode', 'numeric');
      el.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      });
    }
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const iconSvg = type === 'success'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : type === 'error'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  toast.innerHTML = `<span style="display:flex; align-items:center;">${iconSvg}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3400);
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

function compressImageToDataUrl(file, maxSize = 140) {
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
  try {
    if (window.screen?.orientation?.lock) {
      window.screen.orientation.lock('portrait').catch(() => {});
    }
    bindUIEvents();
    initPhoneInputsFormatting();
    initFloatingDraggableCart();
    registerServiceWorkerSafe();
    updateConnectionStatusDot();
  } catch (bindErr) {
    console.error('UI binding error:', bindErr);
  }

  try {
    await window.HolyStarDB.init();
    AppState.selectedReportDate = window.HolyStarDB.formatLocalDate();

    const dateInput = document.getElementById('sales-date-picker');
    if (dateInput) {
      dateInput.value = AppState.selectedReportDate;
    }

    await checkAuthAndBoot();

    window.addEventListener('online', () => {
      updateConnectionStatusDot();
      const storeId = window.HolyStarDB.getActiveStoreId();
      if (storeId) {
        window.HolyStarDB.syncTelemetryHeartbeat(storeId, 'network_reconnected');
      }
    });

    window.addEventListener('offline', () => {
      updateConnectionStatusDot();
    });

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

function updateConnectionStatusDot() {
  const dot = document.getElementById('header-conn-dot');
  if (!dot) return;
  const isOnline = typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true;
  dot.classList.toggle('online', isOnline);
  dot.classList.toggle('offline', !isOnline);
  dot.title = isOnline ? 'Online' : 'Offline Mode';
}

function registerServiceWorkerSafe() {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js?v=3.4').then((reg) => {
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

  // If this is demo store "test account 1", ensure rich sample products are loaded once
  await window.HolyStarDB.ensureDemoStoreSeeded(activeStore.store_id);

  await refreshAllData();

  // Pull & merge latest cloud items for this store on boot so Phone and PC always match!
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    window.HolyStarDB.pullAndHydrateStoreFromCloud(activeStore.store_id)
      .then(async (pulled) => {
        if (pulled) {
          await refreshAllData();
        }
        await window.HolyStarDB.syncTelemetryHeartbeat(activeStore.store_id, 'session_resume');
      })
      .catch(() => {});
  }
}

function populateLoginStoreDropdown(storesList) {
  const selectWrap = document.getElementById('login-saved-stores-wrap');
  const selectEl = document.getElementById('login-saved-store-select');
  const loginIdInput = document.getElementById('login-identifier');

  if (storesList && storesList.length > 0 && selectWrap && selectEl) {
    selectWrap.classList.remove('hidden');
    selectEl.innerHTML = `<option value="">-- Select Store (${storesList.length}) --</option>` +
      storesList.map((s) => `<option value="${escapeHtml(s.store_name || s.owner_phone || s.store_id)}">${escapeHtml(s.store_name)} (${escapeHtml(s.store_id)})</option>`).join('');
    if (storesList.length === 1 && loginIdInput && !loginIdInput.value) {
      loginIdInput.value = storesList[0].store_name || storesList[0].owner_phone || storesList[0].store_id;
      selectEl.value = storesList[0].store_name || storesList[0].owner_phone || storesList[0].store_id;
    }
  } else if (selectWrap) {
    selectWrap.classList.add('hidden');
  }
}

async function showAuthOverlay() {
  const overlay = document.getElementById('auth-screen-overlay');
  if (overlay) overlay.classList.remove('hidden');
  switchAuthTab('login');

  let storesMap = {};
  try {
    const localStores = await window.HolyStarDB.getAllStores();
    for (const s of localStores) {
      if (s && s.store_id) storesMap[s.store_id] = s;
    }
  } catch (e) {}

  populateLoginStoreDropdown(Object.values(storesMap));

  // Also pull cloud stores in background so any store registered on another device appears in the dropdown!
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    window.HolyStarDB.pullCloudTelemetry().then((cloudStores) => {
      if (Array.isArray(cloudStores)) {
        for (const cs of cloudStores) {
          if (cs && cs.store_id && !storesMap[cs.store_id]) {
            storesMap[cs.store_id] = cs;
          }
        }
        populateLoginStoreDropdown(Object.values(storesMap));
      }
    }).catch(() => {});
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
  const [products, debtors, closedDays, periodReport] = await Promise.all([
    window.HolyStarDB.getAllProducts(storeId),
    window.HolyStarDB.getAllDebtors(storeId),
    window.HolyStarDB.getAllClosedDays(storeId),
    window.HolyStarDB.getSalesReportByPeriod(
      AppState.selectedSalesPeriod || 'TODAY',
      AppState.selectedReportDate || window.HolyStarDB.formatLocalDate()
    )
  ]);

  AppState.products = products;
  AppState.debtors = debtors;
  AppState.closedDays = closedDays;
  AppState.dailyReport = periodReport;

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
    pill.className = 'badge';
    if (tampered) {
      pill.classList.add('badge-danger');
      pillText.textContent = 'Clock Locked';
    } else if (expired) {
      pill.classList.add('badge-danger');
      pillText.textContent = 'Expired';
    } else if (daysLeft <= 2) {
      pill.classList.add('badge-warning');
      pillText.textContent = `${daysLeft}d left`;
    } else {
      pill.classList.add('badge-success');
      pillText.textContent = `Active (${daysLeft}d)`;
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
      checkoutBtn.textContent = tampered ? 'Fix Clock' : 'Renew License';
    } else {
      checkoutBtn.disabled = AppState.cart.length === 0;
      checkoutBtn.textContent = `Complete Sale (${formatGHS(totalAmount)})`;
    }
  }
}

function renderHeaderInfo() {
  const s = AppState.store || {};
  const nameEl = document.getElementById('header-shop-name');
  if (nameEl) nameEl.textContent = s.store_name || s.shop_name || 'Holy Star POS';
  updateConnectionStatusDot();
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
    return `
      <div class="autocomplete-item" data-catalog-idx="${idx}" data-catalog-name="${escapeHtml(m.name)}">
        <img src="${thumb}" alt="" />
        <div style="flex:1; min-width:0;">
          <div class="autocomplete-item-title">${escapeHtml(m.name)}</div>
          <div class="autocomplete-item-meta">${escapeHtml(m.category)}</div>
        </div>
        <span class="badge badge-info">Fill</span>
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
// CAMERA BARCODE & QR SCANNER
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
    setTimeout(() => manualInput.focus(), 100);
  }

  if (quickList) {
    const sampleSource = AppState.products.length > 0
      ? AppState.products.filter((p) => p.barcode).slice(0, 6)
      : (window.MASTER_CATALOG || []).slice(0, 6);

    quickList.innerHTML = sampleSource.map((item) => {
      const code = item.barcode || item.suggested_barcode || '6031100100010';
      return `<button type="button" class="btn btn-outline btn-sm btn-quick-barcode" data-code="${escapeHtml(code)}">${escapeHtml(item.name.slice(0, 14))}</button>`;
    }).join('');

    quickList.querySelectorAll('.btn-quick-barcode').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleDetectedBarcode(btn.dataset.code);
      });
    });
  }

  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl) {
      statusEl.textContent = 'Type barcode below or tap a quick item.';
    }
    return;
  }

  try {
    if (statusEl) statusEl.textContent = 'Starting camera...';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    AppState.barcodeScanner.stream = stream;
    AppState.barcodeScanner.active = true;
    video.srcObject = stream;
    await video.play();

    if ('BarcodeDetector' in window) {
      if (statusEl) statusEl.textContent = 'Point camera at barcode...';
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
      });

      AppState.barcodeScanner.scanInterval = setInterval(async () => {
        if (!AppState.barcodeScanner.active || video.readyState < 2) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            const rawCode = String(barcodes[0].rawValue).trim();
            if (rawCode) handleDetectedBarcode(rawCode);
          }
        } catch (scanErr) {}
      }, 280);
    } else if (statusEl) {
      statusEl.textContent = 'Camera active. Enter digits below if needed.';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Enter barcode manually below.';
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
        showToast(`Matched "${catMatch.name}"!`, 'success');
        return;
      }
    }
    showToast(`Barcode ${cleanCode} captured!`, 'success');
    return;
  }

  const matchedProduct = AppState.products.find(
    (p) => String(p.barcode || '').trim().toLowerCase() === cleanCode.toLowerCase()
  );

  if (matchedProduct) {
    addToCart(matchedProduct.id);
    showToast(`Added ${matchedProduct.name}`, 'success');
  } else {
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      searchInput.value = cleanCode;
      AppState.posSearchQuery = cleanCode;
      renderPosProductGrid();
    }
    showToast(`Barcode "${cleanCode}" not in stock yet.`, 'error');
  }
}

// ============================================================================
// TAB 1: COMPACT 5-PER-ROW POS PRODUCT GRID & SMART CASH SHORTFALL CHECKOUT
// ============================================================================

function renderPosCategories() {
  const select = document.getElementById('pos-category-select');
  const invSelect = document.getElementById('inv-category-select');
  const chipContainer = document.getElementById('pos-category-chips');

  const standardCategories = [
    'Provision & Mini-Mart', 'Biscuits & Snacks', 'Beverages & Drinks', 'Milk & Dairy',
    'Canned & Tin Foods', 'Cooking Oil & Paste', 'Rice, Grains & Flour', 'Bread & Bakery',
    'Soaps & Detergents', 'Toiletries & Cosmetics', 'Baby Products', 'OTC Medicine & First Aid',
    'Phone Accessories', 'Stationery', 'Household & Plastics', 'Boutique & Fashion', 'Food/Restaurant'
  ];
  const present = new Set(AppState.products.map((p) => p.category).filter(Boolean));
  const merged = ['All', ...new Set([...present, ...standardCategories])];

  if (select) {
    const curVal = AppState.selectedPosCategory || 'All';
    select.innerHTML = merged
      .map((cat) => `<option value="${escapeHtml(cat)}" ${cat === curVal ? 'selected' : ''}>${cat === 'All' ? 'Categories ▾' : escapeHtml(cat)}</option>`)
      .join('');

    if (!select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener('change', (e) => {
        AppState.selectedPosCategory = e.target.value;
        renderPosProductGrid();
      });
    }
  }

  if (invSelect) {
    const curInvVal = AppState.selectedInvCategory || 'All';
    invSelect.innerHTML = merged
      .map((cat) => `<option value="${escapeHtml(cat)}" ${cat === curInvVal ? 'selected' : ''}>${cat === 'All' ? 'All Categories ▾' : escapeHtml(cat)}</option>`)
      .join('');

    if (!invSelect.dataset.bound) {
      invSelect.dataset.bound = '1';
      invSelect.addEventListener('change', (e) => {
        AppState.selectedInvCategory = e.target.value;
        renderInventoryView();
      });
    }
  }

  if (chipContainer) {
    chipContainer.innerHTML = '';
  }
}

function renderPosProductGrid() {
  const grid = document.getElementById('pos-product-grid');
  if (!grid) return;

  const query = AppState.posSearchQuery.trim().toLowerCase();
  const filtered = AppState.products.filter((p) => {
    const matchCategory = !AppState.selectedPosCategory || AppState.selectedPosCategory === 'All' || (p.category || 'General') === AppState.selectedPosCategory;
    const matchSearch =
      !query ||
      String(p.name || '').toLowerCase().includes(query) ||
      String(p.category || '').toLowerCase().includes(query) ||
      String(p.barcode || '').toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding:2rem 1rem;">
        <div style="margin-bottom:0.4rem;">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
        </div>
        <div style="font-weight:800; color:var(--text-primary);">
          ${AppState.products.length === 0 ? '0 Products in Store' : 'No matching items'}
        </div>
        <div style="font-size:0.76rem; margin-top:0.2rem; color:var(--text-secondary);">
          ${AppState.products.length === 0 ? 'Tap "Add Product" to add items' : 'Try another search or filter'}
        </div>
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

      let stockColor = 'color:var(--text-secondary);';
      let stockLabel = `${stock} left`;
      if (isOut) {
        stockColor = 'color:var(--danger); font-weight:800;';
        stockLabel = 'Out';
      } else if (isLow) {
        stockColor = 'color:var(--warning); font-weight:800;';
        stockLabel = `${stock} low`;
      }

      const inCartItem = AppState.cart.find((c) => c.id === p.id);
      const inCartBadge = inCartItem
        ? `<span class="product-cart-count">${inCartItem.qty}</span>`
        : '';
      const thumbSrc = getProductThumb(p);

      return `
        <div class="product-card ${isOut ? 'out-of-stock' : ''}" data-product-id="${escapeHtml(p.id)}">
          ${inCartBadge}
          <img src="${thumbSrc}" class="product-thumb-sm" alt="" />
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-price">${formatGHS(p.selling_price)}</div>
          <div class="product-stock-pill" style="${stockColor}">${stockLabel}</div>
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
    showToast(`"${product.name}" is out of stock!`, 'error');
    return;
  }

  const existing = AppState.cart.find((item) => item.id === productId);
  if (existing) {
    if (existing.qty + 1 > available) {
      showToast(`Max stock (${available}) reached for "${product.name}".`, 'error');
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
    showToast(`Max available stock is ${maxStock}.`, 'error');
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
  const floatBadge = document.getElementById('floating-basket-badge');
  const floatTotal = document.getElementById('floating-basket-total');

  if (!container) return;

  const { totalAmount, totalItemsCount } = getCartTotals();

  if (countEl) countEl.textContent = String(totalItemsCount);
  if (totalEl) totalEl.textContent = formatGHS(totalAmount);
  if (floatBadge) floatBadge.textContent = String(totalItemsCount);
  if (floatTotal) floatTotal.textContent = formatGHS(totalAmount);

  if (AppState.cart.length === 0) {
    container.innerHTML = `<div class="empty-state">Tap any item to sell</div>`;
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
              <button type="button" class="btn-remove-item" data-id="${escapeHtml(item.id)}">&times;</button>
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

function initFloatingDraggableCart() {
  const basket = document.getElementById('floating-cart-basket');
  if (!basket) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let hasMoved = false;

  basket.addEventListener('pointerdown', (e) => {
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = basket.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    try { basket.setPointerCapture(e.pointerId); } catch(err) {}
    basket.style.transition = 'none';
  });

  basket.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > 6) {
      hasMoved = true;
    }
    if (hasMoved) {
      const maxX = window.innerWidth - basket.offsetWidth - 8;
      const maxY = window.innerHeight - basket.offsetHeight - 8;
      const newX = Math.max(8, Math.min(maxX, initialLeft + dx));
      const newY = Math.max(54, Math.min(maxY, initialTop + dy));
      basket.style.left = `${newX}px`;
      basket.style.top = `${newY}px`;
      basket.style.right = 'auto';
      basket.style.bottom = 'auto';
    }
  });

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { basket.releasePointerCapture(e.pointerId); } catch(err) {}
    basket.style.transition = 'box-shadow 0.15s ease, transform 0.08s ease';
    if (!hasMoved) {
      const cartEl = document.getElementById('main-cart-panel') || document.getElementById('cart-items-container');
      if (cartEl) {
        cartEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  basket.addEventListener('pointerup', onPointerUp);
  basket.addEventListener('pointercancel', onPointerUp);
}

function populateExistingDebtorsDropdown() {
  const select = document.getElementById('credit-existing-select');
  if (!select) return;

  select.innerHTML = `<option value="">-- Existing Customer (${AppState.debtors.length}) or New --</option>` +
    AppState.debtors.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.phone)})</option>`).join('');
}

function updatePaymentCalculations() {
  const method = AppState.selectedPaymentMethod || 'Cash';
  const { totalAmount } = getCartTotals();

  const cashBox = document.getElementById('cash-calculator-box');
  const momoBox = document.getElementById('momo-payment-fields');
  const creditBox = document.getElementById('credit-customer-fields');

  if (cashBox) cashBox.classList.toggle('hidden', method !== 'Cash');
  if (momoBox) momoBox.classList.toggle('hidden', method !== 'MoMo');
  if (creditBox) creditBox.classList.toggle('hidden', method !== 'Credit');

  const tenderedInput = document.getElementById('cash-tendered-input');
  const changeLabel = document.getElementById('cash-change-label');
  const changeDisplay = document.getElementById('cash-change-output');
  if (tenderedInput && changeDisplay) {
    const rawVal = tenderedInput.value;
    if (rawVal === '' || Number(rawVal) >= totalAmount) {
      const tenderedVal = rawVal === '' ? totalAmount : Number(rawVal);
      const change = Math.max(0, tenderedVal - totalAmount);
      if (changeLabel) changeLabel.textContent = 'CHANGE DUE';
      changeDisplay.textContent = formatGHS(change);
      changeDisplay.style.color = '#15803d';
    } else {
      const shortfall = Math.max(0, totalAmount - Number(rawVal));
      if (changeLabel) changeLabel.textContent = 'REMAINDER';
      changeDisplay.textContent = formatGHS(shortfall);
      changeDisplay.style.color = '#dc2626';
    }
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
    showToast('Checkout is locked. Renew license in Settings.', 'error');
    return;
  }

  if (AppState.cart.length === 0) {
    showToast('Cart is empty.', 'error');
    return;
  }

  const paymentMethod = AppState.selectedPaymentMethod || 'Cash';
  const { totalAmount } = getCartTotals();

  const tenderedInput = document.getElementById('cash-tendered-input');
  const hasExplicitCashInput = tenderedInput && tenderedInput.value.trim() !== '';
  const cashTendered = hasExplicitCashInput ? Number(tenderedInput.value) : totalAmount;

  // SMART CASH SHORTFALL FLOW: If paying by Cash and Amount Given < Total -> Pop Choice Modal!
  if (paymentMethod === 'Cash' && hasExplicitCashInput && cashTendered < totalAmount) {
    openCashShortfallModal(cashTendered, totalAmount);
    return;
  }

  const momoPhone = document.getElementById('momo-phone-input')?.value || '';

  // Mandatory Customer MoMo Phone Validation (Strict 10 Digits)
  if (paymentMethod === 'MoMo') {
    if (!validate10DigitPhone(momoPhone)) {
      showToast('Customer MoMo number must be strictly 10 digits (e.g. 0244123456)', 'error');
      const input = document.getElementById('momo-phone-input');
      if (input) {
        input.focus();
        input.style.borderColor = '#ef4444';
        setTimeout(() => { input.style.borderColor = ''; }, 3000);
      }
      return;
    }
  }

  const creditDetails = {
    customerName: document.getElementById('credit-customer-name')?.value || '',
    customerPhone: document.getElementById('credit-customer-phone')?.value || '',
    customerLocation: document.getElementById('credit-customer-location')?.value || '',
    initialDeposit: Number(document.getElementById('credit-initial-deposit')?.value || 0),
    depositMethod: document.getElementById('credit-deposit-method')?.value || 'Cash',
    dueDate: document.getElementById('credit-due-date')?.value || ''
  };

  if (paymentMethod === 'Credit') {
    if (!validate10DigitPhone(creditDetails.customerPhone)) {
      showToast('Customer phone must be strictly 10 digits (e.g. 0244123456)', 'error');
      const input = document.getElementById('credit-customer-phone');
      if (input) {
        input.focus();
        input.style.borderColor = '#ef4444';
        setTimeout(() => { input.style.borderColor = ''; }, 3000);
      }
      return;
    }
  }

  try {
    const result = await window.HolyStarDB.processAtomicCheckout({
      cartItems: AppState.cart,
      paymentMethod,
      cashTendered,
      momoPhone,
      creditDetails
    });

    await finalizeCompletedSaleUI(result.sale);
  } catch (err) {
    showToast(err.message || 'Failed to complete sale.', 'error');
  }
}

function openCashShortfallModal(cashGiven, totalAmount) {
  const remainder = Number((totalAmount - cashGiven).toFixed(2));
  AppState.shortfallCashGiven = Number(cashGiven.toFixed(2));

  const modal = document.getElementById('modal-cash-shortfall');
  const promptText = document.getElementById('shortfall-prompt-text');
  const remBtnSpan = document.getElementById('shortfall-btn-rem-amount');
  const choiceBtns = document.getElementById('shortfall-choice-buttons');
  const debtorForm = document.getElementById('form-shortfall-debtor');

  if (!modal) return;
  if (promptText) {
    promptText.textContent = `Customer paid ${formatGHS(cashGiven)}, leaving a balance of ${formatGHS(remainder)}. Would you like to:`;
  }
  if (remBtnSpan) {
    remBtnSpan.textContent = formatGHS(remainder);
  }
  if (choiceBtns) choiceBtns.classList.remove('hidden');
  if (debtorForm) debtorForm.classList.add('hidden');

  modal.classList.remove('hidden');
}

async function handleShortfallDebtorSubmit(e) {
  e.preventDefault();
  const customerName = String(document.getElementById('shortfall-cust-name')?.value || '').trim();
  const customerPhone = String(document.getElementById('shortfall-cust-phone')?.value || '').trim();
  const customerLocation = String(document.getElementById('shortfall-cust-location')?.value || '').trim();

  if (!customerName || !customerPhone || !customerLocation) {
    showToast('Enter Customer Name, Phone, and Location.', 'error');
    return;
  }

  if (!validate10DigitPhone(customerPhone)) {
    showToast('Customer phone must be strictly 10 digits (e.g. 0244123456)', 'error');
    return;
  }

  try {
    const result = await window.HolyStarDB.processAtomicCheckout({
      cartItems: AppState.cart,
      paymentMethod: 'Credit',
      cashTendered: AppState.shortfallCashGiven,
      creditDetails: {
        customerName,
        customerPhone,
        customerLocation,
        initialDeposit: AppState.shortfallCashGiven,
        depositMethod: 'Cash',
        dueDate: ''
      }
    });

    document.getElementById('modal-cash-shortfall')?.classList.add('hidden');
    e.target.reset();
    await finalizeCompletedSaleUI(result.sale);
  } catch (err) {
    showToast(err.message || 'Could not save credit sale.', 'error');
  }
}

async function finalizeCompletedSaleUI(sale) {
  AppState.cart = [];
  AppState.activeSaleReceipt = sale;

  const tenderedInput = document.getElementById('cash-tendered-input');
  if (tenderedInput) tenderedInput.value = '';
  if (document.getElementById('momo-phone-input')) document.getElementById('momo-phone-input').value = '';
  if (document.getElementById('credit-existing-select')) document.getElementById('credit-existing-select').value = '';
  if (document.getElementById('credit-customer-name')) document.getElementById('credit-customer-name').value = '';
  if (document.getElementById('credit-customer-phone')) document.getElementById('credit-customer-phone').value = '';
  if (document.getElementById('credit-customer-location')) document.getElementById('credit-customer-location').value = '';
  if (document.getElementById('credit-initial-deposit')) document.getElementById('credit-initial-deposit').value = '0';

  selectPaymentMethod('Cash');

  await refreshAllData();
  window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'checkout_sale');
  triggerSilentBackgroundSync();

  // Show non-blocking Sale Completed Banner with optional Receipt button (do NOT force-open modal)
  const banner = document.getElementById('sale-completed-banner');
  const sub = document.getElementById('sale-completed-sub');
  if (banner) {
    if (sub) {
      sub.textContent = `${formatGHS(sale.total_amount)} (${sale.payment_method})${sale.change_given > 0 ? ` • Change: ${formatGHS(sale.change_given)}` : ''}`;
    }
    banner.classList.remove('hidden');
  }

  showToast(`Sale Completed (${formatGHS(sale.total_amount)})!`, 'success');
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

  let extraHtml = '';
  if (sale.payment_method === 'MoMo' && sale.momo_phone) {
    extraHtml = `
      <div class="receipt-line"><span>Customer MoMo:</span><strong>${escapeHtml(sale.momo_phone)}</strong></div>
    `;
  } else if (sale.payment_method === 'Cash' && Number(sale.change_given || 0) > 0) {
    extraHtml = `
      <div class="receipt-line"><span>Amount Given:</span><span>${formatGHS(sale.cash_tendered)}</span></div>
      <div class="receipt-line"><span>Change Due:</span><strong>${formatGHS(sale.change_given)}</strong></div>
    `;
  } else if (sale.payment_method === 'Credit' && sale.customer) {
    extraHtml = `
      <div class="receipt-divider"></div>
      <div class="receipt-line"><span>Customer:</span><strong>${escapeHtml(sale.customer.name)}</strong></div>
      <div class="receipt-line"><span>Paid Now:</span><span>${formatGHS(sale.initial_deposit)}</span></div>
      <div class="receipt-line"><span>Remainder Owed:</span><strong>${formatGHS(sale.balance_owed)}</strong></div>
    `;
  }

  content.innerHTML = `
    <div class="receipt-header">
      <h4>${escapeHtml(s.store_name || 'HOLY STAR POS')}</h4>
      <div>${escapeHtml(s.shop_location || s.location || 'Ghana')} • ${escapeHtml(s.owner_phone || '')}</div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-line"><span>Receipt:</span><strong>${escapeHtml(sale.id)}</strong></div>
    <div class="receipt-line"><span>Date:</span><span>${escapeHtml(formatDateTime(sale.timestamp))}</span></div>
    <div class="receipt-line"><span>Method:</span><strong>${escapeHtml(sale.payment_method)}</strong></div>
    <div class="receipt-divider"></div>
    ${itemsHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-line receipt-total">
      <span>TOTAL:</span>
      <span>${formatGHS(sale.total_amount)}</span>
    </div>
    ${extraHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-footer">Thank you!</div>
  `;

  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 2: INVENTORY
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
  if (estMarginEl) estMarginEl.textContent = `Profit: ${formatGHS(totalProjProfit)}`;
  if (alertsCountEl) alertsCountEl.textContent = String(lowOrOutCount);

  if (navBadgeStock) {
    navBadgeStock.textContent = String(lowOrOutCount);
    navBadgeStock.classList.toggle('hidden', lowOrOutCount === 0);
  }
  const drawerBadgeStock = document.getElementById('drawer-badge-stock');
  if (drawerBadgeStock) {
    drawerBadgeStock.textContent = String(lowOrOutCount);
    drawerBadgeStock.classList.toggle('hidden', lowOrOutCount === 0);
  }

  const query = AppState.inventorySearchQuery.trim().toLowerCase();
  const stockFilter = AppState.inventoryStockFilter || 'ALL';
  const catFilter = AppState.selectedInvCategory || 'All';

  const filtered = AppState.products.filter((p) => {
    const qty = Number(p.stock_qty || 0);
    const alertLvl = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);
    if (stockFilter === 'OUT' && qty > 0) return false;
    if (stockFilter === 'LOW' && (qty <= 0 || qty > alertLvl)) return false;
    if (catFilter !== 'All' && (p.category || 'General') !== catFilter) return false;

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
        <td colspan="6" style="text-align:center; padding:1.75rem; color:var(--text-secondary);">
          ${AppState.products.length === 0 ? '0 Products. Tap "Add Product" to start.' : 'No matching items.'}
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
      const qty = Number(p.stock_qty || 0);
      const alertLvl = Number(p.low_stock_threshold ?? p.low_stock_alert ?? 5);

      let qtyBadgeClass = 'badge-success';
      if (qty <= 0) qtyBadgeClass = 'badge-danger';
      else if (qty <= alertLvl) qtyBadgeClass = 'badge-warning';

      const thumbSrc = getProductThumb(p);

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.55rem;">
              <img src="${thumbSrc}" style="width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid var(--border);" alt="" />
              <div>
                <div style="font-weight:800; color:var(--text-primary);">${escapeHtml(p.name)}</div>
                <div style="font-size:0.72rem; color:var(--text-secondary);">${escapeHtml(p.category || 'General')}</div>
              </div>
            </div>
          </td>
          <td>${formatGHS(cost)}</td>
          <td style="font-weight:800; color:var(--primary);">${formatGHS(sell)}</td>
          <td style="font-weight:700; color:var(--success);">${formatGHS(unitProfit)}</td>
          <td><span class="badge ${qtyBadgeClass}">${qty}</span></td>
          <td>
            <div style="display:flex; gap:0.3rem;">
              <button type="button" class="btn btn-success btn-sm btn-restock-item" data-id="${escapeHtml(p.id)}">+Qty</button>
              <button type="button" class="btn btn-outline btn-sm btn-edit-item" data-id="${escapeHtml(p.id)}">Edit</button>
              <button type="button" class="btn btn-danger btn-sm btn-delete-item" data-id="${escapeHtml(p.id)}" title="Delete item" style="padding:0.25rem 0.45rem;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
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
    if (titleEl) titleEl.textContent = 'Edit Product';
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
    if (titleEl) titleEl.textContent = 'Add Product';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = '';
    if (barcodeInput) barcodeInput.value = '';
    if (costInput) costInput.value = '';
    if (sellInput) sellInput.value = '';
    if (qtyInput) qtyInput.value = '10';
    if (alertInput) alertInput.value = '5';
    AppState.currentProductThumbnail = typeof window.generateProductSvgThumbnail === 'function'
      ? window.generateProductSvgThumbnail('Item', 'General')
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
  previewEl.style.color = profit >= 0 ? '#065f46' : '#991b1b';
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

  const cleanName = String(name || '').trim();
  const cleanNameLower = cleanName.toLowerCase();
  const existingDup = AppState.products.find(
    (p) => p.id !== id && String(p.name || '').trim().toLowerCase() === cleanNameLower
  );
  if (existingDup) {
    showToast(`Product "${existingDup.name}" already exists in inventory. Please edit or restock it instead.`, 'error');
    return;
  }

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
    triggerSilentBackgroundSync();
    showToast(`Saved "${saved.name}"!`, 'success');
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
    triggerSilentBackgroundSync();
    showToast(`Restocked "${updated.name}" (${updated.stock_qty} in stock).`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to restock.', 'error');
  }
}

async function handleDeleteProduct(productId) {
  const product = AppState.products.find((p) => p.id === productId);
  if (!product) return;

  if (!confirm(`Delete "${product.name}"?`)) return;

  try {
    await window.HolyStarDB.deleteProduct(productId);
    AppState.cart = AppState.cart.filter((c) => c.id !== productId);
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'inventory_deleted');
    triggerSilentBackgroundSync();
    showToast(`Deleted "${product.name}".`, 'info');
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

// ============================================================================
// TAB 3: DEBTORS
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
  const salesBadgeDebtors = document.getElementById('sales-badge-debtors');
  if (salesBadgeDebtors) {
    salesBadgeDebtors.textContent = String(unpaidCustomers);
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
        <td colspan="6" style="text-align:center; padding:1.75rem; color:var(--text-secondary);">
          0 Debtors found.
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
            <div style="font-size:0.72rem; color:var(--text-secondary);">${escapeHtml(getDebtorItemsSummaryText(d))}</div>
          </td>
          <td style="font-weight:700;">${escapeHtml(d.phone)}</td>
          <td>${escapeHtml(d.location)}</td>
          <td>
            <span style="font-weight:900; color:${isCleared ? 'var(--success)' : 'var(--danger)'};">
              ${formatGHS(owed)}
            </span>
          </td>
          <td>
            ${isCleared
              ? `<span class="badge badge-success">Cleared</span>`
              : `<span class="badge badge-danger">Unpaid</span>`}
          </td>
          <td>
            <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
              ${!isCleared
                ? `<button type="button" class="btn btn-primary btn-sm btn-pay-debt" data-id="${escapeHtml(d.id)}">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px; vertical-align:-2px;"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/></svg>Pay
                   </button>
                   <button type="button" class="btn btn-whatsapp btn-sm btn-remind-whatsapp" data-id="${escapeHtml(d.id)}" title="WhatsApp Reminder">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                   </button>`
                : ''}
              <button type="button" class="btn btn-outline btn-sm btn-debtor-history" data-id="${escapeHtml(d.id)}" title="History">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
              </button>
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
  return (
    `Hello ${debtor.name}, reminder from *${shopName}*: ` +
    `Your balance for (${itemsText}) is *${formatGHS(debtor.total_owed)}*. ` +
    `Kindly pass by or send MoMo${shopPhone ? ' to ' + shopPhone : ''}. Thank you!`
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

  if (idInput) idInput.value = debtor.id;
  if (nameEl) nameEl.textContent = debtor.name;
  if (phoneEl) phoneEl.textContent = `${debtor.phone} • ${debtor.location}`;
  if (owedEl) owedEl.textContent = formatGHS(debtor.total_owed);
  if (amountInput) {
    amountInput.value = debtor.total_owed;
    amountInput.max = debtor.total_owed;
  }

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
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'debtor_payment');
    triggerSilentBackgroundSync();
    showToast(`Recorded ${formatGHS(paymentEntry.amount_paid)} from ${debtor.name}!`, 'success');
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

  if (phone && !validate10DigitPhone(phone)) {
    showToast('Customer phone must be strictly 10 digits (e.g. 0244123456)', 'error');
    return;
  }

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
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'manual_debtor_added');
    triggerSilentBackgroundSync();
    showToast(`Added ${debtor.name} (${formatGHS(debtor.total_owed)}).`, 'success');
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

  if (titleEl) titleEl.textContent = `History: ${debtor.name}`;
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div><strong>Phone:</strong> ${escapeHtml(debtor.phone)} • <strong>Location:</strong> ${escapeHtml(debtor.location)}</div>
      <div style="margin-top:0.2rem;"><strong>Paid:</strong> ${formatGHS(debtor.total_paid || 0)} • <strong>Owed:</strong> <span style="color:var(--danger); font-weight:800;">${formatGHS(debtor.total_owed)}</span></div>
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
            <div style="border-left:3px solid var(--success); background:var(--success-bg); padding:0.55rem; border-radius:6px; font-size:0.8rem;">
              <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--success);">
                <span>Paid (${escapeHtml(h.payment_method)})</span>
                <span>− ${formatGHS(h.amount_paid)}</span>
              </div>
              <div style="font-size:0.74rem; color:var(--text-secondary); margin-top:0.15rem;">
                ${formatDateTime(h.timestamp)} • Remaining: <strong>${formatGHS(h.balance_after)}</strong>
              </div>
            </div>
          `;
        } else {
          const itemsStr = Array.isArray(h.items)
            ? h.items.map((i) => `${i.qty}x ${i.name}`).join(', ')
            : h.note || 'Credit';
          return `
            <div style="border-left:3px solid var(--danger); background:var(--danger-bg); padding:0.55rem; border-radius:6px; font-size:0.8rem;">
              <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--danger);">
                <span>Credit</span>
                <span>+ ${formatGHS(h.amount_added_to_debt)}</span>
              </div>
              <div style="font-size:0.74rem; color:var(--text-secondary); margin-top:0.15rem;">
                ${formatDateTime(h.timestamp)} • Paid Now: ${formatGHS(h.initial_deposit || 0)}
              </div>
              <div style="font-size:0.76rem; margin-top:0.15rem; font-weight:600;">${escapeHtml(itemsStr)}</div>
            </div>
          `;
        }
      })
      .join('');
  }

  modal.classList.remove('hidden');
}

// ============================================================================
// TAB 4: SALES (PERIOD FILTERS, 4 CARDS & CLOSE DAY ARCHIVE + SYNC PROMPT)
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

  if (revEl) revEl.textContent = formatGHS(m.totalRevenue);
  if (salesCountEl) salesCountEl.textContent = `${m.salesCount} sale${m.salesCount === 1 ? '' : 's'}`;
  if (profitEl) profitEl.textContent = formatGHS(m.grossProfit);
  if (cashEl) cashEl.textContent = formatGHS(m.cashCollected);
  if (cashSubEl) cashSubEl.textContent = `Sales: ${formatGHS(m.cashFromSales)} + Debt: ${formatGHS(m.cashFromDebtors)}`;
  if (momoEl) momoEl.textContent = formatGHS(m.momoRecorded);
  if (momoSubEl) momoSubEl.textContent = `Sales: ${formatGHS(m.momoFromSales)} + Debt: ${formatGHS(m.momoFromDebtors)}`;

  // Render Archived Closed Days Chips
  const archiveCard = document.getElementById('closed-days-archive-card');
  const archiveChips = document.getElementById('closed-days-chips-list');
  if (archiveCard && archiveChips) {
    if (AppState.closedDays && AppState.closedDays.length > 0) {
      archiveCard.classList.remove('hidden');
      archiveChips.innerHTML = AppState.closedDays
        .slice(0, 14)
        .map((c) => `
          <button type="button" class="btn btn-outline btn-sm btn-view-closed-day" data-date="${escapeHtml(c.date_str)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; vertical-align:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
            ${escapeHtml(c.date_str)} (${formatGHS(c.revenue)})
          </button>
        `)
        .join('');

      archiveChips.querySelectorAll('.btn-view-closed-day').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = AppState.closedDays.find((x) => x.date_str === btn.dataset.date);
          if (rec) showArchivedCloseDayModal(rec, false);
        });
      });
    } else {
      archiveCard.classList.add('hidden');
    }
  }

  const salesTbody = document.getElementById('sales-table-body');
  if (salesTbody) {
    if (report.sales.length === 0) {
      salesTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">
            0 sales for selected period.
          </td>
        </tr>
      `;
    } else {
      salesTbody.innerHTML = report.sales
        .map((s) => {
          const itemSummary = (s.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ');
          const custName = s.customer ? s.customer.name : '';

          let methodDetails = `<div class="pay-detail-badge"><span class="pay-badge-method">Cash</span>`;
          if (Number(s.cash_tendered || 0) > 0) {
            methodDetails += `<span class="pay-badge-sub">Gave: ${formatGHS(s.cash_tendered)} • Chg: ${formatGHS(s.change_due || 0)}</span>`;
          }
          methodDetails += `</div>`;

          if (s.payment_method === 'MoMo') {
            methodDetails = `<div class="pay-detail-badge"><span class="pay-badge-method" style="color:var(--primary);">MoMo</span>`;
            if (s.momo_phone) {
              methodDetails += `<span class="pay-badge-sub">${escapeHtml(s.momo_phone)}</span>`;
            }
            methodDetails += `</div>`;
          } else if (s.payment_method === 'Credit') {
            methodDetails = `<div class="pay-detail-badge"><span class="pay-badge-method" style="color:var(--danger);">Credit ${custName ? `(${escapeHtml(custName)})` : ''}</span>`;
            methodDetails += `<span class="pay-badge-sub">Paid: ${formatGHS(s.initial_deposit || 0)} • Owed: ${formatGHS(s.remainder_owed || 0)}</span></div>`;
          }

          return `
            <tr>
              <td style="font-size:0.76rem; color:var(--text-secondary);">${formatShortTime(s.timestamp)}</td>
              <td style="max-width:220px;">${escapeHtml(itemSummary)}</td>
              <td>${methodDetails}</td>
              <td style="font-weight:800;">${formatGHS(s.total_amount)}</td>
              <td style="font-weight:700; color:var(--success);">${formatGHS(s.total_profit)}</td>
              <td>
                <button type="button" class="btn btn-outline btn-sm btn-view-receipt" data-id="${escapeHtml(s.id)}" title="View Receipt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
                </button>
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

  // Render Visual Sales & Profit Performance Chart
  renderSalesProfitChart(report);

  const repayTbody = document.getElementById('repayments-table-body');
  if (repayTbody) {
    if (report.repayments.length === 0) {
      repayTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:1.25rem; color:var(--text-secondary);">
            0 debt repayments for selected period.
          </td>
        </tr>
      `;
    } else {
      repayTbody.innerHTML = report.repayments
        .map((r) => `
          <tr>
            <td style="font-size:0.76rem;">${formatShortTime(r.timestamp)}</td>
            <td style="font-weight:700;">${escapeHtml(r.debtor_name)}</td>
            <td><span class="badge ${r.payment_method === 'MoMo' ? 'badge-info' : 'badge-success'}">${escapeHtml(r.payment_method)}</span></td>
            <td style="font-weight:800; color:var(--success);">${formatGHS(r.amount_paid)}</td>
            <td>${formatGHS(r.balance_after)}</td>
          </tr>
        `)
        .join('');
    }
  }
}

function renderSalesProfitChart(report) {
  const canvas = document.getElementById('sales-profit-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 600;
  const height = 190;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const sales = report && Array.isArray(report.sales) ? report.sales : [];
  if (sales.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No sales recorded for this period yet.', width / 2, height / 2);
    return;
  }

  const isMultiDay = AppState.selectedSalesPeriod === 'WEEK' || AppState.selectedSalesPeriod === 'MONTH' || AppState.selectedSalesPeriod === 'ALL';
  const bucketsMap = {};

  sales.forEach((s) => {
    let key;
    if (isMultiDay) {
      key = new Date(s.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } else {
      const h = new Date(s.timestamp).getHours();
      key = `${String(h).padStart(2, '0')}:00`;
    }
    if (!bucketsMap[key]) {
      bucketsMap[key] = { label: key, revenue: 0, profit: 0 };
    }
    bucketsMap[key].revenue += Number(s.total_amount || 0);
    bucketsMap[key].profit += Number(s.total_profit || 0);
  });

  const buckets = Object.values(bucketsMap).slice(-8);
  const maxVal = Math.max(10, ...buckets.map((b) => Math.max(b.revenue, b.profit) * 1.25));

  const paddingLeft = 45;
  const paddingBottom = 26;
  const paddingTop = 18;
  const plotW = width - paddingLeft - 16;
  const plotH = height - paddingTop - paddingBottom;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';

  for (let step = 0; step <= 3; step++) {
    const yVal = Math.round((maxVal / 3) * step);
    const y = paddingTop + plotH - (yVal / maxVal) * plotH;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - 16, y);
    ctx.stroke();
    ctx.fillText(`${yVal}`, 8, y + 3);
  }

  const slotW = plotW / buckets.length;
  const barW = Math.max(8, Math.min(22, slotW * 0.32));

  buckets.forEach((b, idx) => {
    const centerX = paddingLeft + idx * slotW + slotW / 2;
    const revX = centerX - barW - 1;
    const proX = centerX + 1;

    const revH = (b.revenue / maxVal) * plotH;
    const proH = (b.profit / maxVal) * plotH;

    const revY = paddingTop + plotH - revH;
    const proY = paddingTop + plotH - proH;

    // Revenue Bar (Indigo)
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.roundRect(revX, revY, barW, revH, [3, 3, 0, 0]);
    ctx.fill();

    // Profit Bar (Emerald)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(proX, proY, barW, proH, [3, 3, 0, 0]);
    ctx.fill();

    if (barW >= 12 && b.revenue > 0) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(b.revenue)}`, revX + barW / 2, Math.max(12, revY - 3));
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, centerX, height - 7);
  });
}

function formatCloseDayReceiptText(closedRecord) {
  const s = AppState.store || {};
  return [
    `DAILY CLOSE RECEIPT`,
    `Store: ${closedRecord.store_name || s.store_name || 'Holy Star POS'} (${closedRecord.store_id || s.store_id || 'HS-0000'})`,
    `Date: ${closedRecord.date_str}`,
    `--------------------------------`,
    `Sales Count: ${closedRecord.sales_count}`,
    `Revenue: ${formatGHS(closedRecord.revenue)}`,
    `Profit: ${formatGHS(closedRecord.profit)}`,
    `--------------------------------`,
    `Cash Collected: ${formatGHS(closedRecord.cash_collected)}`,
    `MoMo: ${formatGHS(closedRecord.momo)}`,
    `Credit Given: ${formatGHS(closedRecord.credit_given)}`,
    `--------------------------------`,
    `Seal: ${closedRecord.audit_seal}`
  ].join('\n');
}

async function handleCloseDayClick() {
  const targetDate = AppState.selectedSalesPeriod === 'DATE' && AppState.selectedReportDate
    ? AppState.selectedReportDate
    : window.HolyStarDB.formatLocalDate();

  try {
    const dayReport = await window.HolyStarDB.getDailyReport(targetDate);
    const m = dayReport.metrics;
    const shopId = AppState.store?.store_id || 'HS-0000';
    const seal = generateDailyAuditSeal(
      shopId,
      targetDate,
      m.totalRevenue,
      m.grossProfit,
      m.cashCollected,
      m.momoRecorded,
      m.newCreditGiven
    );

    const closedRecord = await window.HolyStarDB.archiveClosedDay({
      dateStr: targetDate,
      metrics: m,
      auditSeal: seal
    });

    await refreshAllData();
    triggerSilentBackgroundSync();
    showArchivedCloseDayModal(closedRecord, true);
  } catch (err) {
    showToast('Could not close day: ' + err.message, 'error');
  }
}

function showArchivedCloseDayModal(closedRecord, showSyncPrompt = true) {
  const modal = document.getElementById('modal-close-day');
  const preview = document.getElementById('close-day-report-text');
  const syncPrompt = document.getElementById('close-day-sync-prompt');
  const waBtn = document.getElementById('btn-close-day-whatsapp');
  const smsBtn = document.getElementById('btn-close-day-sms');

  if (!modal || !preview) return;

  const text = formatCloseDayReceiptText(closedRecord);
  preview.textContent = text;

  if (syncPrompt) {
    syncPrompt.classList.toggle('hidden', !showSyncPrompt);
  }

  const ownerPhone = AppState.store?.owner_phone || '';
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
// TAB 5: SETTINGS, MANUAL ONLINE SYNC & LICENSE ACTIVATION
// ============================================================================

async function renderSettingsView() {
  const s = AppState.store || {};

  const shopIdDisplay = document.getElementById('settings-display-shop-id');
  const statusDisplay = document.getElementById('settings-license-status-text');
  const expiryDisplay = document.getElementById('settings-license-expiry-date');
  const planDisplay = document.getElementById('settings-license-plan');
  const lastSyncedEl = document.getElementById('settings-last-synced-text');

  if (shopIdDisplay) shopIdDisplay.textContent = s.store_id || s.shop_id || 'HS-0000';
  if (planDisplay) planDisplay.textContent = s.license_plan || '7-Day Trial';
  if (expiryDisplay) expiryDisplay.textContent = formatDateTime(s.license_expiry);

  if (lastSyncedEl) {
    lastSyncedEl.textContent = s.last_synced_at
      ? `Last synced: ${formatDateTime(s.last_synced_at)}`
      : 'Not synced online yet';
  }

  if (statusDisplay) {
    if (AppState.licenseStatus.tampered) {
      statusDisplay.innerHTML = `<span class="badge badge-danger">Clock Locked</span>`;
    } else if (AppState.licenseStatus.expired) {
      statusDisplay.innerHTML = `<span class="badge badge-danger">Expired</span>`;
    } else {
      statusDisplay.innerHTML = `<span class="badge badge-success">Active (${AppState.licenseStatus.daysLeft}d)</span>`;
    }
  }

  const setShopId = document.getElementById('setting-shop-id');
  const setShopCat = document.getElementById('setting-shop-category');
  const setShopName = document.getElementById('setting-shop-name');
  const setOwnerPhone = document.getElementById('setting-owner-phone');
  const setShopLoc = document.getElementById('setting-shop-location');

  if (setShopId) setShopId.value = s.store_id || s.shop_id || 'HS-0000';
  if (setShopCat) setShopCat.value = s.store_category || 'Provision & Mini-Mart';
  if (setShopName) setShopName.value = s.store_name || s.shop_name || '';
  if (setOwnerPhone) setOwnerPhone.value = s.owner_phone || '';
  if (setShopLoc) setShopLoc.value = s.shop_location || s.location || '';
}

function showUpdateStoreDialog(type, title, message) {
  const modal = document.getElementById('modal-update-store-dialog');
  const iconEl = document.getElementById('update-dialog-icon');
  const titleEl = document.getElementById('update-dialog-title');
  const msgEl = document.getElementById('update-dialog-message');
  const okBtn = document.getElementById('btn-update-dialog-ok');

  if (!modal) return;
  if (iconEl) {
    iconEl.innerHTML = type === 'success'
      ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  modal.classList.remove('hidden');

  if (okBtn) {
    okBtn.onclick = () => {
      modal.classList.add('hidden');
    };
    okBtn.focus();
  }
}

function triggerSilentBackgroundSync() {
  if (typeof navigator !== 'undefined' && navigator.onLine && AppState.store?.store_id) {
    window.HolyStarDB.syncFullStoreOnline(AppState.store.store_id).catch(() => {});
  }
}

async function handleSyncDatabaseOnline(isManual = true) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (isManual) {
      showUpdateStoreDialog(
        'error',
        'Update Failed',
        'Update Failed — No Internet Connection. Please check your mobile data or Wi-Fi and try again.'
      );
    }
    return false;
  }

  const syncBtn = document.getElementById('btn-sync-online-settings');
  if (syncBtn && isManual) {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Updating Store...';
  }

  try {
    await window.HolyStarDB.syncFullStoreOnline(AppState.store?.store_id);
    await refreshAllData();
    if (isManual) {
      showUpdateStoreDialog(
        'success',
        'Store Updated Successfully!',
        'Your latest sales and inventory are safely backed up online.'
      );
    }
    return true;
  } catch (err) {
    if (isManual) {
      showUpdateStoreDialog(
        'error',
        'Update Failed',
        'Update Failed — No Internet Connection. Please check your mobile data or Wi-Fi and try again.'
      );
    }
    return false;
  } finally {
    if (syncBtn && isManual) {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Update Store';
    }
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
    showToast('Enter a valid 8-character Unlock Token.', 'error');
    return;
  }

  const shopId = AppState.store?.store_id || 'HS-0000';

  let matchResult = matchSubscriptionToken(shopId, enteredToken, rawIssue, selectedPlan);
  if (!matchResult && rawIssue) {
    matchResult = matchSubscriptionToken(shopId, enteredToken, '', selectedPlan);
  }

  if (!matchResult) {
    showToast(`Invalid Unlock Token "${enteredToken}" for Store ID ${shopId}.`, 'error');
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

    if (tokenInput) tokenInput.value = '';

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(shopId, 'license_renewed');
    showToast(`Subscription extended by +${matchedDays} days!`, 'success');
  } catch (err) {
    showToast('Failed to activate token: ' + err.message, 'error');
  }
}

async function handleSaveShopSettings(e) {
  e.preventDefault();
  const shopName = String(document.getElementById('setting-shop-name')?.value || '').trim();
  const shopCategory = String(document.getElementById('setting-shop-category')?.value || 'Retail').trim();
  const ownerPhone = String(document.getElementById('setting-owner-phone')?.value || '').trim();
  const location = String(document.getElementById('setting-shop-location')?.value || '').trim();

  if (!shopName) {
    showToast('Store Name cannot be empty.', 'error');
    return;
  }

  if (ownerPhone && !validate10DigitPhone(ownerPhone)) {
    showToast('Owner phone must be strictly 10 digits (e.g. 0244123456)', 'error');
    return;
  }

  try {
    await window.HolyStarDB.saveSettings({
      store_name: shopName,
      shop_name: shopName,
      store_category: shopCategory,
      owner_phone: ownerPhone,
      shop_location: location,
      location
    });

    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'settings_updated');
    showToast('Store profile saved!', 'success');
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
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
    showToast('Backup file downloaded!', 'success');
  } catch (err) {
    showToast('Backup export failed: ' + err.message, 'error');
  }
}

async function handleRestoreFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!confirm(`Restore backup from ${json.exported_at || 'file'}?`)) {
      e.target.value = '';
      return;
    }

    await window.HolyStarDB.restoreFullBackup(json);
    e.target.value = '';
    await refreshAllData();
    window.HolyStarDB.syncTelemetryHeartbeat(AppState.store?.store_id, 'backup_restored');
    showToast('Backup restored!', 'success');
  } catch (err) {
    e.target.value = '';
    showToast('Restore failed: ' + err.message, 'error');
  }
}

// ============================================================================
// UI EVENT BINDINGS
// ============================================================================

function bindUIEvents() {
  // 1. Auth Tabs & Cross-Device Login / Register
  document.querySelectorAll('.auth-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAuthTab(btn.dataset.authTab);
    });
  });

  document.getElementById('login-saved-store-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const idInput = document.getElementById('login-identifier');
    if (val && idInput) idInput.value = val;
  });

  document.getElementById('form-auth-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier')?.value;
    const password = document.getElementById('login-password')?.value;
    const submitBtn = document.getElementById('btn-login-submit');

    // Auto-detect Super-Admin credentials
    const cleanId = String(identifier || '').trim().toLowerCase();
    let saCreds = { username: 'holystar_admin', password: 'HolyStar@2026' };
    try {
      const storedCreds = localStorage.getItem('holystar_superadmin_creds_v1');
      if (storedCreds) {
        const p = JSON.parse(storedCreds);
        if (p?.username && p?.password) saCreds = p;
      }
    } catch (err) {}

    if ((cleanId === 'holystar_admin' || cleanId === saCreds.username.toLowerCase()) && password === saCreds.password) {
      sessionStorage.setItem('holystar_superadmin_session_v1', '1');
      window.location.href = 'super-admin.html';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }

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
      showToast(`Logged into ${store.store_name}!`, 'success');
    } catch (err) {
      showToast(err.message || 'Login failed.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  });

  document.getElementById('form-auth-register')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const store_name = document.getElementById('reg-store-name')?.value;
    const store_category = document.getElementById('reg-store-category')?.value;
    const owner_name = document.getElementById('reg-owner-name')?.value;
    const owner_phone = document.getElementById('reg-owner-phone')?.value;
    const owner_password = document.getElementById('reg-owner-password')?.value;
    const store_location = document.getElementById('reg-store-location')?.value;

    if (!validate10DigitPhone(owner_phone)) {
      showToast('Owner phone must be strictly 10 digits (e.g. 0244123456)', 'error');
      return;
    }

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
      showToast(`Store "${store.store_name}" (${store.store_id}) created!`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not create store.', 'error');
    }
  });

  // 2. Log Out / Switch Store Button
  document.getElementById('btn-logout-store')?.addEventListener('click', async () => {
    window.HolyStarDB.logoutSession();
    AppState.session = null;
    AppState.store = null;
    AppState.cart = [];
    AppState.products = [];
    AppState.debtors = [];
    await showAuthOverlay();
    showToast('Switched / Logged out.', 'info');
  });

  // 3. Main 1-Word Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      switchTab(tabBtn.dataset.tab);
    });
  });

  document.getElementById('btn-banner-unlock')?.addEventListener('click', () => {
    switchTab('tab-settings');
  });

  document.getElementById('btn-recheck-clock')?.addEventListener('click', async () => {
    await verifyClockAndLicenseState();
    showToast('Clock verified.', 'info');
  });

  // 4. Add Product Modal Triggers
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

  // 6. Cart, Non-Blocking Sale Banner & Smart Cash Shortfall Modal
  document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
    AppState.cart = [];
    renderCart();
    renderPosProductGrid();
  });

  document.getElementById('btn-banner-view-receipt')?.addEventListener('click', () => {
    if (AppState.activeSaleReceipt) {
      showSaleReceiptModal(AppState.activeSaleReceipt);
    }
  });

  document.getElementById('btn-banner-dismiss-sale')?.addEventListener('click', () => {
    document.getElementById('sale-completed-banner')?.classList.add('hidden');
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

  // Smart Cash Shortfall Modal Actions
  document.getElementById('btn-shortfall-choose-debtor')?.addEventListener('click', () => {
    document.getElementById('shortfall-choice-buttons')?.classList.add('hidden');
    const form = document.getElementById('form-shortfall-debtor');
    if (form) {
      form.classList.remove('hidden');
      document.getElementById('shortfall-cust-name')?.focus();
    }
  });

  document.getElementById('btn-shortfall-adjust-items')?.addEventListener('click', () => {
    document.getElementById('modal-cash-shortfall')?.classList.add('hidden');
  });

  document.getElementById('form-shortfall-debtor')?.addEventListener('submit', handleShortfallDebtorSubmit);

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

  document.getElementById('prod-image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 140);
      AppState.currentProductThumbnail = dataUrl;
      const preview = document.getElementById('prod-image-preview');
      const imgData = document.getElementById('prod-image-data');
      if (preview) preview.src = dataUrl;
      if (imgData) imgData.value = dataUrl;
      showToast('Photo attached!', 'success');
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

  // 9. Sales Period Filters (`Today` | `Pick Date` | `This Week` | `This Month` | `All-Time`) & `Close Day`
  const reportDateInput = document.getElementById('sales-date-picker');
  const salesPeriodSelect = document.getElementById('sales-period-select');

  if (salesPeriodSelect) {
    salesPeriodSelect.addEventListener('change', async (e) => {
      const period = e.target.value || 'TODAY';
      AppState.selectedSalesPeriod = period;

      if (reportDateInput) {
        reportDateInput.classList.toggle('hidden', period !== 'DATE');
        if (period === 'DATE' && !reportDateInput.value) {
          reportDateInput.value = window.HolyStarDB.formatLocalDate();
        }
      }

      AppState.dailyReport = await window.HolyStarDB.getSalesReportByPeriod(
        period,
        reportDateInput?.value || window.HolyStarDB.formatLocalDate()
      );
      renderReportsView();
    });
  }

  document.querySelectorAll('.period-pill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.period-pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const period = btn.dataset.period || 'TODAY';
      AppState.selectedSalesPeriod = period;

      if (reportDateInput) {
        reportDateInput.classList.toggle('hidden', period !== 'DATE');
        if (period === 'DATE' && !reportDateInput.value) {
          reportDateInput.value = window.HolyStarDB.formatLocalDate();
        }
      }

      AppState.dailyReport = await window.HolyStarDB.getSalesReportByPeriod(
        period,
        reportDateInput?.value || window.HolyStarDB.formatLocalDate()
      );
      renderReportsView();
    });
  });

  if (reportDateInput) {
    reportDateInput.addEventListener('change', async () => {
      AppState.selectedReportDate = reportDateInput.value || window.HolyStarDB.formatLocalDate();
      AppState.dailyReport = await window.HolyStarDB.getSalesReportByPeriod('DATE', AppState.selectedReportDate);
      renderReportsView();
    });
  }

  document.getElementById('btn-open-close-day-modal')?.addEventListener('click', handleCloseDayClick);

  document.getElementById('btn-close-day-sync-now')?.addEventListener('click', async () => {
    const ok = await handleSyncDatabaseOnline();
    if (ok) {
      document.getElementById('close-day-sync-prompt')?.classList.add('hidden');
    }
  });

  document.getElementById('btn-close-day-skip-sync')?.addEventListener('click', () => {
    document.getElementById('close-day-sync-prompt')?.classList.add('hidden');
  });

  document.getElementById('btn-close-day-copy')?.addEventListener('click', async () => {
    const text = document.getElementById('close-day-report-text')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied!', 'success');
    } catch {
      showToast('Select and copy the text above.', 'info');
    }
  });

  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  // 10. Settings & Manual Cloud Sync
  document.getElementById('btn-sync-online-settings')?.addEventListener('click', handleSyncDatabaseOnline);
  document.getElementById('form-activate-token')?.addEventListener('submit', handleActivateToken);
  document.getElementById('form-shop-settings')?.addEventListener('submit', handleSaveShopSettings);
  document.getElementById('btn-export-backup')?.addEventListener('click', handleExportBackup);
  document.getElementById('restore-file-input')?.addEventListener('change', handleRestoreFileChange);

  // 11. Universal Modal Close Buttons
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
  // 12. Hamburger Menu & Navigation Drawer
  document.getElementById('btn-hamburger-menu')?.addEventListener('click', openNavDrawer);
  document.getElementById('btn-close-nav-drawer')?.addEventListener('click', closeNavDrawer);
  document.getElementById('nav-drawer-backdrop')?.addEventListener('click', closeNavDrawer);

  document.querySelectorAll('.drawer-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.getElementById('btn-drawer-logout')?.addEventListener('click', async () => {
    closeNavDrawer();
    window.HolyStarDB.logoutSession();
    AppState.session = null;
    AppState.store = null;
    AppState.cart = [];
    AppState.products = [];
    AppState.debtors = [];
    await showAuthOverlay();
    showToast('Switched / Logged out.', 'info');
  });

  // 13. Sales -> Debtors and Debtors -> Back to Sales
  document.getElementById('btn-sales-open-debtors')?.addEventListener('click', () => {
    switchTab('tab-debtors');
  });

  document.getElementById('btn-back-to-sales')?.addEventListener('click', () => {
    switchTab('tab-sales');
  });
}

function openNavDrawer() {
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-drawer-backdrop');
  const storeSub = document.getElementById('drawer-store-name');
  if (storeSub && AppState.store) {
    storeSub.textContent = `${AppState.store.store_name} (${AppState.store.store_id})`;
  }
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.remove('hidden');
}

function closeNavDrawer() {
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-drawer-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.add('hidden');
}

function switchTab(tabId) {
  if (!tabId) return;

  const titles = {
    'tab-pos': 'POS',
    'tab-inventory': 'Inventory',
    'tab-sales': 'Sales',
    'tab-settings': 'Settings',
    'tab-debtors': 'Debtors'
  };

  const titleText = titles[tabId] || 'POS';
  const headerTitleEl = document.getElementById('header-active-section-title');
  if (headerTitleEl) {
    headerTitleEl.textContent = titleText;
  }

  document.querySelectorAll('.drawer-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });

  closeNavDrawer();
}
