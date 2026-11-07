/**
 * Holy Star POS - Super-Admin Command Center & Store Sync Heartbeat Engine (super-admin.js)
 * Features:
 * - Protected Master Login (Default: holystar_admin / HolyStar@2026, customizable)
 * - Top-Level Platform KPI Cards (Stores, Subscriptions, Online vs Offline Sync, Platform Sales/Products)
 * - Privacy-Respecting Store Directory Table with Search & Status Filters
 * - Built-in SHA-256 Token Generator (7, 14, 30, or Custom Days) + 1-Tap WhatsApp Delivery
 * - Real-Time Cloud + Local Cross-Store Telemetry Sync Heartbeat
 */

const SA_SECRET = 'HOLY_STAR_SECRET_2026';
const SA_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SA_CREDS_KEY = 'holystar_superadmin_creds_v1';
const SA_SESSION_KEY = 'holystar_superadmin_session_v1';
const SA_TOKEN_LOG_KEY = 'holystar_superadmin_token_log_v1';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// PURE-JS FIPS 180-4 SHA-256 & TOKEN GENERATOR (MATCHES POS & ADMIN-KEYGEN)
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

function saFormatDate(tsOrIso) {
  if (!tsOrIso) return '-';
  const d = new Date(tsOrIso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function saFormatShortDate(tsOrIso) {
  if (!tsOrIso) return 'Never';
  const d = new Date(tsOrIso);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function saTimeAgo(ts) {
  const num = Number(ts || 0);
  if (!num) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - num) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
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
  }, 3600);
}

// ============================================================================
// MASTER CREDENTIALS & SESSION MANAGEMENT
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
  } catch (e) {
    // Fallback to default
  }
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
  } catch (e) {
    // Ignore storage error
  }
}

function buildRenewalWhatsAppMessage({ ownerName, storeName, storeId, planDays, token }) {
  const cleanOwner = String(ownerName || 'Valued Partner').trim() || 'Valued Partner';
  const cleanStore = String(storeName || 'Your Store').trim() || 'Your Store';
  const cleanId = String(storeId || 'HS-0000').trim().toUpperCase();
  return `Hello ${cleanOwner}, your Holy Star POS subscription for ${cleanStore} (${cleanId}) has been renewed for ${planDays} days. Enter Unlock Token: *${token}* in your POS Settings.`;
}

// ============================================================================
// INITIALIZATION & REAL-TIME HEARTBEAT SYNC
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await window.HolyStarDB.init();
  bindSuperAdminEvents();

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
  renderTokenLogTable();
  startLiveCloudStream();

  // Auto-refresh relative timestamps and local store changes every 20 seconds
  setInterval(() => {
    if (AdminState.unlocked) {
      refreshPlatformStores(false);
    }
  }, 20000);
}

async function refreshPlatformStores(pullFromCloud = true) {
  try {
    let list = [];
    if (pullFromCloud) {
      list = await window.HolyStarDB.pullCloudTelemetry();
    } else {
      list = await window.HolyStarDB.getAllStoresTelemetry();
    }

    // Normalize & enrich each store's computed status
    const now = Date.now();
    AdminState.stores = (list || []).map((s) => {
      const effectiveExpiryTs = Number(s.admin_expected_expiry_ts || s.license_expiry_ts || Date.parse(s.license_expiry_date) || now);
      const msLeft = effectiveExpiryTs - now;
      const daysRemaining = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;

      let computedSubStatus = 'ACTIVE';
      let badgeLabel = 'Active';
      const planStr = String(s.license_plan || '').toLowerCase();

      if (s.license_status === 'Clock_Tamper_Locked') {
        computedSubStatus = 'EXPIRED';
        badgeLabel = 'Tamper Locked';
      } else if (msLeft <= 0) {
        computedSubStatus = 'EXPIRED';
        badgeLabel = 'Expired';
      } else if (daysRemaining <= 2) {
        computedSubStatus = 'EXPIRING_SOON';
        badgeLabel = 'Expiring Soon';
      } else if (planStr.includes('trial') || s.license_status === 'Trial_Active') {
        computedSubStatus = 'ACTIVE';
        badgeLabel = 'Trial';
      }

      const lastSyncedTs = Number(s.last_synced_ts || Date.parse(s.last_synced_at) || 0);
      const isSyncedRecently = lastSyncedTs > 0 && (now - lastSyncedTs) <= TWENTY_FOUR_HOURS_MS && !s.offline_manual_only;

      return {
        ...s,
        effective_expiry_ts: effectiveExpiryTs,
        days_remaining: daysRemaining,
        computed_sub_status: computedSubStatus,
        sub_badge_label: badgeLabel,
        last_synced_ts: lastSyncedTs,
        is_synced_24h: isSyncedRecently
      };
    });

    // Sort newest activity first
    AdminState.stores.sort((a, b) => (b.last_synced_ts || b.created_at_ts || 0) - (a.last_synced_ts || a.created_at_ts || 0));

    renderKpiCards();
    renderStoresDirectoryTable();

    const refreshEl = document.getElementById('sa-last-refresh-text');
    if (refreshEl) {
      refreshEl.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }
  } catch (err) {
    console.error('Failed to refresh platform stores:', err);
  }
}

function startLiveCloudStream() {
  if (AdminState.sseSource) {
    try { AdminState.sseSource.close(); } catch (e) {}
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
          if (parsed && parsed._type === 'HOLYSTAR_STORE_HEARTBEAT_V1' && parsed.telemetry && parsed.telemetry.store_id) {
            const registry = window.HolyStarDB.getTelemetryRegistryMap();
            const t = parsed.telemetry;
            registry[t.store_id] = {
              ...(registry[t.store_id] || {}),
              ...t,
              last_synced_ts: Date.now(),
              last_synced_at: new Date().toISOString()
            };
            window.HolyStarDB.saveTelemetryRegistryMap(registry);
            refreshPlatformStores(false);
            saShowToast(`📡 Live Sync Heartbeat from ${t.store_name} (${t.store_id})`, 'info');
          }
        }
      } catch (e) {
        // Ignore non-JSON ping
      }
    };
  } catch (err) {
    // Ignore SSE connection error
  }
}

// ============================================================================
// RENDER TOP-LEVEL KPI CARDS & STORE DIRECTORY TABLE
// ============================================================================

function renderKpiCards() {
  const stores = AdminState.stores;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  let activeCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let synced24hCount = 0;
  let offlineCount = 0;
  let totalProducts = 0;
  let totalSalesCount = 0;
  let totalSalesVolume = 0;
  let newThisWeek = 0;
  const categoriesSet = new Set();

  for (const s of stores) {
    if (s.store_category) categoriesSet.add(s.store_category);
    const createdTs = Number(s.created_at_ts || Date.parse(s.created_at) || 0);
    if (createdTs && (now - createdTs) <= sevenDaysMs) {
      newThisWeek++;
    }

    if (s.computed_sub_status === 'EXPIRED') {
      expiredCount++;
    } else if (s.computed_sub_status === 'EXPIRING_SOON') {
      expiringSoonCount++;
      activeCount++;
    } else {
      activeCount++;
    }

    if (s.is_synced_24h) {
      synced24hCount++;
    } else {
      offlineCount++;
    }

    totalProducts += Number(s.total_products_count || 0);
    totalSalesCount += Number(s.total_sales_count || 0);
    totalSalesVolume += Number(s.total_revenue_ghs || 0);
  }

  document.getElementById('kpi-total-stores').textContent = String(stores.length);
  document.getElementById('kpi-new-stores-week').textContent = `${newThisWeek} registered this week`;
  document.getElementById('kpi-categories-count').textContent = `${categoriesSet.size} categor${categoriesSet.size === 1 ? 'y' : 'ies'}`;

  document.getElementById('kpi-active-subs').textContent = `${activeCount} Active`;
  document.getElementById('kpi-expiring-soon').textContent = `⚠️ ${expiringSoonCount} Expiring Soon (≤2d)`;
  document.getElementById('kpi-expired-subs').textContent = `🔒 ${expiredCount} Expired / Renewal`;

  document.getElementById('kpi-synced-online').textContent = `${synced24hCount} Synced Online`;
  document.getElementById('kpi-synced-pill').textContent = `🟢 ${synced24hCount} Synced (<24h)`;
  document.getElementById('kpi-offline-pill').textContent = `🟠 ${offlineCount} Offline / Unsynced (>24h)`;

  document.getElementById('kpi-platform-sales-vol').textContent = saFormatGHS(totalSalesVolume);
  document.getElementById('kpi-platform-sales-count').textContent = `🧾 ${totalSalesCount} Total Sales`;
  document.getElementById('kpi-platform-products-count').textContent = `📦 ${totalProducts} Products Listed`;
}

function renderStoresDirectoryTable() {
  const tbody = document.getElementById('sa-stores-table-body');
  const countBadge = document.getElementById('sa-showing-count-badge');
  if (!tbody) return;

  const query = AdminState.searchQuery.trim().toLowerCase();
  const filtered = AdminState.stores.filter((s) => {
    if (AdminState.filter === 'ACTIVE' && s.computed_sub_status === 'EXPIRED') return false;
    if (AdminState.filter === 'EXPIRING_SOON' && s.computed_sub_status !== 'EXPIRING_SOON') return false;
    if (AdminState.filter === 'EXPIRED' && s.computed_sub_status !== 'EXPIRED') return false;
    if (AdminState.filter === 'OFFLINE' && s.is_synced_24h) return false;

    if (!query) return true;
    return (
      String(s.store_id || '').toLowerCase().includes(query) ||
      String(s.store_name || '').toLowerCase().includes(query) ||
      String(s.store_category || '').toLowerCase().includes(query) ||
      String(s.owner_name || '').toLowerCase().includes(query) ||
      String(s.owner_phone || '').toLowerCase().includes(query) ||
      String(s.location || '').toLowerCase().includes(query)
    );
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Store${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2.5rem 1rem; color:var(--text-secondary);">
          <div style="font-size:1.75rem; margin-bottom:0.4rem;">🏪</div>
          <div style="font-weight:800; color:var(--text-primary); margin-bottom:0.25rem;">
            ${AdminState.stores.length === 0 ? 'No Registered Stores Synced Yet' : 'No Stores Match Current Filter'}
          </div>
          <div style="font-size:0.8rem;">
            ${AdminState.stores.length === 0
              ? 'When a shop registers in Holy Star POS or you click "➕ Add Offline Store", it will appear here immediately.'
              : 'Try switching filter pills or clearing the search box.'}
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((s) => {
      // Subscription status badge
      let subBadgeHtml = `<span class="sa-pill sa-pill-green">✔ Active</span>`;
      if (s.sub_badge_label === 'Trial') {
        subBadgeHtml = `<span class="sa-pill sa-pill-blue">🎁 Trial</span>`;
      } else if (s.sub_badge_label === 'Expiring Soon') {
        subBadgeHtml = `<span class="sa-pill sa-pill-amber">⚠️ Expiring Soon</span>`;
      } else if (s.computed_sub_status === 'EXPIRED') {
        subBadgeHtml = `<span class="sa-pill sa-pill-red">🔒 ${saEscapeHtml(s.sub_badge_label)}</span>`;
      }

      // Sync / Connection Status
      let syncHtml = '';
      if (s.is_synced_24h) {
        syncHtml = `
          <div>
            <span class="sa-pill sa-pill-green">
              <span class="sync-dot online"></span> Synced ${saEscapeHtml(saTimeAgo(s.last_synced_ts))}
            </span>
            <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:0.22rem;">
              ${saEscapeHtml(saFormatDate(s.last_synced_ts))}
            </div>
          </div>
        `;
      } else {
        const sinceDate = s.last_synced_ts ? saFormatShortDate(s.last_synced_ts) : saFormatShortDate(s.created_at);
        syncHtml = `
          <div>
            <span class="sa-pill sa-pill-amber">
              <span class="sync-dot offline"></span> Offline / Unsynced since ${saEscapeHtml(sinceDate)}
            </span>
            <div style="font-size:0.72rem; color:#b45309; margin-top:0.22rem;">
              Running offline on shop device
            </div>
          </div>
        `;
      }

      const waDigits = saCleanWhatsAppPhone(s.owner_phone);
      const waGreet = encodeURIComponent(`Hello ${s.owner_name || ''}, checking in from Holy Star POS Support regarding ${s.store_name} (${s.store_id}).`);
      const waLink = waDigits ? `https://wa.me/${waDigits}?text=${waGreet}` : '#';

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
              <span style="font-family:monospace; font-weight:900; font-size:0.86rem; background:#0f172a; color:#fbbf24; padding:0.15rem 0.45rem; border-radius:6px;">
                ${saEscapeHtml(s.store_id)}
              </span>
              <span style="font-weight:800; color:var(--text-primary); font-size:0.92rem;">
                ${saEscapeHtml(s.store_name)}
              </span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
              🏷️ ${saEscapeHtml(s.store_category || 'Retail')} ${s.location ? `• 📍 ${saEscapeHtml(s.location)}` : ''}
            </div>
          </td>

          <td>
            <div style="font-weight:700; color:var(--text-primary);">${saEscapeHtml(s.owner_name || '-')}</div>
            <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.2rem; flex-wrap:wrap;">
              <span style="font-size:0.78rem; color:var(--text-secondary);">📞 ${saEscapeHtml(s.owner_phone || '-')}</span>
              ${
                waDigits
                  ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="sa-pill sa-pill-green" style="text-decoration:none; font-size:0.68rem;">💬 WhatsApp</a>`
                  : ''
              }
            </div>
          </td>

          <td>
            <div style="font-size:0.8rem; font-weight:700; color:var(--text-primary);">
              📦 <strong>${Number(s.total_products_count || 0)} items</strong>
              <span style="color:var(--text-secondary); font-weight:600;">(${Number(s.total_stock_units || 0)} units)</span>
            </div>
            <div style="font-size:0.8rem; font-weight:800; color:#1e3a8a; margin-top:0.2rem;">
              🧾 ${Number(s.total_sales_count || 0)} sales | ${saFormatGHS(s.total_revenue_ghs || 0)}
            </div>
          </td>

          <td>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
              ${subBadgeHtml}
              <strong style="font-size:0.78rem; color:${s.days_remaining <= 2 ? '#b91c1c' : '#0f172a'};">
                ${s.days_remaining}d left
              </strong>
            </div>
            <div style="font-size:0.73rem; color:var(--text-secondary); margin-top:0.22rem;">
              Expires: <strong>${saEscapeHtml(saFormatDate(s.effective_expiry_ts))}</strong>
            </div>
          </td>

          <td>${syncHtml}</td>

          <td>
            <button type="button" class="btn btn-primary btn-sm btn-sa-row-token" data-store-id="${saEscapeHtml(s.store_id)}" style="background:#d97706; border-color:#d97706; font-weight:800;">
              🔑 Generate Token
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.btn-sa-row-token').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storeId = btn.dataset.storeId;
      selectStoreForTokenGeneration(storeId);
    });
  });
}

// ============================================================================
// TOKEN GENERATOR & 1-TAP WHATSAPP DELIVERY
// ============================================================================

function getNextIssueSerialForStore(storeId) {
  const cleanId = String(storeId || '').trim().toUpperCase();
  const log = getTokenLog().filter((item) => item.store_id === cleanId);
  const nextNum = log.length + 1;
  return String(nextNum).padStart(3, '0');
}

function selectStoreForTokenGeneration(storeId) {
  const store = AdminState.stores.find((s) => s.store_id === storeId);
  if (!store) return;

  const idInput = document.getElementById('sa-gen-store-id');
  const issueInput = document.getElementById('sa-gen-issue-code');
  const nameInput = document.getElementById('sa-gen-store-name');
  const ownerInput = document.getElementById('sa-gen-owner-name');
  const phoneInput = document.getElementById('sa-gen-owner-phone');

  if (idInput) idInput.value = store.store_id;
  if (issueInput) issueInput.value = getNextIssueSerialForStore(store.store_id);
  if (nameInput) nameInput.value = store.store_name || '';
  if (ownerInput) ownerInput.value = store.owner_name || '';
  if (phoneInput) phoneInput.value = store.owner_phone || '';

  const card = document.getElementById('sa-keygen-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Immediately generate token with current plan selection for 1-click speed
  triggerTokenGeneration();
}

async function triggerTokenGeneration() {
  const storeId = String(document.getElementById('sa-gen-store-id')?.value || '').trim().toUpperCase();
  const issueCode = String(document.getElementById('sa-gen-issue-code')?.value || '001').trim().toUpperCase();
  const storeName = String(document.getElementById('sa-gen-store-name')?.value || '').trim();
  const ownerName = String(document.getElementById('sa-gen-owner-name')?.value || '').trim();
  const ownerPhone = String(document.getElementById('sa-gen-owner-phone')?.value || '').trim();
  const planSelect = document.getElementById('sa-gen-plan-select')?.value || '30';
  const customDaysVal = Number(document.getElementById('sa-gen-custom-days')?.value || 30);

  if (!storeId) {
    saShowToast('Please enter a Target Store ID (e.g. HS-4821).', 'error');
    return;
  }

  const planDays = planSelect === 'CUSTOM'
    ? Math.max(1, Math.min(365, Math.floor(customDaysVal || 30)))
    : Number(planSelect);

  const token = generateSuperAdminToken(storeId, planDays, issueCode);
  const now = Date.now();

  // Update expected expiry date in Admin registry & view
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
    total_revenue_ghs: 0,
    offline_manual_only: true
  };

  const currentExpiry = Math.max(now, Number(existing.admin_expected_expiry_ts || existing.license_expiry_ts || now));
  const newExpectedExpiryTs = currentExpiry + planDays * 24 * 60 * 60 * 1000;

  registry[storeId] = {
    ...existing,
    store_name: storeName || existing.store_name || `Store ${storeId}`,
    owner_name: ownerName || existing.owner_name || 'Store Owner',
    owner_phone: ownerPhone || existing.owner_phone || '',
    license_plan: `${planDays}-Day Prepaid Pass`,
    license_status: 'Active',
    admin_expected_expiry_ts: newExpectedExpiryTs,
    admin_expected_expiry_date: new Date(newExpectedExpiryTs).toISOString()
  };
  window.HolyStarDB.saveTelemetryRegistryMap(registry);

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

  // Log in Admin Token History
  const log = getTokenLog();
  log.unshift(AdminState.lastGenerated);
  saveTokenLog(log);

  // Render output box
  const panel = document.getElementById('sa-generated-token-panel');
  document.getElementById('sa-out-store-label').textContent = `${resolvedStoreName} (${storeId})`;
  document.getElementById('sa-out-days-label').textContent = String(planDays);
  document.getElementById('sa-out-token-code').textContent = token;
  document.getElementById('sa-out-expiry-preview').textContent = `Expected Expiry: ${saFormatDate(newExpectedExpiryTs)} (Issue #${issueCode})`;
  if (panel) panel.classList.remove('hidden');

  renderTokenLogTable();
  await refreshPlatformStores(false);
  saShowToast(`Generated ${planDays}-Day Token ${token} for ${storeId}!`, 'success');
}

function renderTokenLogTable() {
  const tbody = document.getElementById('sa-token-history-tbody');
  if (!tbody) return;

  const log = getTokenLog();
  if (log.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:1.25rem; color:var(--text-secondary); font-size:0.78rem;">
          No tokens generated yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = log
    .slice(0, 25)
    .map((item) => {
      return `
        <tr>
          <td>
            <div style="font-weight:800; font-family:monospace; font-size:0.8rem;">${saEscapeHtml(item.store_id)}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary);">${saEscapeHtml(item.store_name || '')}</div>
          </td>
          <td>
            <span class="sa-pill sa-pill-blue">+${saEscapeHtml(item.plan_days)}d</span>
            <div style="font-size:0.68rem; color:var(--text-muted);">#${saEscapeHtml(item.issue_code)}</div>
          </td>
          <td style="font-family:monospace; font-weight:900; font-size:0.9rem; color:#d97706;">
            ${saEscapeHtml(item.token)}
          </td>
          <td>
            <button type="button" class="btn btn-whatsapp btn-sm btn-sa-log-wa" data-token-id="${saEscapeHtml(item.id)}" style="padding:0.25rem 0.5rem; font-size:0.72rem;">
              💬 Send
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.btn-sa-log-wa').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = getTokenLog().find((x) => x.id === btn.dataset.tokenId);
      if (entry) {
        sendTokenViaWhatsApp(entry);
      }
    });
  });
}

function sendTokenViaWhatsApp(tokenEntry) {
  if (!tokenEntry) return;
  const msg = tokenEntry.wa_message || buildRenewalWhatsAppMessage({
    ownerName: tokenEntry.owner_name,
    storeName: tokenEntry.store_name,
    storeId: tokenEntry.store_id,
    planDays: tokenEntry.plan_days,
    token: tokenEntry.token
  });

  const cleanPhone = saCleanWhatsAppPhone(tokenEntry.owner_phone);
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
      saShowToast('Welcome to Holy Star Super-Admin Command Center!', 'success');
    } else {
      saShowToast('Invalid Super-Admin username or password.', 'error');
    }
  });

  // 2. Lock / Logout Button
  document.getElementById('btn-sa-logout')?.addEventListener('click', () => {
    AdminState.unlocked = false;
    sessionStorage.removeItem(SA_SESSION_KEY);
    document.getElementById('sa-login-overlay')?.classList.remove('hidden');
    saShowToast('Super-Admin Command Center locked.', 'info');
  });

  // 3. Sync Now Button
  document.getElementById('btn-sa-sync-now')?.addEventListener('click', async () => {
    saShowToast('Syncing store telemetry across local & cloud channels...', 'info');
    await refreshPlatformStores(true);
    saShowToast('All registered stores synced!', 'success');
  });

  // 4. Filter Buttons
  document.querySelectorAll('.sa-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sa-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AdminState.filter = btn.dataset.saFilter || 'ALL';
      renderStoresDirectoryTable();
    });
  });

  // 5. Search Input
  const searchIn = document.getElementById('sa-store-search-input');
  if (searchIn) {
    searchIn.addEventListener('input', () => {
      AdminState.searchQuery = searchIn.value;
      renderStoresDirectoryTable();
    });
  }

  // 6. Plan Selector Custom Days Toggle
  const planSelect = document.getElementById('sa-gen-plan-select');
  const customWrap = document.getElementById('sa-custom-days-wrap');
  if (planSelect && customWrap) {
    planSelect.addEventListener('change', () => {
      customWrap.classList.toggle('hidden', planSelect.value !== 'CUSTOM');
    });
  }

  // Auto-fill store details if admin types an existing Store ID manually
  document.getElementById('sa-gen-store-id')?.addEventListener('input', (e) => {
    const typedId = String(e.target.value || '').trim().toUpperCase();
    const match = AdminState.stores.find((s) => s.store_id === typedId);
    if (match) {
      document.getElementById('sa-gen-store-name').value = match.store_name || '';
      document.getElementById('sa-gen-owner-name').value = match.owner_name || '';
      document.getElementById('sa-gen-owner-phone').value = match.owner_phone || '';
      document.getElementById('sa-gen-issue-code').value = getNextIssueSerialForStore(typedId);
    }
  });

  // 7. Token Generator Form Submit
  document.getElementById('form-sa-generate-token')?.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerTokenGeneration();
  });

  // 8. 1-Tap WhatsApp & Copy Buttons
  document.getElementById('btn-sa-send-token-whatsapp')?.addEventListener('click', () => {
    if (AdminState.lastGenerated) {
      sendTokenViaWhatsApp(AdminState.lastGenerated);
    }
  });

  document.getElementById('btn-sa-copy-token')?.addEventListener('click', async () => {
    if (!AdminState.lastGenerated) return;
    try {
      await navigator.clipboard.writeText(AdminState.lastGenerated.token);
      saShowToast(`Token ${AdminState.lastGenerated.token} copied!`, 'success');
    } catch {
      saShowToast('Select and copy the token above.', 'info');
    }
  });

  document.getElementById('btn-sa-copy-wa-msg')?.addEventListener('click', async () => {
    if (!AdminState.lastGenerated) return;
    try {
      await navigator.clipboard.writeText(AdminState.lastGenerated.wa_message);
      saShowToast('Full WhatsApp renewal message copied!', 'success');
    } catch {
      saShowToast('Could not copy automatically.', 'info');
    }
  });

  document.getElementById('btn-sa-clear-token-log')?.addEventListener('click', () => {
    if (!confirm('Clear issued token history log?')) return;
    saveTokenLog([]);
    renderTokenLogTable();
  });

  // 9. Add Offline Store Modal
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
      license_plan: '7-Day Free Trial (Offline Registered)',
      license_status: 'Trial_Active',
      license_expiry_ts: now + 7 * 24 * 60 * 60 * 1000,
      license_expiry_date: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      offline_manual_only: true
    };

    window.HolyStarDB.saveTelemetryRegistryMap(registry);
    window.HolyStarDB.pushTelemetryToCloud(registry[storeId]).catch(() => {});

    document.getElementById('modal-sa-manual-store')?.classList.add('hidden');
    e.target.reset();
    await refreshPlatformStores(false);
    selectStoreForTokenGeneration(storeId);
    saShowToast(`Offline store "${storeName}" (${storeId}) added to directory!`, 'success');
  });

  // 10. Admin Settings Modal
  document.getElementById('btn-sa-open-settings')?.addEventListener('click', () => {
    const creds = getMasterCredentials();
    const cloudCfg = window.HolyStarDB.getCloudSyncConfig();

    document.getElementById('sa-set-username').value = creds.username;
    document.getElementById('sa-set-password').value = creds.password;
    document.getElementById('sa-set-cloud-topic').value = cloudCfg.topic;
    document.getElementById('sa-set-custom-webhook').value = cloudCfg.customUrl;

    document.getElementById('modal-sa-settings')?.classList.remove('hidden');
  });

  document.getElementById('form-sa-credentials')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUser = String(document.getElementById('sa-set-username')?.value || '').trim();
    const newPass = String(document.getElementById('sa-set-password')?.value || '');
    if (!newUser || !newPass) {
      saShowToast('Username and password cannot be empty.', 'error');
      return;
    }
    saveMasterCredentials(newUser, newPass);
    saShowToast('Master Super-Admin credentials updated!', 'success');
  });

  document.getElementById('form-sa-cloud-config')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = String(document.getElementById('sa-set-cloud-topic')?.value || '').trim();
    const customUrl = String(document.getElementById('sa-set-custom-webhook')?.value || '').trim();
    localStorage.setItem('holystar_cloud_sync_topic', topic || 'holystar_pos_telemetry_sync_2026_v1');
    localStorage.setItem('holystar_cloud_sync_custom_url', customUrl);

    startLiveCloudStream();
    await refreshPlatformStores(true);
    saShowToast('Cloud Sync Heartbeat channel updated!', 'success');
  });

  // Export & Import Directory Snapshot
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
    a.download = `HolyStar_SuperAdmin_Directory_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    saShowToast('Store directory JSON exported!', 'success');
  });

  document.getElementById('input-sa-import-registry')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const registry = window.HolyStarDB.getTelemetryRegistryMap();

      if (parsed && parsed.telemetry_summary && parsed.telemetry_summary.store_id) {
        // Single store backup file imported
        const t = parsed.telemetry_summary;
        registry[t.store_id] = { ...(registry[t.store_id] || {}), ...t };
      } else if (parsed && parsed.stores && typeof parsed.stores === 'object') {
        Object.assign(registry, parsed.stores);
      }

      window.HolyStarDB.saveTelemetryRegistryMap(registry);
      e.target.value = '';
      await refreshPlatformStores(false);
      saShowToast('Store telemetry imported into Super-Admin directory!', 'success');
    } catch (err) {
      e.target.value = '';
      saShowToast('Invalid JSON file.', 'error');
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

