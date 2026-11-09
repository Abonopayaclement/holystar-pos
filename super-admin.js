/**
 * Holy Star POS - Minimal Visual Super-Admin (super-admin.js v3.0)
 * Features:
 * - Protected Master Login (Default: holystar_admin / HolyStar@2026)
 * - 4 Top Stat Cards: Stores, Active, Expired, Offline
 * - Compact Store Rows: Store Name & Phone | Items | Sales (GHS) | Status Pills | 1-Click "+ Token"
 * - Built-in SHA-256 Token Generator (7, 30, 14 Days) + 1-Tap WhatsApp Delivery
 * - Cross-Device Cloud Sync (/api/sync + Cloud Relay + Local IndexedDB)
 */

const SA_SECRET = 'HOLY_STAR_SECRET_2026';
const SA_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SA_CREDS_KEY = 'holystar_superadmin_creds_v1';
const SA_SESSION_KEY = 'holystar_superadmin_session_v1';
const SA_TOKEN_LOG_KEY = 'holystar_superadmin_token_log_v1';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// PURE-JS FIPS 180-4 SHA-256 & TOKEN GENERATOR
// ============================================================================

function saSha256Bytes(asciiStr) {
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

function generateSuperAdminToken(storeId, planDays, issueCode) {
  const cleanStore = String(storeId || '').trim().toUpperCase();
  const cleanDays = String(Number(planDays) || 30).trim();
  const cleanIssue = String(issueCode || '001').trim().toUpperCase();
  const payload = `${cleanStore}|${cleanDays}|${cleanIssue}|${SA_SECRET}`;
  const digest = saSha256Bytes(payload);

  let token = '';
  for (let i = 0; i < 8; i++) {
    const idx = ((digest[i * 2] << 8) | digest[i * 2 + 1]) % SA_CHARS.length;
    token += SA_CHARS[idx];
  }
  return token;
}

// ============================================================================
// SUPER-ADMIN STATE
// ============================================================================

const AdminState = {
  unlocked: false,
  stores: [],
  filter: 'ALL',
  searchQuery: '',
  lastGenerated: null,
  sseSource: null
};

// ============================================================================
// HELPERS
// ============================================================================

function saEscapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function saFormatGHS(amount) {
  const num = Number(amount || 0);
  return 'GHS ' + num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saFormatShortDate(tsOrIso) {
  if (!tsOrIso) return '-';
  const d = new Date(tsOrIso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function saCleanWhatsAppPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '233' + digits.substring(1);
  } else if (digits.length === 9) {
    digits = '233' + digits;
  }
  return digits;
}

function saShowToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${saEscapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3200);
}

// ============================================================================
// MASTER CREDENTIALS & LOGS
// ============================================================================

function getMasterCredentials() {
  try {
    const raw = localStorage.getItem(SA_CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username && parsed.password) {
        return parsed;
      }
    }
  } catch (e) { }
  return {
    username: 'holystar_admin',
    password: 'HolyStar@2026'
  };
}

function saveMasterCredentials(username, password) {
  localStorage.setItem(
    SA_CREDS_KEY,
    JSON.stringify({
      username: String(username || 'holystar_admin').trim(),
      password: String(password || 'HolyStar@2026')
    })
  );
}

function getTokenLog() {
  try {
    const raw = localStorage.getItem(SA_TOKEN_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveTokenLog(list) {
  try {
    localStorage.setItem(SA_TOKEN_LOG_KEY, JSON.stringify(list.slice(0, 100)));
  } catch (e) { }
}

function buildRenewalWhatsAppMessage({ ownerName, storeName, storeId, planDays, token }) {
  const cleanOwner = String(ownerName || 'Partner').trim() || 'Partner';
  const cleanStore = String(storeName || 'Your Store').trim() || 'Your Store';
  const cleanId = String(storeId || 'HS-0000').trim().toUpperCase();
  return `Hello ${cleanOwner}, your Holy Star POS subscription for ${cleanStore} (${cleanId}) has been renewed for ${planDays} days. Enter Unlock Token: *${token}* in your POS Settings.`;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Bind events synchronously first so buttons never freeze
  bindSuperAdminEvents();

  try {
    await window.HolyStarDB.init();
  } catch (err) {
    console.warn('HolyStarDB init warning in Super-Admin:', err);
  }

  const isUnlocked = sessionStorage.getItem(SA_SESSION_KEY) === '1';
  if (isUnlocked) {
    unlockDashboard();
  }
});

async function unlockDashboard() {
  AdminState.unlocked = true;
  sessionStorage.setItem(SA_SESSION_KEY, '1');
  document.getElementById('sa-login-overlay')?.classList.add('hidden');

  await refreshPlatformStores(true);
  startLiveCloudStream();

  setInterval(() => {
    if (AdminState.unlocked) {
      refreshPlatformStores(true);
    }
  }, 25000);
}

async function refreshPlatformStores(pullFromCloud = true) {
  try {
    let list = [];
    if (pullFromCloud) {
      list = await window.HolyStarDB.pullCloudTelemetry();
    } else {
      list = await window.HolyStarDB.getAllStoresTelemetry();
    }

    const now = Date.now();
    AdminState.stores = (list || []).map((s) => {
      const effectiveExpiryTs = Number(s.admin_expected_expiry_ts || s.license_expiry_ts || Date.parse(s.license_expiry_date) || now);
      const msLeft = effectiveExpiryTs - now;
      const daysRemaining = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;

      const isExpired = s.license_status === 'Clock_Tamper_Locked' || msLeft <= 0;
      const computedSubStatus = isExpired ? 'EXPIRED' : 'ACTIVE';

      const lastSyncedTs = Number(s.last_synced_ts || Date.parse(s.last_synced_at) || 0);
      const isSyncedRecently = lastSyncedTs > 0 && (now - lastSyncedTs) <= TWENTY_FOUR_HOURS_MS && !s.offline_manual_only;

      return {
        ...s,
        effective_expiry_ts: effectiveExpiryTs,
        days_remaining: daysRemaining,
        computed_sub_status: computedSubStatus,
        last_synced_ts: lastSyncedTs,
        is_synced_24h: isSyncedRecently
      };
    });

    AdminState.stores.sort((a, b) => (b.last_synced_ts || b.created_at_ts || 0) - (a.last_synced_ts || a.created_at_ts || 0));

    renderKpiCards();
    renderStoresList();

    const refreshEl = document.getElementById('sa-last-refresh-text');
    if (refreshEl) {
      refreshEl.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
  } catch (err) {
    console.error('Failed to refresh platform stores:', err);
  }
}

function startLiveCloudStream() {
  if (AdminState.sseSource) {
    try { AdminState.sseSource.close(); } catch (e) { }
    AdminState.sseSource = null;
  }

  if (typeof EventSource === 'undefined' || !navigator.onLine) return;

  const { topic } = window.HolyStarDB.getCloudSyncConfig();
  if (!topic) return;

  try {
    const es = new EventSource(`https://ntfy.sh/${encodeURIComponent(topic)}/sse`);
    AdminState.sseSource = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.message) {
          const parsed = JSON.parse(data.message);
          const t = parsed?.bundle?.telemetry || parsed?.telemetry;
          if (t && t.store_id) {
            const registry = window.HolyStarDB.getTelemetryRegistryMap();
            registry[t.store_id] = {
              ...(registry[t.store_id] || {}),
              ...t,
              last_synced_ts: Date.now(),
              last_synced_at: new Date().toISOString()
            };
            window.HolyStarDB.saveTelemetryRegistryMap(registry);
            refreshPlatformStores(false);
          }
        }
      } catch (e) { }
    };
  } catch (err) { }
}

// ============================================================================
// RENDER 4 TOP STAT CARDS & COMPACT STORE CARDS
// ============================================================================

function renderKpiCards() {
  const stores = AdminState.stores;
  let activeCount = 0;
  let expiredCount = 0;
  let offlineCount = 0;

  for (const s of stores) {
    if (s.computed_sub_status === 'EXPIRED') {
      expiredCount++;
    } else {
      activeCount++;
    }
    if (!s.is_synced_24h) {
      offlineCount++;
    }
  }

  const elStores = document.getElementById('kpi-total-stores');
  const elActive = document.getElementById('kpi-active-subs');
  const elExpired = document.getElementById('kpi-expired-subs');
  const elOffline = document.getElementById('kpi-offline-pill');

  if (elStores) elStores.textContent = String(stores.length);
  if (elActive) elActive.textContent = String(activeCount);
  if (elExpired) elExpired.textContent = String(expiredCount);
  if (elOffline) elOffline.textContent = String(offlineCount);
}

function renderStoresList() {
  const container = document.getElementById('sa-stores-list');
  if (!container) return;

  const query = AdminState.searchQuery.trim().toLowerCase();
  const filtered = AdminState.stores.filter((s) => {
    if (AdminState.filter === 'ACTIVE' && s.computed_sub_status === 'EXPIRED') return false;
    if (AdminState.filter === 'EXPIRED' && s.computed_sub_status !== 'EXPIRED') return false;
    if (AdminState.filter === 'OFFLINE' && s.is_synced_24h) return false;

    if (!query) return true;
    return (
      String(s.store_id || '').toLowerCase().includes(query) ||
      String(s.store_name || '').toLowerCase().includes(query) ||
      String(s.owner_name || '').toLowerCase().includes(query) ||
      String(s.owner_phone || '').toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px;">
        <div class="empty-state-icon">🏪</div>
        <div class="empty-state-title">${AdminState.stores.length === 0 ? 'No Stores Yet' : 'No Match'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((s) => {
      const subPill = s.computed_sub_status === 'EXPIRED'
        ? `<span class="sa-badge sa-badge-red">● Expired</span>`
        : `<span class="sa-badge sa-badge-green">● Active (${s.days_remaining}d left)</span>`;

      const syncPill = s.is_synced_24h
        ? `<span class="sa-badge sa-badge-blue">🟢 Synced Online</span>`
        : `<span class="sa-badge sa-badge-amber">🟠 Offline (>24h)</span>`;

      const waDigits = saCleanWhatsAppPhone(s.owner_phone);
      const waHref = waDigits
        ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${s.owner_name || ''}, checking in from Holy Star POS regarding ${s.store_name} (${s.store_id}).`)}`
        : '#';

      return `
        <div class="sa-store-card">
          <!-- 1. Store Name, Category & ID -->
          <div>
            <div class="sa-store-title-bar">
              <span class="sa-store-id-tag">${saEscapeHtml(s.store_id)}</span>
              <span class="sa-store-name">${saEscapeHtml(s.store_name)}</span>
              <span class="sa-category-tag">${saEscapeHtml(s.store_category || 'Retail')}</span>
            </div>
            <div class="sa-owner-row">
              <span>👤 ${saEscapeHtml(s.owner_name || 'Owner')}</span>
              <span>📞 ${saEscapeHtml(s.owner_phone || '-')}</span>
              ${waDigits ? `<a href="${waHref}" target="_blank" rel="noopener" class="sa-wa-btn">💬 WhatsApp</a>` : ''}
            </div>
          </div>

          <!-- 2. Stock Items & Total Sales (GHS) -->
          <div class="sa-store-metrics">
            <div>📦 <span class="sa-metrics-val">${Number(s.total_products_count || 0)}</span> items (${Number(s.total_stock_units || 0)} units)</div>
            <div>💰 <span class="sa-metrics-val">${saFormatGHS(s.total_revenue_ghs || 0)}</span> (${Number(s.total_sales_count || 0)} sales)</div>
          </div>

          <!-- 3. Status Pills -->
          <div class="sa-store-badges">
            ${subPill}
            ${syncPill}
          </div>

          <!-- 4. Generate Token Button -->
          <div style="text-align:right;">
            <button type="button" class="btn-generate-token btn-sa-row-token" data-store-id="${saEscapeHtml(s.store_id)}">
              🔑 Generate Token
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.btn-sa-row-token').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTokenModalForStore(btn.dataset.storeId);
    });
  });
}

// ============================================================================
// 1-CLICK "+ TOKEN" MODAL & WHATSAPP DELIVERY
// ============================================================================

function getNextIssueSerialForStore(storeId) {
  const cleanId = String(storeId || '').trim().toUpperCase();
  const log = getTokenLog().filter((item) => item.store_id === cleanId);
  const nextNum = log.length + 1;
  return String(nextNum).padStart(3, '0');
}

function openTokenModalForStore(storeId) {
  const store = AdminState.stores.find((s) => s.store_id === storeId);

  const idInput = document.getElementById('sa-gen-store-id');
  const issueInput = document.getElementById('sa-gen-issue-code');
  const nameInput = document.getElementById('sa-gen-store-name');
  const ownerInput = document.getElementById('sa-gen-owner-name');
  const phoneInput = document.getElementById('sa-gen-owner-phone');

  if (store) {
    if (idInput) idInput.value = store.store_id;
    if (issueInput) issueInput.value = getNextIssueSerialForStore(store.store_id);
    if (nameInput) nameInput.value = store.store_name || '';
    if (ownerInput) ownerInput.value = store.owner_name || '';
    if (phoneInput) phoneInput.value = store.owner_phone || '';
  } else {
    if (idInput) idInput.value = '';
    if (issueInput) issueInput.value = '001';
    if (nameInput) nameInput.value = '';
    if (ownerInput) ownerInput.value = '';
    if (phoneInput) phoneInput.value = '';
  }

  document.getElementById('modal-sa-token')?.classList.remove('hidden');

  if (store) {
    triggerTokenGeneration();
  } else {
    document.getElementById('sa-out-store-label').textContent = 'Enter Store ID';
    document.getElementById('sa-out-token-code').textContent = '--------';
    document.getElementById('sa-out-expiry-preview').textContent = '';
  }
}

async function triggerTokenGeneration() {
  const storeId = String(document.getElementById('sa-gen-store-id')?.value || '').trim().toUpperCase();
  const issueCode = String(document.getElementById('sa-gen-issue-code')?.value || '001').trim().toUpperCase();
  const storeName = String(document.getElementById('sa-gen-store-name')?.value || '').trim();
  const ownerName = String(document.getElementById('sa-gen-owner-name')?.value || '').trim();
  const ownerPhone = String(document.getElementById('sa-gen-owner-phone')?.value || '').trim();
  const planDays = Number(document.getElementById('sa-gen-plan-select')?.value || 30);

  if (!storeId) {
    saShowToast('Enter Store ID (e.g. HS-4821)', 'error');
    return;
  }

  const token = generateSuperAdminToken(storeId, planDays, issueCode);
  const now = Date.now();

  const registry = window.HolyStarDB.getTelemetryRegistryMap();
  const existing = registry[storeId] || {
    store_id: storeId,
    store_name: storeName || `Store ${storeId}`,
    store_category: 'Retail',
    owner_name: ownerName || 'Store Owner',
    owner_phone: ownerPhone || '',
    created_at: new Date(now).toISOString(),
    created_at_ts: now,
    total_products_count: 0,
    total_stock_units: 0,
    total_sales_count: 0,
    total_revenue_ghs: 0
  };

  const currentExpiry = Math.max(now, Number(existing.admin_expected_expiry_ts || existing.license_expiry_ts || now));
  const newExpectedExpiryTs = currentExpiry + planDays * 24 * 60 * 60 * 1000;

  registry[storeId] = {
    ...existing,
    store_name: storeName || existing.store_name || `Store ${storeId}`,
    owner_name: ownerName || existing.owner_name || 'Store Owner',
    owner_phone: ownerPhone || existing.owner_phone || '',
    license_plan: `${planDays}-Day Pass`,
    license_status: 'Active',
    admin_expected_expiry_ts: newExpectedExpiryTs,
    admin_expected_expiry_date: new Date(newExpectedExpiryTs).toISOString()
  };
  window.HolyStarDB.saveTelemetryRegistryMap(registry);
  window.HolyStarDB.pushTelemetryToCloud(registry[storeId]).catch(() => { });

  const resolvedStoreName = registry[storeId].store_name;
  const resolvedOwnerName = registry[storeId].owner_name;
  const resolvedOwnerPhone = registry[storeId].owner_phone;

  const waMessage = buildRenewalWhatsAppMessage({
    ownerName: resolvedOwnerName,
    storeName: resolvedStoreName,
    storeId,
    planDays,
    token
  });

  AdminState.lastGenerated = {
    id: 'TKN-' + now,
    store_id: storeId,
    store_name: resolvedStoreName,
    owner_name: resolvedOwnerName,
    owner_phone: resolvedOwnerPhone,
    plan_days: planDays,
    issue_code: issueCode,
    token,
    expected_expiry_ts: newExpectedExpiryTs,
    wa_message: waMessage,
    created_at: now
  };

  const log = getTokenLog();
  log.unshift(AdminState.lastGenerated);
  saveTokenLog(log);

  document.getElementById('sa-out-store-label').textContent = `${resolvedStoreName} (${storeId})`;
  document.getElementById('sa-out-days-label').textContent = String(planDays);
  document.getElementById('sa-out-token-code').textContent = token;
  document.getElementById('sa-out-expiry-preview').textContent = `Expires ${saFormatShortDate(newExpectedExpiryTs)} (#${issueCode})`;

  await refreshPlatformStores(false);
}

function sendTokenViaWhatsApp(tokenEntry) {
  if (!tokenEntry || !tokenEntry.token) {
    triggerTokenGeneration();
    tokenEntry = AdminState.lastGenerated;
  }
  if (!tokenEntry) return;

  const msg = tokenEntry.wa_message || buildRenewalWhatsAppMessage({
    ownerName: tokenEntry.owner_name,
    storeName: tokenEntry.store_name,
    storeId: tokenEntry.store_id,
    planDays: tokenEntry.plan_days,
    token: tokenEntry.token
  });

  const cleanPhone = saCleanWhatsAppPhone(tokenEntry.owner_phone || document.getElementById('sa-gen-owner-phone')?.value);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ============================================================================
// UI EVENT BINDINGS
// ============================================================================

function bindSuperAdminEvents() {
  // 1. Login Form
  document.getElementById('form-sa-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userIn = String(document.getElementById('sa-login-username')?.value || '').trim();
    const passIn = String(document.getElementById('sa-login-password')?.value || '');
    const master = getMasterCredentials();

    if (userIn === master.username && passIn === master.password) {
      const passEl = document.getElementById('sa-login-password');
      if (passEl) passEl.value = '';
      await unlockDashboard();
      saShowToast('Unlocked', 'success');
    } else {
      saShowToast('Invalid credentials', 'error');
    }
  });

  // 2. Lock Button
  document.getElementById('btn-sa-logout')?.addEventListener('click', () => {
    AdminState.unlocked = false;
    sessionStorage.removeItem(SA_SESSION_KEY);
    document.getElementById('sa-login-overlay')?.classList.remove('hidden');
  });

  // 3. Sync Button
  document.getElementById('btn-sa-sync-now')?.addEventListener('click', async () => {
    saShowToast('Syncing stores...', 'info');
    await refreshPlatformStores(true);
    saShowToast('Stores synced!', 'success');
  });

  // 4. Open Blank Token Modal
  document.getElementById('btn-sa-open-token-modal-blank')?.addEventListener('click', () => {
    openTokenModalForStore('');
  });

  // 5. Filter Pills
  document.querySelectorAll('.sa-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sa-filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AdminState.filter = btn.dataset.saFilter || 'ALL';
      renderStoresList();
    });
  });

  // 6. Search Input
  const searchIn = document.getElementById('sa-store-search-input');
  if (searchIn) {
    searchIn.addEventListener('input', () => {
      AdminState.searchQuery = searchIn.value;
      renderStoresList();
    });
  }

  // 7. Plan Duration Buttons (7, 30, 14 Days) inside + Token Modal
  document.querySelectorAll('.sa-plan-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sa-plan-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const days = btn.getAttribute('data-plan-days') || '30';
      const hiddenSelect = document.getElementById('sa-gen-plan-select');
      if (hiddenSelect) hiddenSelect.value = days;
      if (document.getElementById('sa-gen-store-id')?.value.trim()) {
        triggerTokenGeneration();
      }
    });
  });

  // Auto-fill when Store ID is typed
  document.getElementById('sa-gen-store-id')?.addEventListener('input', (e) => {
    const typedId = String(e.target.value || '').trim().toUpperCase();
    const match = AdminState.stores.find((s) => s.store_id === typedId);
    if (match) {
      document.getElementById('sa-gen-store-name').value = match.store_name || '';
      document.getElementById('sa-gen-owner-name').value = match.owner_name || '';
      document.getElementById('sa-gen-owner-phone').value = match.owner_phone || '';
      document.getElementById('sa-gen-issue-code').value = getNextIssueSerialForStore(typedId);
      triggerTokenGeneration();
    }
  });

  // Token Form Submit
  document.getElementById('form-sa-generate-token')?.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerTokenGeneration();
  });

  // Send to WhatsApp & Copy Token
  document.getElementById('btn-sa-send-token-whatsapp')?.addEventListener('click', () => {
    sendTokenViaWhatsApp(AdminState.lastGenerated);
  });

  document.getElementById('btn-sa-copy-token')?.addEventListener('click', async () => {
    if (!AdminState.lastGenerated) {
      await triggerTokenGeneration();
    }
    if (!AdminState.lastGenerated) return;
    try {
      await navigator.clipboard.writeText(AdminState.lastGenerated.token);
      saShowToast(`Copied ${AdminState.lastGenerated.token}`, 'success');
    } catch {
      saShowToast('Select and copy token above', 'info');
    }
  });

  // 8. Add Offline Store Modal
  document.getElementById('btn-sa-open-manual-store')?.addEventListener('click', () => {
    document.getElementById('modal-sa-manual-store')?.classList.remove('hidden');
  });

  document.getElementById('form-sa-manual-store')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const storeId = String(document.getElementById('sa-man-store-id')?.value || '').trim().toUpperCase();
    const category = String(document.getElementById('sa-man-category')?.value || 'Provision & Mini-Mart').trim();
    const storeName = String(document.getElementById('sa-man-store-name')?.value || '').trim();
    const ownerName = String(document.getElementById('sa-man-owner-name')?.value || '').trim();
    const ownerPhone = String(document.getElementById('sa-man-owner-phone')?.value || '').trim();

    if (!storeId || !storeName) return;

    const now = Date.now();
    const registry = window.HolyStarDB.getTelemetryRegistryMap();
    registry[storeId] = {
      ...(registry[storeId] || {}),
      store_id: storeId,
      store_name: storeName,
      store_category: category,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      created_at: new Date(now).toISOString(),
      created_at_ts: now,
      total_products_count: registry[storeId]?.total_products_count || 0,
      total_stock_units: registry[storeId]?.total_stock_units || 0,
      total_sales_count: registry[storeId]?.total_sales_count || 0,
      total_revenue_ghs: registry[storeId]?.total_revenue_ghs || 0,
      license_plan: '7-Day Free Trial',
      license_status: 'Trial_Active',
      license_expiry_ts: now + 7 * 24 * 60 * 60 * 1000,
      license_expiry_date: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      offline_manual_only: true
    };

    window.HolyStarDB.saveTelemetryRegistryMap(registry);
    window.HolyStarDB.pushTelemetryToCloud(registry[storeId]).catch(() => { });

    document.getElementById('modal-sa-manual-store')?.classList.add('hidden');
    e.target.reset();
    await refreshPlatformStores(false);
    openTokenModalForStore(storeId);
  });

  // 9. Admin Settings Modal
  document.getElementById('btn-sa-open-settings')?.addEventListener('click', () => {
    const creds = getMasterCredentials();
    document.getElementById('sa-set-username').value = creds.username;
    document.getElementById('sa-set-password').value = creds.password;
    document.getElementById('modal-sa-settings')?.classList.remove('hidden');
  });

  document.getElementById('form-sa-credentials')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUser = String(document.getElementById('sa-set-username')?.value || '').trim();
    const newPass = String(document.getElementById('sa-set-password')?.value || '');
    if (!newUser || !newPass) return;
    saveMasterCredentials(newUser, newPass);
    document.getElementById('modal-sa-settings')?.classList.add('hidden');
    saShowToast('Credentials saved!', 'success');
  });

  // Export & Import Directory JSON
  document.getElementById('btn-sa-export-registry')?.addEventListener('click', () => {
    const payload = {
      app: 'HolyStarPOS_SuperAdmin_Directory',
      exported_at: new Date().toISOString(),
      stores: window.HolyStarDB.getTelemetryRegistryMap(),
      token_log: getTokenLog()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HolyStar_Stores_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('input-sa-import-registry')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const registry = window.HolyStarDB.getTelemetryRegistryMap();
      if (parsed?.telemetry_summary?.store_id) {
        const t = parsed.telemetry_summary;
        registry[t.store_id] = { ...(registry[t.store_id] || {}), ...t };
      } else if (parsed?.stores && typeof parsed.stores === 'object') {
        Object.assign(registry, parsed.stores);
      }
      window.HolyStarDB.saveTelemetryRegistryMap(registry);
      e.target.value = '';
      await refreshPlatformStores(false);
      saShowToast('Stores imported!', 'success');
    } catch {
      e.target.value = '';
      saShowToast('Invalid JSON file', 'error');
    }
  });

  // Close Modals
  document.querySelectorAll('[data-close-sa-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close-sa-modal');
      document.getElementById(target)?.classList.add('hidden');
    });
  });
}
