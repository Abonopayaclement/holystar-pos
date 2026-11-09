/**
 * Holy Star POS - Super-Admin Executive Command Center (super-admin.js v3.4)
 * Features:
 * - 3-Page Multi-Tab Architecture: Overview, Stores, Admin Settings
 * - Focus on Platform Owner's Subscription Revenue (Weekly GHS 5, Monthly GHS 20)
 * - Pure-JS Canvas Charts: Weekly Subscription Revenue & Daily Store Syncs / DAU
 * - Single Store Details Modal & 1-Click Cryptographic SHA-256 Token Generator
 * - Broadcast Announcement Banner to shops & Subscription Pricing Config
 * - Strict 10-Digit Phone Validation & 100% Vector SVG Icons (Zero Emojis)
 */

const SA_SECRET = 'HOLY_STAR_SECRET_2026';
const SA_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SA_CREDS_KEY = 'holystar_superadmin_creds_v1';
const SA_SESSION_KEY = 'holystar_superadmin_session_v1';
const SA_TOKEN_LOG_KEY = 'holystar_superadmin_token_log_v1';
const SA_PRICING_KEY = 'holystar_admin_pricing_v1';
const SA_BROADCAST_KEY = 'holystar_admin_broadcast_v1';
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
  activeTab: 'overview',
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

function validateSa10DigitPhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  return /^\d{10}$/.test(clean) ? clean : null;
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
  const iconSvg = type === 'success'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : type === 'error'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  toast.innerHTML = `<span style="display:flex; align-items:center;">${iconSvg}</span><span>${saEscapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3200);
}

// ============================================================================
// PRICING CONFIG, TOKENS & BROADCAST SETTINGS
// ============================================================================

function getPricingConfig() {
  try {
    const raw = localStorage.getItem(SA_PRICING_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        weekly: Number(p.weekly) || 5.0,
        monthly: Number(p.monthly) || 20.0,
        trialDays: Number(p.trialDays) || 7
      };
    }
  } catch (e) {}
  return { weekly: 5.0, monthly: 20.0, trialDays: 7 };
}

function savePricingConfig(weekly, monthly, trialDays) {
  const config = {
    weekly: Math.max(1, Number(weekly) || 5.0),
    monthly: Math.max(1, Number(monthly) || 20.0),
    trialDays: Math.max(1, Number(trialDays) || 7)
  };
  localStorage.setItem(SA_PRICING_KEY, JSON.stringify(config));
  return config;
}

function getBroadcastConfig() {
  try {
    const raw = localStorage.getItem(SA_BROADCAST_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { message: '', active: false, updated_at: 0 };
}

function saveBroadcastConfig(message, active) {
  const config = {
    message: String(message || '').trim(),
    active: Boolean(active),
    updated_at: Date.now()
  };
  localStorage.setItem(SA_BROADCAST_KEY, JSON.stringify(config));
  return config;
}

function getMasterCredentials() {
  try {
    const raw = localStorage.getItem(SA_CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username && parsed.password) {
        return parsed;
      }
    }
  } catch (e) {}
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
    localStorage.setItem(SA_TOKEN_LOG_KEY, JSON.stringify(list.slice(0, 150)));
  } catch (e) {}
}

function calculateRevenueForPlan(days, pricing) {
  const p = pricing || getPricingConfig();
  const d = Number(days);
  if (d <= 7) return p.weekly;
  if (d <= 14) return p.weekly * 2;
  return p.monthly;
}

function calculateStoreSubscriptionPaid(storeId) {
  const cleanId = String(storeId || '').trim().toUpperCase();
  const tokens = getTokenLog().filter((t) => t.store_id === cleanId && !t.revoked);
  const pricing = getPricingConfig();
  return tokens.reduce((sum, t) => sum + calculateRevenueForPlan(t.plan_days, pricing), 0);
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

    // Update tab count
    const tabCount = document.getElementById('sa-tab-store-count');
    if (tabCount) tabCount.textContent = String(AdminState.stores.length);

    renderOverviewPage();
    renderStoresList();
    renderSettingsPage();

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
      } catch (e) {}
    };
  } catch (err) {}
}

// ============================================================================
// PAGE 1: OVERVIEW & INTERACTIVE CHARTS
// Focus strictly on subscription revenue, NOT store sales!
// ============================================================================

function renderOverviewPage() {
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

  // Calculate Subscription Earnings from Token Log
  const pricing = getPricingConfig();
  const tokenLog = getTokenLog().filter((t) => !t.revoked);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * TWENTY_FOUR_HOURS_MS;

  let totalSubRev = 0;
  let weeklySubRev = 0;

  for (const t of tokenLog) {
    const rev = calculateRevenueForPlan(t.plan_days, pricing);
    totalSubRev += rev;
    if (t.created_at >= sevenDaysAgo) {
      weeklySubRev += rev;
    }
  }

  const elSubRev = document.getElementById('kpi-total-sub-revenue');
  const elWeeklySubRev = document.getElementById('kpi-weekly-sub-revenue');
  const elStores = document.getElementById('kpi-total-stores');
  const elActive = document.getElementById('kpi-active-subs');
  const elExpired = document.getElementById('kpi-expired-subs');
  const elOffline = document.getElementById('kpi-offline-pill');

  if (elSubRev) elSubRev.textContent = saFormatGHS(totalSubRev);
  if (elWeeklySubRev) elWeeklySubRev.textContent = `${saFormatGHS(weeklySubRev)} this week`;
  if (elStores) elStores.textContent = String(stores.length);
  if (elActive) elActive.textContent = String(activeCount);
  if (elExpired) elExpired.textContent = String(expiredCount);
  if (elOffline) elOffline.textContent = String(offlineCount);

  // Render the 2 Charts
  renderWeeklySubRevenueChart(tokenLog, pricing);
  renderDailyStoreSyncChart(stores);
}

function renderWeeklySubRevenueChart(tokenLog, pricing) {
  const canvas = document.getElementById('sa-sub-revenue-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 500;
  const height = 190;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  // Group tokens into past 6 weeks
  const now = Date.now();
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const end = now - i * 7 * TWENTY_FOUR_HOURS_MS;
    const start = end - 7 * TWENTY_FOUR_HOURS_MS;
    const dateLabel = new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    let amount = 0;
    for (const t of tokenLog) {
      if (t.created_at >= start && t.created_at < end) {
        amount += calculateRevenueForPlan(t.plan_days, pricing);
      }
    }
    weeks.push({ label: i === 0 ? 'This Wk' : dateLabel, amount });
  }

  const maxVal = Math.max(10, ...weeks.map((w) => w.amount * 1.25));
  const paddingLeft = 45;
  const paddingBottom = 28;
  const paddingTop = 20;
  const plotW = width - paddingLeft - 20;
  const plotH = height - paddingTop - paddingBottom;

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, sans-serif';

  for (let step = 0; step <= 3; step++) {
    const yVal = Math.round((maxVal / 3) * step);
    const y = paddingTop + plotH - (yVal / maxVal) * plotH;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
    ctx.fillText(`${yVal}`, 8, y + 3);
  }

  // Draw Bars
  const barWidth = Math.min(36, (plotW / weeks.length) * 0.55);
  const gap = plotW / weeks.length;

  weeks.forEach((w, idx) => {
    const x = paddingLeft + idx * gap + (gap - barWidth) / 2;
    const barH = (w.amount / maxVal) * plotH;
    const y = paddingTop + plotH - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(0, y, 0, paddingTop + plotH);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(1, '#d97706');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Value label on top
    if (w.amount > 0) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${w.amount}`, x + barWidth / 2, Math.max(14, y - 5));
    }

    // X Axis Label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.label, x + barWidth / 2, height - 8);
  });
}

function renderDailyStoreSyncChart(stores) {
  const canvas = document.getElementById('sa-sync-activity-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 500;
  const height = 190;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  // Group store syncs by day (past 7 days)
  const now = Date.now();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dTime = now - i * TWENTY_FOUR_HOURS_MS;
    const dStr = new Date(dTime).toLocaleDateString('en-GB', { weekday: 'short' });
    const start = dTime - TWENTY_FOUR_HOURS_MS / 2;
    const end = dTime + TWENTY_FOUR_HOURS_MS / 2;

    let syncCount = 0;
    for (const s of stores) {
      if (s.last_synced_ts && s.last_synced_ts >= start && s.last_synced_ts <= end) {
        syncCount++;
      }
    }
    // Ensure active stores appear
    if (i === 0) {
      syncCount = Math.max(syncCount, stores.filter((s) => s.is_synced_24h).length);
    }
    days.push({ label: i === 0 ? 'Today' : dStr, count: syncCount });
  }

  const maxVal = Math.max(5, ...days.map((d) => d.count * 1.3));
  const paddingLeft = 35;
  const paddingBottom = 28;
  const paddingTop = 20;
  const plotW = width - paddingLeft - 20;
  const plotH = height - paddingTop - paddingBottom;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, sans-serif';

  for (let step = 0; step <= 3; step++) {
    const yVal = Math.round((maxVal / 3) * step);
    const y = paddingTop + plotH - (yVal / maxVal) * plotH;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
    ctx.fillText(`${yVal}`, 8, y + 3);
  }

  // Draw Bars
  const barWidth = Math.min(32, (plotW / days.length) * 0.52);
  const gap = plotW / days.length;

  days.forEach((d, idx) => {
    const x = paddingLeft + idx * gap + (gap - barWidth) / 2;
    const barH = (d.count / maxVal) * plotH;
    const y = paddingTop + plotH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, paddingTop + plotH);
    grad.addColorStop(0, '#4f46e5');
    grad.addColorStop(1, '#4338ca');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
    ctx.fill();

    if (d.count > 0) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${d.count}`, x + barWidth / 2, Math.max(14, y - 5));
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barWidth / 2, height - 8);
  });
}

// ============================================================================
// PAGE 2: STORES DIRECTORY & SINGLE STORE DETAILS MODAL
// ============================================================================

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
      <div class="empty-state" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:2.5rem; text-align:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" style="margin-bottom:0.6rem;"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>
        <div style="font-weight:800; font-size:1rem; color:#0f172a;">${AdminState.stores.length === 0 ? 'No Stores Registered' : 'No Stores Match Query'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((s) => {
      const subPill = s.computed_sub_status === 'EXPIRED'
        ? `<span class="sa-badge sa-badge-red">Expired</span>`
        : `<span class="sa-badge sa-badge-green">Active (${s.days_remaining}d left)</span>`;

      const syncPill = s.is_synced_24h
        ? `<span class="sa-badge sa-badge-blue">Synced Online</span>`
        : `<span class="sa-badge sa-badge-amber">Offline (>24h)</span>`;

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
              <span class="sa-store-name btn-sa-view-detail" data-store-id="${saEscapeHtml(s.store_id)}">${saEscapeHtml(s.store_name)}</span>
              <span class="sa-category-tag">${saEscapeHtml(s.store_category || 'Retail')}</span>
            </div>
            <div class="sa-owner-row">
              <span>${saEscapeHtml(s.owner_name || 'Owner')}</span>
              <span>${saEscapeHtml(s.owner_phone || '-')}</span>
              ${waDigits ? `<a href="${waHref}" target="_blank" rel="noopener" class="sa-wa-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                WhatsApp
              </a>` : ''}
            </div>
          </div>

          <!-- 2. Inventory Items & Stock Units (Store Sales Hidden for Privacy) -->
          <div class="sa-store-metrics">
            <div><span class="sa-metrics-val">${Number(s.total_products_count || 0)}</span> item types</div>
            <div style="color:#64748b;">${Number(s.total_stock_units || 0)} total units</div>
          </div>

          <!-- 3. Status Badges -->
          <div class="sa-store-badges">
            ${subPill}
            ${syncPill}
          </div>

          <!-- 4. Actions -->
          <div style="display:flex; align-items:center; gap:0.45rem; justify-content:flex-end;">
            <button type="button" class="btn-view-store btn-sa-view-detail" data-store-id="${saEscapeHtml(s.store_id)}">
              Details
            </button>
            <button type="button" class="btn-generate-token btn-sa-row-token" data-store-id="${saEscapeHtml(s.store_id)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m21 2-2 2m-1.5 1.5L14 9l-2-2-4 4 2 2-3 3-2-2-3 3 5 5 8-8m2-2 2-2"/></svg>
              + Token
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

  container.querySelectorAll('.btn-sa-view-detail').forEach((btn) => {
    btn.addEventListener('click', () => {
      openSingleStoreDetailModal(btn.dataset.storeId);
    });
  });
}

function openSingleStoreDetailModal(storeId) {
  const store = AdminState.stores.find((s) => s.store_id === storeId);
  if (!store) return;

  const content = document.getElementById('sa-store-detail-content');
  if (!content) return;

  const subPaid = calculateStoreSubscriptionPaid(store.store_id);
  const waDigits = saCleanWhatsAppPhone(store.owner_phone);
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello ${store.owner_name || ''}, checking in from Holy Star POS regarding ${store.store_name} (${store.store_id}).`)}`
    : '#';

  const subBadge = store.computed_sub_status === 'EXPIRED'
    ? `<span class="sa-badge sa-badge-red">Expired</span>`
    : `<span class="sa-badge sa-badge-green">Active (${store.days_remaining}d remaining)</span>`;

  content.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:1rem; margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <span class="sa-store-id-tag">${saEscapeHtml(store.store_id)}</span>
        <span class="sa-category-tag">${saEscapeHtml(store.store_category || 'Retail')}</span>
      </div>
      <h3 style="font-size:1.15rem; font-weight:900; margin:0 0 0.35rem; color:#0f172a;">${saEscapeHtml(store.store_name)}</h3>
      <div style="font-size:0.8rem; color:#64748b;">
        Location: <strong>${saEscapeHtml(store.store_location || 'Accra')}</strong>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.65rem; margin-bottom:1rem;">
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:0.75rem;">
        <div style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase;">Owner</div>
        <div style="font-weight:900; font-size:0.9rem; color:#0f172a;">${saEscapeHtml(store.owner_name || '-')}</div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:0.15rem;">${saEscapeHtml(store.owner_phone || '-')}</div>
        ${waDigits ? `<div style="margin-top:0.35rem;"><a href="${waHref}" target="_blank" class="sa-wa-btn">WhatsApp</a></div>` : ''}
      </div>

      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:0.75rem;">
        <div style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase;">Inventory</div>
        <div style="font-weight:900; font-size:0.9rem; color:#0f172a;">${Number(store.total_products_count || 0)} Items</div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:0.15rem;">${Number(store.total_stock_units || 0)} Total Stock Units</div>
      </div>
    </div>

    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:0.85rem; margin-bottom:1rem;">
      <div style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.4rem;">Subscription &amp; Platform Revenue</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
        <span style="font-size:0.82rem; color:#475569;">Current Status:</span>
        <div>${subBadge}</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
        <span style="font-size:0.82rem; color:#475569;">Expiry Date:</span>
        <strong style="font-size:0.82rem; color:#0f172a;">${saFormatShortDate(store.effective_expiry_ts)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:0.4rem; border-top:1px dashed #e2e8f0;">
        <span style="font-size:0.82rem; font-weight:800; color:#1e293b;">Total Subscriptions Paid to Me:</span>
        <strong style="font-size:0.95rem; font-weight:900; color:#f59e0b;">${saFormatGHS(subPaid)}</strong>
      </div>
    </div>

    <div style="font-size:0.74rem; color:#94a3b8; text-align:center;">
      Last Cloud Sync: ${store.last_synced_ts ? new Date(store.last_synced_ts).toLocaleString('en-GB') : 'Never'}
    </div>
  `;

  const btnOpenToken = document.getElementById('btn-sa-detail-open-token');
  if (btnOpenToken) {
    btnOpenToken.onclick = () => {
      document.getElementById('modal-sa-store-detail')?.classList.add('hidden');
      openTokenModalForStore(store.store_id);
    };
  }

  document.getElementById('modal-sa-store-detail')?.classList.remove('hidden');
}

// ============================================================================
// PAGE 3: ADMIN SETTINGS & TOKEN LOGS
// ============================================================================

function renderSettingsPage() {
  const creds = getMasterCredentials();
  const pricing = getPricingConfig();
  const broadcast = getBroadcastConfig();

  const userEl = document.getElementById('sa-set-username');
  const passEl = document.getElementById('sa-set-password');
  if (userEl) userEl.value = creds.username;
  if (passEl) passEl.value = creds.password;

  const wPriceEl = document.getElementById('sa-price-weekly');
  const mPriceEl = document.getElementById('sa-price-monthly');
  const trialEl = document.getElementById('sa-trial-days');
  if (wPriceEl) wPriceEl.value = pricing.weekly;
  if (mPriceEl) mPriceEl.value = pricing.monthly;
  if (trialEl) trialEl.value = pricing.trialDays;

  const bMsgEl = document.getElementById('sa-broadcast-message');
  const bActiveEl = document.getElementById('sa-broadcast-active');
  if (bMsgEl) bMsgEl.value = broadcast.message || '';
  if (bActiveEl) bActiveEl.checked = Boolean(broadcast.active);

  renderTokenLogsTable();
}

function renderTokenLogsTable() {
  const listEl = document.getElementById('sa-token-logs-list');
  if (!listEl) return;

  const logs = getTokenLog();
  if (logs.length === 0) {
    listEl.innerHTML = `<div style="color:#64748b; text-align:center; padding:1rem;">No tokens generated yet.</div>`;
    return;
  }

  listEl.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
      <thead>
        <tr style="border-bottom:1px solid #e2e8f0; color:#64748b; text-align:left;">
          <th style="padding:0.35rem;">Store</th>
          <th style="padding:0.35rem;">Days</th>
          <th style="padding:0.35rem;">Token</th>
          <th style="padding:0.35rem;">Date</th>
          <th style="padding:0.35rem; text-align:right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${logs
          .slice(0, 40)
          .map((t, idx) => `
            <tr style="border-bottom:1px solid #f1f5f9; ${t.revoked ? 'opacity:0.45; text-decoration:line-through;' : ''}">
              <td style="padding:0.35rem; font-weight:800;">${saEscapeHtml(t.store_id)}</td>
              <td style="padding:0.35rem;">${t.plan_days}d</td>
              <td style="padding:0.35rem; font-family:monospace; font-weight:900; color:#d97706;">${saEscapeHtml(t.token)}</td>
              <td style="padding:0.35rem; color:#64748b;">${saFormatShortDate(t.created_at)}</td>
              <td style="padding:0.35rem; text-align:right;">
                ${t.revoked ? '<span style="color:#ef4444; font-weight:800;">Revoked</span>' : `<button type="button" class="btn btn-outline btn-sm btn-revoke-token" data-index="${idx}" style="padding:0.1rem 0.4rem; font-size:0.68rem; color:#ef4444; border-color:#fca5a5;">Revoke</button>`}
              </td>
            </tr>
          `)
          .join('')}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll('.btn-revoke-token').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      const allLogs = getTokenLog();
      if (allLogs[idx]) {
        allLogs[idx].revoked = true;
        saveTokenLog(allLogs);
        renderTokenLogsTable();
        renderOverviewPage();
        saShowToast('Token revoked', 'info');
      }
    });
  });
}

// ============================================================================
// TOKEN GENERATOR MODAL & WHATSAPP DELIVERY
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
  const newExpectedExpiryTs = currentExpiry + planDays * TWENTY_FOUR_HOURS_MS;

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
  window.HolyStarDB.pushTelemetryToCloud(registry[storeId]).catch(() => {});

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
  // 1. Tab Switching: Overview | Stores | Admin Settings
  document.querySelectorAll('.sa-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sa-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.saTab;
      AdminState.activeTab = tab;

      document.querySelectorAll('.sa-page-panel').forEach((panel) => panel.classList.remove('active'));
      const activePanel = document.getElementById(`sa-panel-${tab}`);
      if (activePanel) activePanel.classList.add('active');

      if (tab === 'overview') {
        renderOverviewPage();
      } else if (tab === 'stores') {
        renderStoresList();
      } else if (tab === 'settings') {
        renderSettingsPage();
      }
    });
  });

  // 2. Login Form
  document.getElementById('form-sa-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userIn = String(document.getElementById('sa-login-username')?.value || '').trim();
    const passIn = String(document.getElementById('sa-login-password')?.value || '');
    const master = getMasterCredentials();

    if (userIn === master.username && passIn === master.password) {
      const passEl = document.getElementById('sa-login-password');
      if (passEl) passEl.value = '';
      await unlockDashboard();
      saShowToast('Console Unlocked', 'success');
    } else {
      saShowToast('Invalid credentials', 'error');
    }
  });

  // 3. Lock Button
  document.getElementById('btn-sa-logout')?.addEventListener('click', () => {
    AdminState.unlocked = false;
    sessionStorage.removeItem(SA_SESSION_KEY);
    document.getElementById('sa-login-overlay')?.classList.remove('hidden');
  });

  // 4. Sync Button
  document.getElementById('btn-sa-sync-now')?.addEventListener('click', async () => {
    saShowToast('Syncing stores with cloud...', 'info');
    await refreshPlatformStores(true);
    saShowToast('All stores synced!', 'success');
  });

  // 5. Open Blank Token Modal
  document.getElementById('btn-sa-open-token-modal-blank')?.addEventListener('click', () => {
    openTokenModalForStore('');
  });

  // 6. Filter Pills in Stores tab
  document.querySelectorAll('.sa-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sa-filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AdminState.filter = btn.dataset.saFilter || 'ALL';
      renderStoresList();
    });
  });

  // 7. Search Input
  const searchIn = document.getElementById('sa-store-search-input');
  if (searchIn) {
    searchIn.addEventListener('input', () => {
      AdminState.searchQuery = searchIn.value;
      renderStoresList();
    });
  }

  // 8. Plan Duration Buttons inside + Token Modal
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

  // 9. Add Offline Store Modal
  document.getElementById('btn-sa-open-manual-store')?.addEventListener('click', () => {
    document.getElementById('modal-sa-manual-store')?.classList.remove('hidden');
  });

  // Restrict phone inputs to 10 digits
  ['sa-man-owner-phone', 'sa-gen-owner-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('maxlength', '10');
      el.setAttribute('inputmode', 'numeric');
      el.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      });
    }
  });

  document.getElementById('form-sa-manual-store')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const storeId = String(document.getElementById('sa-man-store-id')?.value || '').trim().toUpperCase();
    const category = String(document.getElementById('sa-man-category')?.value || 'Provision & Mini-Mart').trim();
    const storeName = String(document.getElementById('sa-man-store-name')?.value || '').trim();
    const ownerName = String(document.getElementById('sa-man-owner-name')?.value || '').trim();
    const ownerPhone = String(document.getElementById('sa-man-owner-phone')?.value || '').trim();

    const cleanPhone = validateSa10DigitPhone(ownerPhone);
    if (!cleanPhone) {
      saShowToast('Phone number must be exactly 10 digits (e.g. 0244123456)', 'error');
      return;
    }

    if (!storeId || !storeName) return;

    const now = Date.now();
    const registry = window.HolyStarDB.getTelemetryRegistryMap();
    registry[storeId] = {
      ...(registry[storeId] || {}),
      store_id: storeId,
      store_name: storeName,
      store_category: category,
      owner_name: ownerName,
      owner_phone: cleanPhone,
      created_at: new Date(now).toISOString(),
      created_at_ts: now,
      total_products_count: registry[storeId]?.total_products_count || 0,
      total_stock_units: registry[storeId]?.total_stock_units || 0,
      total_sales_count: 0,
      total_revenue_ghs: 0,
      license_plan: '7-Day Free Trial',
      license_status: 'Trial_Active',
      license_expiry_ts: now + 7 * TWENTY_FOUR_HOURS_MS,
      license_expiry_date: new Date(now + 7 * TWENTY_FOUR_HOURS_MS).toISOString(),
      offline_manual_only: true
    };

    window.HolyStarDB.saveTelemetryRegistryMap(registry);
    window.HolyStarDB.pushTelemetryToCloud(registry[storeId]).catch(() => {});

    document.getElementById('modal-sa-manual-store')?.classList.add('hidden');
    e.target.reset();
    await refreshPlatformStores(false);
    openTokenModalForStore(storeId);
  });

  // 10. Broadcast Announcement Form
  document.getElementById('form-sa-broadcast')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('sa-broadcast-message')?.value;
    const active = document.getElementById('sa-broadcast-active')?.checked;
    saveBroadcastConfig(msg, active);

    // Push broadcast announcement to cloud config
    const syncCfg = window.HolyStarDB.getCloudSyncConfig();
    if (syncCfg.topic) {
      fetch(`https://ntfy.sh/${encodeURIComponent(syncCfg.topic)}`, {
        method: 'POST',
        headers: {
          Title: 'Broadcast Announcement',
          Tags: 'mega',
          Priority: 'default'
        },
        body: JSON.stringify({
          broadcast_announcement: {
            message: String(msg || '').trim(),
            active: Boolean(active),
            updated_at: Date.now()
          }
        })
      }).catch(() => {});
    }

    saShowToast('Announcement broadcasted to shops!', 'success');
  });

  // 11. Pricing Config Form
  document.getElementById('form-sa-pricing')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const w = document.getElementById('sa-price-weekly')?.value;
    const m = document.getElementById('sa-price-monthly')?.value;
    const t = document.getElementById('sa-trial-days')?.value;
    savePricingConfig(w, m, t);
    renderOverviewPage();
    saShowToast('Pricing configuration saved!', 'success');
  });

  // 12. Admin Credentials Form
  document.getElementById('form-sa-credentials')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUser = String(document.getElementById('sa-set-username')?.value || '').trim();
    const newPass = String(document.getElementById('sa-set-password')?.value || '');
    if (!newUser || !newPass) return;
    saveMasterCredentials(newUser, newPass);
    saShowToast('Master credentials updated!', 'success');
  });

  // 13. Export & Import Directory JSON
  document.getElementById('btn-sa-export-registry')?.addEventListener('click', () => {
    const payload = {
      app: 'HolyStarPOS_SuperAdmin_Directory',
      exported_at: new Date().toISOString(),
      stores: window.HolyStarDB.getTelemetryRegistryMap(),
      token_log: getTokenLog(),
      pricing: getPricingConfig()
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
      if (parsed?.token_log && Array.isArray(parsed.token_log)) {
        saveTokenLog(parsed.token_log);
      }
      window.HolyStarDB.saveTelemetryRegistryMap(registry);
      e.target.value = '';
      await refreshPlatformStores(false);
      saShowToast('Stores & directory imported successfully!', 'success');
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
