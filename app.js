/**
 * Holy Star POS - Main Application Logic (app.js)
 * Complete offline-first retail POS, Inventory Profit Tracker, Debtors Credit Book,
 * Owner Anti-Theft Close Day Reporting, and Cryptographic Prepaid Token Verification.
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

  // UTF-8 encode string to byte array
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
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hash7 = h[7];

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

      const t1 = (hash7 + sigma1 + ch + k[i] + w[i]) | 0;
      const t2 = (sigma0 + maj) | 0;

      hash7 = g;
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
    h[7] = (h[7] + hash7) | 0;
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

/**
 * Deterministic 8-Character Uppercase Alphanumeric Token Generator
 * Formula: SHA-256( SHOP_ID + "|" + PLAN_DAYS + "|" + ISSUE_CODE + "|" + SECRET )
 */
function generateLicenseToken(shopId, planDays, issueCode) {
  const cleanShop = String(shopId || '').trim().toUpperCase();
  const cleanDays = String(Number(planDays));
  const cleanIssue = String(issueCode || '').trim().toUpperCase();
  const payload = `${cleanShop}|${cleanDays}|${cleanIssue}|${HOLY_STAR_SECRET}`;

  const digest = sha256Bytes(payload);
  let token = '';
  for (let i = 0; i < 8; i++) {
    const chunk =
      ((digest[i * 4] << 24) >>> 0) +
      ((digest[i * 4 + 1] << 16) >>> 0) +
      ((digest[i * 4 + 2] << 8) >>> 0) +
      (digest[i * 4 + 3] >>> 0);
    token += ALPHANUM_CHARS[chunk % ALPHANUM_CHARS.length];
  }
  return token;
}

/**
 * Generate 6-Character Anti-Tamper Seal for Owner Close-Day Report
 * Formula: SHA-256( DATE + "|" + REVENUE + "|" + PROFIT + "|" + SHOP_ID + "|" + SECRET )
 */
function generateCloseDaySeal(dateStr, totalRevenue, grossProfit, shopId) {
  const rev = Number(totalRevenue || 0).toFixed(2);
  const prof = Number(grossProfit || 0).toFixed(2);
  const shop = String(shopId || 'HS-001').trim().toUpperCase();
  const payload = `SEAL|${dateStr}|${rev}|${prof}|${shop}|${HOLY_STAR_SECRET}`;
  const digest = sha256Bytes(payload);
  let code = '';
  for (let i = 0; i < 6; i++) {
    const val = ((digest[i * 2] << 8) | digest[i * 2 + 1]) >>> 0;
    code += ALPHANUM_CHARS[val % ALPHANUM_CHARS.length];
  }
  return code;
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

const AppState = {
  settings: {},
  products: [],
  debtors: [],
  sales: [],
  cart: [], // [{ id, name, selling_price, cost_price, stock_qty, qty }]
  selectedCategory: 'ALL',
  posSearchQuery: '',
  selectedPaymentMethod: 'Cash',
  isProcessingSale: false, // Rule 4: Prevent double-click duplicate checkout
  isLicenseActive: true,
  isClockValid: true
};

// ============================================================================
// INITIALIZATION & SERVICE WORKER REGISTRATION
// ============================================================================

let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) {
    installBtn.classList.remove('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
  showToast('🎉 Holy Star POS installed! You can now open it 100% offline from your home screen.', 'success');
});

document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  setupEventListeners();
  await refreshAllData();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(() => {
        // Ignore SW errors on file:// protocol
      });
  }
}

async function refreshAllData() {
  try {
    await window.HolyStarDB.init();
    const clockStatus = await window.HolyStarDB.TouchClock();
    AppState.isClockValid = clockStatus.valid;

    const [settings, products, debtors, sales] = await Promise.all([
      window.HolyStarDB.getSettings(),
      window.HolyStarDB.getAllProducts(),
      window.HolyStarDB.getAllDebtors(),
      window.HolyStarDB.getAllSales()
    ]);

    AppState.settings = settings;
    AppState.products = products;
    AppState.debtors = debtors;
    AppState.sales = sales;

    // Set default date picker if empty
    const datePicker = document.getElementById('sales-date-picker');
    if (datePicker && !datePicker.value) {
      datePicker.value = window.HolyStarDB.formatLocalDate();
    }

    evaluateLicenseAndClock(clockStatus);
    renderHeaderAndSettings();
    renderPOSCatalog();
    renderCart();
    renderInventoryTab();
    renderDebtorsTab();
    await renderSalesTab();
    await renderUsedTokensList();
  } catch (err) {
    showToast(err.message || 'Error loading application data.', 'error');
  }
}

// ============================================================================
// LICENSE & ANTI-TAMPER CLOCK ENFORCEMENT
// ============================================================================

function evaluateLicenseAndClock(clockStatus) {
  const now = Date.now();
  const expiry = Number(AppState.settings.license_expiry || 0);
  const clockTampered = !clockStatus.valid || Boolean(AppState.settings.clock_tampered);

  AppState.isClockValid = !clockTampered;
  AppState.isLicenseActive = expiry > now && !clockTampered;

  const pill = document.getElementById('license-status-pill');
  const pillText = document.getElementById('license-pill-text');
  const expiredBanner = document.getElementById('expired-license-banner');
  const clockBanner = document.getElementById('clock-tamper-banner');
  const clockMsg = document.getElementById('clock-tamper-msg');

  if (clockTampered) {
    clockBanner.classList.remove('hidden');
    if (clockStatus && clockStatus.message) {
      clockMsg.textContent = clockStatus.message;
    }
  } else {
    clockBanner.classList.add('hidden');
  }

  const msRemaining = expiry - now;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  pill.classList.remove('license-active', 'license-warning', 'license-expired');

  if (clockTampered) {
    pill.classList.add('license-expired');
    pillText.textContent = '⛔ Clock Tamper Locked';
    expiredBanner.classList.add('hidden');
  } else if (msRemaining <= 0) {
    pill.classList.add('license-expired');
    pillText.textContent = '🔒 License Expired (Read-Only)';
    expiredBanner.classList.remove('hidden');
  } else if (daysRemaining <= 2) {
    pill.classList.add('license-warning');
    pillText.textContent = `⚠️ ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Left`;
    expiredBanner.classList.add('hidden');
  } else {
    pill.classList.add('license-active');
    pillText.textContent = `✅ Active: ${daysRemaining} Days Left`;
    expiredBanner.classList.add('hidden');
  }

  // Enforce Read-Only locks when License is Expired or Clock Tampered:
  // Stock, Debtors Book, and Sales History remain 100% readable,
  // while Checkout, Adding Stock, and Adding New Debtors are disabled.
  const canMutate = AppState.isLicenseActive;

  const btnCheckout = document.getElementById('btn-complete-sale');
  const btnAddProduct = document.getElementById('btn-open-product-modal');
  const btnAddDebtor = document.getElementById('btn-open-manual-debtor-modal');

  if (btnCheckout) {
    btnCheckout.disabled = !canMutate || AppState.isProcessingSale;
  }
  if (btnAddProduct) {
    btnAddProduct.disabled = !canMutate;
    btnAddProduct.title = canMutate ? '' : 'License expired — Enter an unlock token to add new stock';
  }
  if (btnAddDebtor) {
    btnAddDebtor.disabled = !canMutate;
    btnAddDebtor.title = canMutate ? '' : 'License expired — Enter an unlock token to add new debtors';
  }
}

function renderHeaderAndSettings() {
  const s = AppState.settings;
  const shopName = s.shop_name || 'Holy Star Provision Store';
  const shopId = s.shop_id || 'HS-001';
  const shopLoc = s.shop_location || 'Bolgatanga Central Market';
  const ownerPhone = s.owner_phone || '';
  const expiry = Number(s.license_expiry || 0);
  const now = Date.now();
  const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));

  document.getElementById('header-shop-name').textContent = shopName;
  document.getElementById('header-shop-id').textContent = shopId;
  document.getElementById('header-shop-location').textContent = shopLoc;

  // Settings tab display
  document.getElementById('settings-display-shop-id').textContent = shopId;
  document.getElementById('settings-license-plan').textContent = s.license_plan || 'Prepaid License';
  document.getElementById('settings-license-expiry-date').textContent = expiry
    ? `${new Date(expiry).toLocaleString()} (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left)`
    : 'Expired';

  const statusTextEl = document.getElementById('settings-license-status-text');
  if (!AppState.isClockValid) {
    statusTextEl.textContent = '⛔ Locked (Clock Rollback Detected)';
    statusTextEl.style.color = 'var(--danger)';
  } else if (expiry > now) {
    statusTextEl.textContent = `✅ Active (${daysRemaining} Days Remaining)`;
    statusTextEl.style.color = 'var(--success)';
  } else {
    statusTextEl.textContent = '🔒 Expired (Read-Only Mode Active)';
    statusTextEl.style.color = 'var(--danger)';
  }

  const clockEl = document.getElementById('settings-clock-status');
  if (AppState.isClockValid) {
    clockEl.textContent = `✔ Verified (${new Date().toLocaleTimeString()})`;
    clockEl.style.color = 'var(--success)';
  } else {
    clockEl.textContent = '⛔ Clock Rolled Backward — Fix Device Time';
    clockEl.style.color = 'var(--danger)';
  }

  // Populate settings form inputs if not currently focused
  const inputShopId = document.getElementById('setting-shop-id');
  const inputShopName = document.getElementById('setting-shop-name');
  const inputOwnerPhone = document.getElementById('setting-owner-phone');
  const inputShopLoc = document.getElementById('setting-shop-location');

  if (document.activeElement !== inputShopId) inputShopId.value = shopId;
  if (document.activeElement !== inputShopName) inputShopName.value = shopName;
  if (document.activeElement !== inputOwnerPhone) inputOwnerPhone.value = ownerPhone;
  if (document.activeElement !== inputShopLoc) inputShopLoc.value = shopLoc;
}

async function renderUsedTokensList() {
  const container = document.getElementById('used-tokens-list');
  const used = await window.HolyStarDB.getUsedTokens();
  if (!used.length) {
    container.innerHTML = 'No unlock tokens used yet on this device.';
    return;
  }
  used.sort((a, b) => (b.applied_at || 0) - (a.applied_at || 0));
  container.innerHTML = used
    .map(
      (t) =>
        `<div style="padding:0.25rem 0; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between;">
          <span><strong>${escapeHtml(t.token_code)}</strong> (Issue: ${escapeHtml(t.issue_code)} • +${t.plan_days}d)</span>
          <span>${new Date(t.applied_at).toLocaleDateString()}</span>
        </div>`
    )
    .join('');
}

// ============================================================================
// TAB 1: POS CATALOG & HARDENED CART LOGIC
// ============================================================================

function renderPOSCatalog() {
  const categories = ['ALL', ...new Set(AppState.products.map((p) => p.category || 'General'))];
  const chipsContainer = document.getElementById('pos-category-chips');

  chipsContainer.innerHTML = categories
    .map(
      (cat) =>
        `<button type="button" class="chip ${AppState.selectedCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
          ${cat === 'ALL' ? 'All Categories' : escapeHtml(cat)}
        </button>`
    )
    .join('');

  const query = AppState.posSearchQuery.trim().toLowerCase();
  const filtered = AppState.products.filter((p) => {
    const matchesCat = AppState.selectedCategory === 'ALL' || p.category === AppState.selectedCategory;
    const matchesQuery =
      !query ||
      p.name.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query));
    return matchesCat && matchesQuery;
  });

  const grid = document.getElementById('pos-product-grid');
  if (AppState.products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p style="margin-bottom:0.75rem; font-weight:700;">No products in inventory yet.</p>
        <button type="button" class="btn btn-warning" onclick="handleLoadDemoData()">
          🇬🇭 Load Realistic Ghanaian Shop Demo Data
        </button>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No matching products found.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((p) => {
      const isOut = p.stock_qty <= 0;
      const isLow = !isOut && p.stock_qty <= (p.low_stock_threshold ?? 5);
      let badgeClass = 'badge-ok';
      let badgeLabel = `In Stock: ${p.stock_qty}`;
      if (isOut) {
        badgeClass = 'badge-out';
        badgeLabel = 'Out of Stock';
      } else if (isLow) {
        badgeClass = 'badge-low';
        badgeLabel = `Low: ${p.stock_qty} left`;
      }

      return `
        <div class="product-tile ${isOut ? 'out-of-stock' : ''}" data-prod-id="${escapeHtml(p.id)}">
          <div>
            <div class="product-tile-cat">${escapeHtml(p.category)}</div>
            <div class="product-tile-name">${escapeHtml(p.name)}</div>
          </div>
          <div class="product-tile-footer">
            <span class="product-tile-price">GHS ${Number(p.selling_price).toFixed(2)}</span>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Populate existing debtors quick-select in Credit checkout panel
  const existingSelect = document.getElementById('credit-existing-select');
  if (existingSelect) {
    const currentVal = existingSelect.value;
    existingSelect.innerHTML =
      `<option value="">-- New Customer or Select Existing --</option>` +
      AppState.debtors
        .map(
          (d) =>
            `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.phone)}) — Owed: GHS ${Number(d.total_owed || 0).toFixed(2)}</option>`
        )
        .join('');
    existingSelect.value = currentVal;
  }
}

function addToCart(productId) {
  if (!AppState.isLicenseActive) {
    showToast('License is expired or clock is locked. Enter an unlock token in Settings to make sales.', 'error');
    return;
  }

  const product = AppState.products.find((p) => p.id === productId);
  if (!product) return;

  if (product.stock_qty <= 0) {
    showToast(`"${product.name}" is Out of Stock!`, 'error');
    return;
  }

  const existing = AppState.cart.find((c) => c.id === productId);
  if (existing) {
    // Reliability Rule 3: Prevent cart quantity from exceeding stock_qty
    if (existing.qty + 1 > product.stock_qty) {
      showToast(`Cannot exceed available stock (${product.stock_qty}) for "${product.name}".`, 'warning');
      return;
    }
    existing.qty += 1;
  } else {
    AppState.cart.push({
      id: product.id,
      name: product.name,
      selling_price: Number(product.selling_price),
      cost_price: Number(product.cost_price),
      stock_qty: Number(product.stock_qty),
      qty: 1
    });
  }

  renderCart();
}

function updateCartItemQty(productId, rawQty) {
  const item = AppState.cart.find((c) => c.id === productId);
  const product = AppState.products.find((p) => p.id === productId);
  if (!item || !product) return;

  const parsed = Number(rawQty);

  // Reliability Rule 2: Reject zero, negative, decimal, or NaN quantities
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    showToast('Quantity must be a positive whole number (1 or more).', 'error');
    renderCart();
    return;
  }

  // Reliability Rule 3: Prevent cart quantity from exceeding stock_qty
  if (parsed > product.stock_qty) {
    showToast(`Only ${product.stock_qty} units of "${product.name}" available in stock.`, 'warning');
    item.qty = product.stock_qty;
    renderCart();
    return;
  }

  item.qty = parsed;
  renderCart();
}

function removeFromCart(productId) {
  AppState.cart = AppState.cart.filter((c) => c.id !== productId);
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const totalItemsEl = document.getElementById('cart-total-items');
  const totalAmountEl = document.getElementById('cart-total-amount');
  const btnComplete = document.getElementById('btn-complete-sale');

  // Sync stock_qty with latest products state
  AppState.cart = AppState.cart.filter((c) => {
    const p = AppState.products.find((prod) => prod.id === c.id);
    if (!p || p.stock_qty <= 0) return false;
    c.stock_qty = p.stock_qty;
    c.selling_price = p.selling_price;
    c.cost_price = p.cost_price;
    if (c.qty > p.stock_qty) c.qty = p.stock_qty;
    return true;
  });

  if (AppState.cart.length === 0) {
    container.innerHTML = `<div class="empty-state">Cart is empty. Tap any product on the left to add it.</div>`;
    totalItemsEl.textContent = '0';
    totalAmountEl.textContent = 'GHS 0.00';
    btnComplete.textContent = AppState.isLicenseActive
      ? '✅ Complete Sale (GHS 0.00)'
      : '🔒 License Expired (Checkout Locked)';
    btnComplete.disabled = !AppState.isLicenseActive || AppState.isProcessingSale;
    updateCashChangeAndCreditPreview(0);
    return;
  }

  let totalQty = 0;
  let totalAmount = 0;

  container.innerHTML = AppState.cart
    .map((item) => {
      const subtotal = item.selling_price * item.qty;
      totalQty += item.qty;
      totalAmount += subtotal;

      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-title">${escapeHtml(item.name)}</div>
            <div class="cart-item-meta">GHS ${item.selling_price.toFixed(2)} each • Max: ${item.stock_qty}</div>
          </div>
          <div class="cart-qty-controls">
            <button type="button" class="qty-btn" data-qty-action="dec" data-id="${escapeHtml(item.id)}">−</button>
            <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.stock_qty}" step="1" data-qty-input="${escapeHtml(item.id)}" />
            <button type="button" class="qty-btn" data-qty-action="inc" data-id="${escapeHtml(item.id)}">+</button>
          </div>
          <div class="cart-item-subtotal">GHS ${subtotal.toFixed(2)}</div>
          <button type="button" class="cart-remove-btn" title="Remove item" data-remove-id="${escapeHtml(item.id)}">&times;</button>
        </div>
      `;
    })
    .join('');

  totalItemsEl.textContent = String(totalQty);
  totalAmountEl.textContent = `GHS ${totalAmount.toFixed(2)}`;

  if (AppState.isProcessingSale) {
    btnComplete.textContent = '⏳ Processing Sale...';
    btnComplete.disabled = true;
  } else if (!AppState.isLicenseActive) {
    btnComplete.textContent = '🔒 License Expired (Checkout Locked)';
    btnComplete.disabled = true;
  } else {
    btnComplete.textContent = `✅ Complete ${AppState.selectedPaymentMethod} Sale (GHS ${totalAmount.toFixed(2)})`;
    btnComplete.disabled = false;
  }

  updateCashChangeAndCreditPreview(totalAmount);
}

function updateCashChangeAndCreditPreview(totalAmount) {
  const cashInput = document.getElementById('cash-tendered-input');
  const changeOut = document.getElementById('cash-change-output');
  if (cashInput && changeOut) {
    const tendered = Number(cashInput.value || 0);
    if (tendered > totalAmount && totalAmount > 0) {
      changeOut.textContent = `GHS ${(tendered - totalAmount).toFixed(2)}`;
      changeOut.style.color = 'var(--success)';
    } else if (tendered > 0 && tendered < totalAmount) {
      changeOut.textContent = `Short: GHS ${(totalAmount - tendered).toFixed(2)}`;
      changeOut.style.color = 'var(--danger)';
    } else {
      changeOut.textContent = 'GHS 0.00';
      changeOut.style.color = 'var(--success)';
    }
  }

  const depositInput = document.getElementById('credit-initial-deposit');
  const creditPreview = document.getElementById('credit-balance-preview-amount');
  if (depositInput && creditPreview) {
    const deposit = Math.max(0, Number(depositInput.value || 0));
    const owed = Math.max(0, totalAmount - deposit);
    creditPreview.textContent = `GHS ${owed.toFixed(2)}`;
  }
}

async function handleCheckoutSubmit() {
  // Reliability Rule 4: Prevent duplicate sales from double-clicking Checkout
  if (AppState.isProcessingSale) return;

  if (!AppState.isLicenseActive) {
    showToast('Checkout is locked. Please enter a valid Unlock Token in Settings.', 'error');
    return;
  }

  // Reliability Rule 1: Reject empty-cart checkouts
  if (!Array.isArray(AppState.cart) || AppState.cart.length === 0) {
    showToast('Cannot complete sale: Your cart is empty.', 'error');
    return;
  }

  // Reliability Rules 2 & 3: Validate every item quantity and stock limit before starting transaction
  for (const item of AppState.cart) {
    const q = Number(item.qty);
    if (isNaN(q) || !Number.isInteger(q) || q <= 0) {
      showToast(`Invalid quantity for "${item.name}". Must be a whole number >= 1.`, 'error');
      return;
    }
    const liveProduct = AppState.products.find((p) => p.id === item.id);
    if (!liveProduct || q > liveProduct.stock_qty) {
      showToast(`Insufficient stock for "${item.name}". Available: ${liveProduct ? liveProduct.stock_qty : 0}.`, 'error');
      return;
    }
  }

  let creditDetails = null;
  if (AppState.selectedPaymentMethod === 'Credit') {
    const customerName = document.getElementById('credit-customer-name').value.trim();
    const customerPhone = document.getElementById('credit-customer-phone').value.trim();
    const customerLocation = document.getElementById('credit-customer-location').value.trim();
    const initialDeposit = Number(document.getElementById('credit-initial-deposit').value || 0);
    const depositMethod = document.getElementById('credit-deposit-method').value;
    const dueDate = document.getElementById('credit-due-date').value;

    if (!customerName) {
      showToast('Customer Full Name is required for Credit sales.', 'error');
      document.getElementById('credit-customer-name').focus();
      return;
    }
    if (!customerPhone) {
      showToast('Customer Phone Number is required for Credit sales.', 'error');
      document.getElementById('credit-customer-phone').focus();
      return;
    }
    if (!customerLocation) {
      showToast('Customer Location / Landmark is required for Credit sales.', 'error');
      document.getElementById('credit-customer-location').focus();
      return;
    }
    if (isNaN(initialDeposit) || initialDeposit < 0) {
      showToast('Initial deposit cannot be negative.', 'error');
      return;
    }

    const cartTotal = AppState.cart.reduce((sum, i) => sum + i.selling_price * i.qty, 0);
    if (initialDeposit >= cartTotal) {
      showToast('Initial deposit covers the entire total! Please use Cash or MoMo instead of Credit.', 'warning');
      return;
    }

    creditDetails = {
      customerName,
      customerPhone,
      customerLocation,
      initialDeposit,
      depositMethod,
      dueDate
    };
  }

  // Acquire checkout lock
  AppState.isProcessingSale = true;
  renderCart();

  try {
    // Reliability Rule 5: Single atomic IndexedDB transaction for stock deduction + sale record + debtor update
    const result = await window.HolyStarDB.processAtomicCheckout({
      cartItems: AppState.cart.map((c) => ({ id: c.id, qty: c.qty })),
      paymentMethod: AppState.selectedPaymentMethod,
      creditDetails
    });

    // Clear cart & credit form inputs on success
    AppState.cart = [];
    document.getElementById('cash-tendered-input').value = '';
    document.getElementById('credit-existing-select').value = '';
    document.getElementById('credit-customer-name').value = '';
    document.getElementById('credit-customer-phone').value = '';
    document.getElementById('credit-customer-location').value = '';
    document.getElementById('credit-initial-deposit').value = '0';
    document.getElementById('credit-due-date').value = '';

    await refreshAllData();
    showToast(`Sale ${result.sale.id} completed! Total: GHS ${result.sale.total_amount.toFixed(2)}`, 'success');
    openReceiptModal(result.sale.id);
  } catch (err) {
    showToast(err.message || 'Transaction failed. Stock was not deducted.', 'error');
  } finally {
    AppState.isProcessingSale = false;
    renderCart();
  }
}

// ============================================================================
// TAB 2: INVENTORY & STOCK RENDERING
// ============================================================================

function renderInventoryTab() {
  const products = AppState.products;
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let alertCount = 0;

  for (const p of products) {
    totalCostValue += Number(p.cost_price) * Number(p.stock_qty);
    totalRetailValue += Number(p.selling_price) * Number(p.stock_qty);
    if (p.stock_qty <= (p.low_stock_threshold ?? 5)) {
      alertCount++;
    }
  }

  const expectedProfit = totalRetailValue - totalCostValue;

  document.getElementById('inv-metric-count').textContent = String(products.length);
  document.getElementById('inv-metric-cost').textContent = `GHS ${totalCostValue.toFixed(2)}`;
  document.getElementById('inv-metric-retail').textContent = `GHS ${totalRetailValue.toFixed(2)}`;
  document.getElementById('inv-metric-margin').textContent = `Projected Profit: GHS ${expectedProfit.toFixed(2)}`;
  document.getElementById('inv-metric-alerts').textContent = String(alertCount);

  const navBadgeStock = document.getElementById('nav-badge-stock');
  if (alertCount > 0) {
    navBadgeStock.textContent = String(alertCount);
    navBadgeStock.classList.remove('hidden');
  } else {
    navBadgeStock.classList.add('hidden');
  }

  const searchQ = (document.getElementById('inv-search-input')?.value || '').trim().toLowerCase();
  const stockFilter = document.getElementById('inv-stock-filter')?.value || 'ALL';

  const filtered = products.filter((p) => {
    const matchesSearch =
      !searchQ ||
      p.name.toLowerCase().includes(searchQ) ||
      p.category.toLowerCase().includes(searchQ);
    if (!matchesSearch) return false;
    if (stockFilter === 'OUT') return p.stock_qty === 0;
    if (stockFilter === 'LOW') return p.stock_qty > 0 && p.stock_qty <= (p.low_stock_threshold ?? 5);
    return true;
  });

  const tbody = document.getElementById('inventory-table-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No inventory items match your filter.</td></tr>`;
    return;
  }

  const canEdit = AppState.isLicenseActive;

  tbody.innerHTML = filtered
    .map((p) => {
      const unitProfit = Number(p.selling_price) - Number(p.cost_price);
      const marginPct = p.cost_price > 0 ? ((unitProfit / p.cost_price) * 100).toFixed(0) : '100';

      let statusBadge = `<span class="badge badge-ok">In Stock</span>`;
      if (p.stock_qty === 0) {
        statusBadge = `<span class="badge badge-out">Out of Stock</span>`;
      } else if (p.stock_qty <= (p.low_stock_threshold ?? 5)) {
        statusBadge = `<span class="badge badge-low">Low Stock (≤${p.low_stock_threshold ?? 5})</span>`;
      }

      return `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${escapeHtml(p.category)}</td>
          <td>GHS ${Number(p.cost_price).toFixed(2)}</td>
          <td><strong>GHS ${Number(p.selling_price).toFixed(2)}</strong></td>
          <td style="color:var(--success); font-weight:700;">+GHS ${unitProfit.toFixed(2)} <small>(${marginPct}%)</small></td>
          <td><strong>${p.stock_qty}</strong></td>
          <td>${statusBadge}</td>
          <td>
            <div class="action-group">
              <button type="button" class="btn btn-success btn-sm" ${canEdit ? '' : 'disabled'} data-inv-restock="${escapeHtml(p.id)}">+ Restock</button>
              <button type="button" class="btn btn-outline btn-sm" ${canEdit ? '' : 'disabled'} data-inv-edit="${escapeHtml(p.id)}">Edit</button>
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger);" ${canEdit ? '' : 'disabled'} data-inv-delete="${escapeHtml(p.id)}">Del</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

// ============================================================================
// TAB 3: DEBTORS BOOK ("CREDIT BOOK") & 1-TAP REMINDERS
// ============================================================================

function formatGhanaWhatsAppPhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0') && digits.length === 10) {
    return '233' + digits.substring(1);
  }
  if (digits.length === 9) {
    return '233' + digits;
  }
  return digits;
}

function renderDebtorsTab() {
  const debtors = AppState.debtors;
  let totalUnpaid = 0;
  let unpaidCount = 0;
  let totalRecovered = 0;

  for (const d of debtors) {
    const owed = Number(d.total_owed || 0);
    totalUnpaid += owed;
    if (owed > 0) unpaidCount++;
    totalRecovered += Number(d.total_paid || 0);
  }

  document.getElementById('debtors-total-unpaid').textContent = `GHS ${totalUnpaid.toFixed(2)}`;
  document.getElementById('debtors-unpaid-count').textContent = String(unpaidCount);
  document.getElementById('debtors-total-recovered').textContent = `GHS ${totalRecovered.toFixed(2)}`;

  const navBadgeDebtors = document.getElementById('nav-badge-debtors');
  if (unpaidCount > 0) {
    navBadgeDebtors.textContent = String(unpaidCount);
    navBadgeDebtors.classList.remove('hidden');
  } else {
    navBadgeDebtors.classList.add('hidden');
  }

  const searchQ = (document.getElementById('debtors-search-input')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('debtors-status-filter')?.value || 'ALL';

  const filtered = debtors.filter((d) => {
    const matchesSearch =
      !searchQ ||
      (d.name && d.name.toLowerCase().includes(searchQ)) ||
      (d.phone && d.phone.toLowerCase().includes(searchQ)) ||
      (d.location && d.location.toLowerCase().includes(searchQ));
    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    return true;
  });

  const tbody = document.getElementById('debtors-table-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No debtor records found.</td></tr>`;
    return;
  }

  const shopName = AppState.settings.shop_name || 'Holy Star Provision Store';

  tbody.innerHTML = filtered
    .map((d) => {
      const owed = Number(d.total_owed || 0);
      const isCleared = owed <= 0 || d.status === 'Cleared';
      const statusBadge = isCleared
        ? `<span class="badge badge-ok">Cleared</span>`
        : `<span class="badge badge-out">Unpaid</span>`;

      const reminderMessage = `Hello ${d.name}, friendly reminder from ${shopName}. Your current credit balance is GHS ${owed.toFixed(2)}. Kindly pass by or send via MoMo. Thank you!`;
      const waPhone = formatGhanaWhatsAppPhone(d.phone);
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(reminderMessage)}`;
      const smsUrl = `sms:${String(d.phone || '').replace(/\s+/g, '')}?body=${encodeURIComponent(reminderMessage)}`;

      const dueTag =
        d.due_date && !isCleared
          ? `<div style="font-size:0.72rem; color:var(--warning); font-weight:700;">Due: ${escapeHtml(d.due_date)}</div>`
          : '';

      return `
        <tr>
          <td><strong>${escapeHtml(d.name)}</strong></td>
          <td><a href="tel:${escapeHtml(d.phone)}" style="color:var(--primary); font-weight:700; text-decoration:none;">${escapeHtml(d.phone)}</a></td>
          <td>${escapeHtml(d.location || '-')}</td>
          <td>
            <strong style="color:${isCleared ? 'var(--success)' : 'var(--danger)'}; font-size:0.98rem;">
              GHS ${owed.toFixed(2)}
            </strong>
            ${dueTag}
          </td>
          <td>${new Date(d.updated_at || d.created_at).toLocaleDateString()}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="action-group">
              <button type="button" class="btn btn-outline btn-sm" data-debtor-history="${escapeHtml(d.id)}">📜 History</button>
              <button type="button" class="btn btn-success btn-sm" ${isCleared ? 'disabled' : ''} data-debtor-pay="${escapeHtml(d.id)}">💵 Record Payment</button>
              <a href="${waUrl}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-sm" title="1-Tap WhatsApp Reminder">💬 WhatsApp</a>
              <a href="${smsUrl}" class="btn btn-sms btn-sm" title="1-Tap Offline Native SMS">📩 SMS</a>
              <button type="button" class="btn btn-outline btn-sm" data-cloud-sms="${escapeHtml(d.id)}" title="Send Cloud SMS (Arkesel/Hubtel API)">☁️ Cloud SMS</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function openDebtorHistoryModal(debtorId) {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  document.getElementById('history-debtor-title').textContent = `📜 Credit History — ${debtor.name}`;
  document.getElementById('history-debtor-summary').innerHTML = `
    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
      <div>
        <div><strong>Phone:</strong> ${escapeHtml(debtor.phone)}</div>
        <div><strong>Location:</strong> ${escapeHtml(debtor.location)}</div>
      </div>
      <div style="text-align:right;">
        <div>Total Credit Taken: <strong>GHS ${Number(debtor.total_credit_taken || 0).toFixed(2)}</strong></div>
        <div>Total Paid: <strong style="color:var(--success);">GHS ${Number(debtor.total_paid || 0).toFixed(2)}</strong></div>
        <div style="font-size:1rem;">Current Balance Owed: <strong style="color:var(--danger);">GHS ${Number(debtor.total_owed || 0).toFixed(2)}</strong></div>
      </div>
    </div>
  `;

  const timeline = document.getElementById('history-timeline-list');
  const history = Array.isArray(debtor.history) ? debtor.history : [];

  if (history.length === 0) {
    timeline.innerHTML = `<div class="empty-state">No transaction history logged.</div>`;
  } else {
    timeline.innerHTML = history
      .map((entry) => {
        if (entry.type === 'PAYMENT') {
          return `
            <div style="border-left:4px solid var(--success); background:#f0fdf4; padding:0.75rem; border-radius:6px;">
              <div style="display:flex; justify-content:space-between; font-weight:800; color:#166534;">
                <span>💵 DEBT REPAYMENT (${escapeHtml(entry.payment_method)})</span>
                <span>− GHS ${Number(entry.amount_paid).toFixed(2)}</span>
              </div>
              <div style="font-size:0.78rem; color:#475569; margin-top:0.2rem;">
                ${new Date(entry.timestamp).toLocaleString()} • Balance After: <strong>GHS ${Number(entry.balance_after).toFixed(2)}</strong>
              </div>
              ${entry.note ? `<div style="font-size:0.82rem; margin-top:0.25rem;">Note: ${escapeHtml(entry.note)}</div>` : ''}
            </div>
          `;
        }

        const itemsHtml = Array.isArray(entry.items)
          ? entry.items
              .map(
                (i) =>
                  `<li>${i.qty}x ${escapeHtml(i.name)} @ GHS ${Number(i.selling_price).toFixed(2)} = <strong>GHS ${Number(i.subtotal).toFixed(2)}</strong></li>`
              )
              .join('')
          : '';

        return `
          <div style="border-left:4px solid var(--danger); background:#fef2f2; padding:0.75rem; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; font-weight:800; color:#991b1b;">
              <span>🛒 CREDIT TAKEN ${entry.receipt_id ? `(${escapeHtml(entry.receipt_id)})` : ''}</span>
              <span>+ GHS ${Number(entry.amount_added_to_debt).toFixed(2)} Owed</span>
            </div>
            <div style="font-size:0.78rem; color:#475569; margin-top:0.2rem;">
              ${new Date(entry.timestamp).toLocaleString()} • Total Items: GHS ${Number(entry.total_credit_sale).toFixed(2)} (Initial Deposit: GHS ${Number(entry.initial_deposit || 0).toFixed(2)})
            </div>
            <ul style="margin:0.45rem 0 0 1.2rem; font-size:0.83rem;">${itemsHtml}</ul>
          </div>
        `;
      })
      .join('');
  }

  openModal('modal-debtor-history');
}

function openDebtorPaymentModal(debtorId) {
  const debtor = AppState.debtors.find((d) => d.id === debtorId);
  if (!debtor) return;

  document.getElementById('pay-debtor-id').value = debtor.id;
  document.getElementById('pay-debtor-name').textContent = debtor.name;
  document.getElementById('pay-debtor-phone').textContent = `${debtor.phone} • ${debtor.location}`;
  document.getElementById('pay-debtor-current-owed').textContent = `GHS ${Number(debtor.total_owed).toFixed(2)}`;

  const amountInput = document.getElementById('pay-amount-input');
  amountInput.value = Number(debtor.total_owed).toFixed(2);
  amountInput.max = Number(debtor.total_owed).toFixed(2);
  document.getElementById('pay-note-input').value = '';

  openModal('modal-debtor-payment');
}

// ============================================================================
// TAB 4: SALES HISTORY, RECEIPT PRINTING & OWNER "CLOSE DAY" REPORT
// ============================================================================

async function renderSalesTab() {
  const datePicker = document.getElementById('sales-date-picker');
  const dateStr = datePicker?.value || window.HolyStarDB.formatLocalDate();

  const report = await window.HolyStarDB.getDailyReport(dateStr);
  const m = report.metrics;

  document.getElementById('metric-revenue').textContent = `GHS ${m.totalRevenue.toFixed(2)}`;
  document.getElementById('metric-sales-count').textContent = `${m.salesCount} sale${m.salesCount === 1 ? '' : 's'} completed`;
  document.getElementById('metric-profit').textContent = `GHS ${m.grossProfit.toFixed(2)}`;
  document.getElementById('metric-cash').textContent = `GHS ${m.cashCollected.toFixed(2)}`;
  document.getElementById('metric-cash-sub').textContent = `Sales: GHS ${m.cashFromSales.toFixed(2)} + Debt Paid: GHS ${m.cashFromDebtors.toFixed(2)}`;
  document.getElementById('metric-momo').textContent = `GHS ${m.momoRecorded.toFixed(2)}`;
  document.getElementById('metric-momo-sub').textContent = `Sales: GHS ${m.momoFromSales.toFixed(2)} + Debt Paid: GHS ${m.momoFromDebtors.toFixed(2)}`;
  document.getElementById('metric-credit').textContent = `GHS ${m.newCreditGiven.toFixed(2)}`;

  // Sales table
  const salesBody = document.getElementById('sales-table-body');
  if (report.sales.length === 0) {
    salesBody.innerHTML = `<tr><td colspan="7" class="empty-state">No sales recorded on ${escapeHtml(dateStr)}.</td></tr>`;
  } else {
    salesBody.innerHTML = report.sales
      .map((s) => {
        let badgeClass = 'badge-cash';
        if (s.payment_method === 'MoMo') badgeClass = 'badge-momo';
        if (s.payment_method === 'Credit') badgeClass = 'badge-credit';

        const itemSummary = Array.isArray(s.items)
          ? s.items.map((i) => `${i.qty}x ${i.name}`).join(', ')
          : '';

        return `
          <tr>
            <td><strong>${escapeHtml(s.id)}</strong></td>
            <td>${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td>
              <strong>${s.item_count} item${s.item_count === 1 ? '' : 's'}</strong>
              <div style="font-size:0.76rem; color:var(--text-secondary); max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(itemSummary)}
              </div>
            </td>
            <td>
              <span class="badge ${badgeClass}">${escapeHtml(s.payment_method)}</span>
              ${
                s.payment_method === 'Credit'
                  ? `<div style="font-size:0.72rem; color:var(--danger);">Owed: GHS ${Number(s.balance_owed).toFixed(2)}</div>`
                  : ''
              }
            </td>
            <td><strong>GHS ${Number(s.total_amount).toFixed(2)}</strong></td>
            <td style="color:var(--success); font-weight:700;">GHS ${Number(s.total_profit).toFixed(2)}</td>
            <td>
              <button type="button" class="btn btn-outline btn-sm" data-view-receipt="${escapeHtml(s.id)}">
                🖨️ View / Print
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Debt Repayments table
  const repBody = document.getElementById('repayments-table-body');
  if (report.repayments.length === 0) {
    repBody.innerHTML = `<tr><td colspan="6" class="empty-state">No debtor repayments recorded on ${escapeHtml(dateStr)}.</td></tr>`;
  } else {
    repBody.innerHTML = report.repayments
      .map(
        (r) => `
        <tr>
          <td>${new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><strong>${escapeHtml(r.debtor_name)}</strong> (${escapeHtml(r.debtor_phone)})</td>
          <td><span class="badge ${r.payment_method === 'MoMo' ? 'badge-momo' : 'badge-cash'}">${escapeHtml(r.payment_method)}</span></td>
          <td style="color:var(--success); font-weight:800;">+ GHS ${Number(r.amount_paid).toFixed(2)}</td>
          <td>GHS ${Number(r.balance_after).toFixed(2)}</td>
          <td>${escapeHtml(r.note || '-')}</td>
        </tr>
      `
      )
      .join('');
  }
}

function openReceiptModal(saleId) {
  const sale = AppState.sales.find((s) => s.id === saleId);
  if (!sale) return;

  const s = AppState.settings;
  const shopName = s.shop_name || 'Holy Star Provision Store';
  const shopLoc = s.shop_location || 'Bolgatanga Central Market';
  const shopPhone = s.owner_phone || '';

  const itemsRows = (sale.items || [])
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.name)}<br><small>${i.qty} x ${Number(i.selling_price).toFixed(2)}</small></td>
        <td class="r-right" style="vertical-align:bottom;">${Number(i.subtotal).toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  let paymentBreakdownHtml = `
    <div class="receipt-total-line">
      <span>Payment Method:</span>
      <span>${escapeHtml(sale.payment_method)}</span>
    </div>
  `;

  if (sale.payment_method === 'Credit' && sale.customer) {
    paymentBreakdownHtml += `
      <div class="receipt-total-line">
        <span>Initial Deposit (${escapeHtml(sale.deposit_method)}):</span>
        <span>GHS ${Number(sale.initial_deposit).toFixed(2)}</span>
      </div>
      <div class="receipt-total-line">
        <span>BALANCE OWED (IN BOOK):</span>
        <span>GHS ${Number(sale.balance_owed).toFixed(2)}</span>
      </div>
      <div class="receipt-divider"></div>
      <div><strong>Customer:</strong> ${escapeHtml(sale.customer.name)}</div>
      <div><strong>Phone:</strong> ${escapeHtml(sale.customer.phone)}</div>
      <div><strong>Landmark:</strong> ${escapeHtml(sale.customer.location)}</div>
      ${sale.customer.due_date ? `<div><strong>Due Date:</strong> ${escapeHtml(sale.customer.due_date)}</div>` : ''}
    `;
  }

  document.getElementById('printable-receipt').innerHTML = `
    <div class="receipt-center">
      <div class="receipt-shop-title">${escapeHtml(shopName)}</div>
      <div>${escapeHtml(shopLoc)}</div>
      ${shopPhone ? `<div>Tel: ${escapeHtml(shopPhone)}</div>` : ''}
      <div>Shop ID: ${escapeHtml(s.shop_id || 'HS-001')}</div>
    </div>
    <div class="receipt-divider"></div>
    <div><strong>Receipt:</strong> ${escapeHtml(sale.id)}</div>
    <div><strong>Date:</strong> ${new Date(sale.timestamp).toLocaleString()}</div>
    <div class="receipt-divider"></div>
    <table class="receipt-items-table">
      <thead>
        <tr>
          <th>Item / Qty</th>
          <th class="r-right">GHS</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
    <div class="receipt-divider"></div>
    <div class="receipt-total-line grand">
      <span>TOTAL:</span>
      <span>GHS ${Number(sale.total_amount).toFixed(2)}</span>
    </div>
    ${paymentBreakdownHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-center" style="font-size:0.76rem; margin-top:0.4rem;">
      Thank you for shopping with us!<br>
      Powered by Holy Star POS
    </div>
  `;

  openModal('modal-receipt');
}

async function openCloseDayModal() {
  const datePicker = document.getElementById('sales-date-picker');
  const dateStr = datePicker?.value || window.HolyStarDB.formatLocalDate();
  const report = await window.HolyStarDB.getDailyReport(dateStr);
  const m = report.metrics;
  const s = AppState.settings;
  const shopId = s.shop_id || 'HS-001';
  const shopName = s.shop_name || 'Holy Star Provision Store';
  const ownerPhone = s.owner_phone || '0240000000';

  const seal = generateCloseDaySeal(dateStr, m.totalRevenue, m.grossProfit, shopId);

  const summaryText = [
    `📊 *HOLY STAR POS — CLOSE DAY REPORT*`,
    `🏪 Shop: ${shopName} (${shopId})`,
    `📅 Date: ${dateStr}`,
    `------------------------------`,
    `💰 Total Revenue: GHS ${m.totalRevenue.toFixed(2)} (${m.salesCount} sales)`,
    `📈 Actual Gross Profit: GHS ${m.grossProfit.toFixed(2)}`,
    `💵 Cash Collected: GHS ${m.cashCollected.toFixed(2)}`,
    `📱 MoMo Recorded: GHS ${m.momoRecorded.toFixed(2)}`,
    `📒 New Credit Given: GHS ${m.newCreditGiven.toFixed(2)}`,
    `------------------------------`,
    `🔐 Anti-Tamper Seal: #${seal}`
  ].join('\n');

  document.getElementById('close-day-owner-phone-display').textContent = ownerPhone;
  document.getElementById('close-day-report-text').textContent = summaryText;

  const waOwnerPhone = formatGhanaWhatsAppPhone(ownerPhone);
  document.getElementById('btn-close-day-whatsapp').href = `https://wa.me/${waOwnerPhone}?text=${encodeURIComponent(summaryText)}`;
  document.getElementById('btn-close-day-sms').href = `sms:${ownerPhone.replace(/\s+/g, '')}?body=${encodeURIComponent(summaryText)}`;

  openModal('modal-close-day');
}

// ============================================================================
// EVENT LISTENERS & UI INTERACTIONS
// ============================================================================

function setupEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      switchTab(tabBtn.dataset.tab);
    });
  });

  // 1-Tap PWA Install Button
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      installBtn.classList.add('hidden');
    });
  }

  // License status pill & banner unlock button jump to Settings tab
  document.getElementById('license-status-pill').addEventListener('click', () => {
    switchTab('tab-settings');
    document.getElementById('token-issue-code')?.focus();
  });
  document.getElementById('btn-banner-unlock').addEventListener('click', () => {
    switchTab('tab-settings');
    document.getElementById('token-issue-code')?.focus();
  });

  // Re-check device clock button
  document.getElementById('btn-recheck-clock').addEventListener('click', async () => {
    const res = await window.HolyStarDB.TouchClock();
    if (res.valid) {
      showToast('Device clock verified! Checkout unlocked.', 'success');
    } else {
      showToast(res.message, 'error');
    }
    await refreshAllData();
  });

  // POS Search & Category Chips
  document.getElementById('pos-search-input').addEventListener('input', (e) => {
    AppState.posSearchQuery = e.target.value;
    renderPOSCatalog();
  });

  document.getElementById('pos-category-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    AppState.selectedCategory = chip.dataset.cat;
    renderPOSCatalog();
  });

  // Clicking Product Tile adds to Cart
  document.getElementById('pos-product-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('.product-tile');
    if (!tile) return;
    addToCart(tile.dataset.prodId);
  });

  // Cart Quantity & Remove Controls
  document.getElementById('cart-items-container').addEventListener('click', (e) => {
    const qtyBtn = e.target.closest('.qty-btn');
    if (qtyBtn) {
      const id = qtyBtn.dataset.id;
      const action = qtyBtn.dataset.qtyAction;
      const item = AppState.cart.find((c) => c.id === id);
      if (!item) return;
      if (action === 'inc') {
        updateCartItemQty(id, item.qty + 1);
      } else if (action === 'dec') {
        if (item.qty === 1) {
          removeFromCart(id);
        } else {
          updateCartItemQty(id, item.qty - 1);
        }
      }
      return;
    }

    const removeBtn = e.target.closest('[data-remove-id]');
    if (removeBtn) {
      removeFromCart(removeBtn.dataset.removeId);
    }
  });

  document.getElementById('cart-items-container').addEventListener('change', (e) => {
    const input = e.target.closest('[data-qty-input]');
    if (!input) return;
    updateCartItemQty(input.dataset.qtyInput, input.value);
  });

  document.getElementById('btn-clear-cart').addEventListener('click', () => {
    AppState.cart = [];
    renderCart();
  });

  // Payment Method Selector
  document.querySelectorAll('.pay-method-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.selectedPaymentMethod = btn.dataset.method;

      const creditPanel = document.getElementById('credit-customer-fields');
      const cashCalc = document.getElementById('cash-calculator-box');

      if (AppState.selectedPaymentMethod === 'Credit') {
        creditPanel.classList.remove('hidden');
        cashCalc.classList.add('hidden');
      } else if (AppState.selectedPaymentMethod === 'Cash') {
        creditPanel.classList.add('hidden');
        cashCalc.classList.remove('hidden');
      } else {
        creditPanel.classList.add('hidden');
        cashCalc.classList.add('hidden');
      }
      renderCart();
    });
  });

  // Cash tendered & Credit initial deposit live calculators
  document.getElementById('cash-tendered-input').addEventListener('input', () => {
    const total = AppState.cart.reduce((s, i) => s + i.selling_price * i.qty, 0);
    updateCashChangeAndCreditPreview(total);
  });

  document.getElementById('credit-initial-deposit').addEventListener('input', () => {
    const total = AppState.cart.reduce((s, i) => s + i.selling_price * i.qty, 0);
    updateCashChangeAndCreditPreview(total);
  });

  // Existing Debtor quick-fill in Credit Checkout
  document.getElementById('credit-existing-select').addEventListener('change', (e) => {
    const debtor = AppState.debtors.find((d) => d.id === e.target.value);
    if (debtor) {
      document.getElementById('credit-customer-name').value = debtor.name || '';
      document.getElementById('credit-customer-phone').value = debtor.phone || '';
      document.getElementById('credit-customer-location').value = debtor.location || '';
    }
  });

  // Complete Sale Button
  document.getElementById('btn-complete-sale').addEventListener('click', handleCheckoutSubmit);

  // Inventory Search & Filter
  document.getElementById('inv-search-input').addEventListener('input', renderInventoryTab);
  document.getElementById('inv-stock-filter').addEventListener('change', renderInventoryTab);

  // Open Add Product Modal
  document.getElementById('btn-open-product-modal').addEventListener('click', () => {
    if (!AppState.isLicenseActive) {
      showToast('License expired. Enter an unlock token to add products.', 'error');
      return;
    }
    document.getElementById('modal-product-title').textContent = '➕ Add New Product';
    document.getElementById('prod-id').value = '';
    document.getElementById('form-product').reset();
    document.getElementById('prod-stock').value = '10';
    document.getElementById('prod-threshold').value = '5';
    updateProductModalProfitPreview();
    openModal('modal-product');
  });

  // Product Modal Profit Preview
  ['prod-cost', 'prod-price'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateProductModalProfitPreview);
  });

  // Save Product Form
  document.getElementById('form-product').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.HolyStarDB.saveProduct({
        id: document.getElementById('prod-id').value || undefined,
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        cost_price: document.getElementById('prod-cost').value,
        selling_price: document.getElementById('prod-price').value,
        stock_qty: document.getElementById('prod-stock').value,
        low_stock_threshold: document.getElementById('prod-threshold').value
      });
      closeModal('modal-product');
      await refreshAllData();
      showToast('Product saved to inventory!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Inventory Table Actions (Restock, Edit, Delete)
  document.getElementById('inventory-table-body').addEventListener('click', async (e) => {
    const restockBtn = e.target.closest('[data-inv-restock]');
    if (restockBtn) {
      const p = AppState.products.find((x) => x.id === restockBtn.dataset.invRestock);
      if (!p) return;
      document.getElementById('restock-prod-id').value = p.id;
      document.getElementById('restock-prod-name').textContent = p.name;
      document.getElementById('restock-current-qty').textContent = String(p.stock_qty);
      document.getElementById('restock-add-qty').value = '10';
      openModal('modal-restock');
      return;
    }

    const editBtn = e.target.closest('[data-inv-edit]');
    if (editBtn) {
      const p = AppState.products.find((x) => x.id === editBtn.dataset.invEdit);
      if (!p) return;
      document.getElementById('modal-product-title').textContent = '✏️ Edit Product';
      document.getElementById('prod-id').value = p.id;
      document.getElementById('prod-name').value = p.name;
      document.getElementById('prod-category').value = p.category;
      document.getElementById('prod-cost').value = p.cost_price;
      document.getElementById('prod-price').value = p.selling_price;
      document.getElementById('prod-stock').value = p.stock_qty;
      document.getElementById('prod-threshold').value = p.low_stock_threshold ?? 5;
      updateProductModalProfitPreview();
      openModal('modal-product');
      return;
    }

    const delBtn = e.target.closest('[data-inv-delete]');
    if (delBtn) {
      const p = AppState.products.find((x) => x.id === delBtn.dataset.invDelete);
      if (!p) return;
      if (confirm(`Delete "${p.name}" from inventory?`)) {
        await window.HolyStarDB.deleteProduct(p.id);
        await refreshAllData();
        showToast(`Deleted "${p.name}".`, 'warning');
      }
    }
  });

  // Submit Restock Form
  document.getElementById('form-restock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('restock-prod-id').value;
    const addQty = Math.floor(Number(document.getElementById('restock-add-qty').value || 0));
    const p = AppState.products.find((x) => x.id === id);
    if (!p || addQty <= 0) {
      showToast('Enter a valid quantity to add.', 'error');
      return;
    }
    try {
      await window.HolyStarDB.saveProduct({
        ...p,
        stock_qty: Number(p.stock_qty) + addQty
      });
      closeModal('modal-restock');
      await refreshAllData();
      showToast(`Added +${addQty} units to "${p.name}". New Stock: ${Number(p.stock_qty) + addQty}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Debtors Search & Status Filter
  document.getElementById('debtors-search-input').addEventListener('input', renderDebtorsTab);
  document.getElementById('debtors-status-filter').addEventListener('change', renderDebtorsTab);

  // Open Manual Debtor Modal
  document.getElementById('btn-open-manual-debtor-modal').addEventListener('click', () => {
    if (!AppState.isLicenseActive) {
      showToast('License expired. Enter an unlock token to add new debtors.', 'error');
      return;
    }
    document.getElementById('form-manual-debtor').reset();
    openModal('modal-manual-debtor');
  });

  // Submit Manual Debtor
  document.getElementById('form-manual-debtor').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.HolyStarDB.addManualDebtor({
        name: document.getElementById('mdebtor-name').value,
        phone: document.getElementById('mdebtor-phone').value,
        location: document.getElementById('mdebtor-location').value,
        amountOwed: document.getElementById('mdebtor-amount').value,
        itemDescription: document.getElementById('mdebtor-desc').value,
        dueDate: document.getElementById('mdebtor-due').value
      });
      closeModal('modal-manual-debtor');
      await refreshAllData();
      showToast('Debtor added to Credit Book!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Debtors Table Actions (History, Record Payment, Cloud SMS Placeholder)
  document.getElementById('debtors-table-body').addEventListener('click', (e) => {
    const histBtn = e.target.closest('[data-debtor-history]');
    if (histBtn) {
      openDebtorHistoryModal(histBtn.dataset.debtorHistory);
      return;
    }

    const payBtn = e.target.closest('[data-debtor-pay]');
    if (payBtn) {
      openDebtorPaymentModal(payBtn.dataset.debtorPay);
      return;
    }

    const cloudSmsBtn = e.target.closest('[data-cloud-sms]');
    if (cloudSmsBtn) {
      const d = AppState.debtors.find((x) => x.id === cloudSmsBtn.dataset.cloudSms);
      showToast(
        `Cloud SMS (Arkesel / Hubtel API) ready for online integration for ${d ? d.name : 'customer'}. Use the "📩 SMS" or "💬 WhatsApp" buttons for immediate offline/mobile dispatch!`,
        'warning'
      );
    }
  });

  // Pay Full Balance Quick Button
  document.getElementById('btn-pay-full-balance').addEventListener('click', () => {
    const id = document.getElementById('pay-debtor-id').value;
    const d = AppState.debtors.find((x) => x.id === id);
    if (d) {
      document.getElementById('pay-amount-input').value = Number(d.total_owed).toFixed(2);
    }
  });

  // Submit Debtor Payment
  document.getElementById('form-debtor-payment').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await window.HolyStarDB.recordDebtorPayment({
        debtorId: document.getElementById('pay-debtor-id').value,
        amount: document.getElementById('pay-amount-input').value,
        paymentMethod: document.getElementById('pay-method-select').value,
        note: document.getElementById('pay-note-input').value
      });
      closeModal('modal-debtor-payment');
      await refreshAllData();
      showToast(
        `Payment of GHS ${res.paymentEntry.amount_paid.toFixed(2)} recorded! Remaining Balance: GHS ${res.debtor.total_owed.toFixed(2)}`,
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Sales Date Picker & Close Day Report
  document.getElementById('sales-date-picker').addEventListener('change', () => {
    renderSalesTab();
  });

  document.getElementById('btn-sales-today').addEventListener('click', () => {
    document.getElementById('sales-date-picker').value = window.HolyStarDB.formatLocalDate();
    renderSalesTab();
  });

  document.getElementById('sales-table-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view-receipt]');
    if (btn) {
      openReceiptModal(btn.dataset.viewReceipt);
    }
  });

  document.getElementById('btn-print-receipt').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-open-close-day-modal').addEventListener('click', openCloseDayModal);

  document.getElementById('btn-close-day-copy').addEventListener('click', async () => {
    const text = document.getElementById('close-day-report-text').textContent;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Close Day report copied to clipboard!', 'success');
    } catch {
      showToast('Copied summary text!', 'success');
    }
  });

  // Token Unlock Form Submission
  document.getElementById('form-activate-token').addEventListener('submit', handleActivateToken);

  // Simulate Expired License (Testing helper)
  document.getElementById('btn-simulate-expiry').addEventListener('click', async () => {
    await window.HolyStarDB.setSetting('license_expiry', Date.now() - 60000);
    await window.HolyStarDB.setSetting('license_plan', 'Expired (Test Simulation)');
    await refreshAllData();
    showToast('License set to Expired! Notice Read-Only mode is active and Checkout is locked.', 'warning');
  });

  // Shop Settings Form
  document.getElementById('form-shop-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const shopId = document.getElementById('setting-shop-id').value.trim().toUpperCase();
    const shopName = document.getElementById('setting-shop-name').value.trim();
    const ownerPhone = document.getElementById('setting-owner-phone').value.trim();
    const shopLocation = document.getElementById('setting-shop-location').value.trim();

    if (!shopId || !shopName || !ownerPhone) {
      showToast('Shop ID, Shop Name, and Owner Phone are required.', 'error');
      return;
    }

    await window.HolyStarDB.saveSettings({
      shop_id: shopId,
      shop_name: shopName,
      owner_phone: ownerPhone,
      shop_location: shopLocation
    });

    await refreshAllData();
    showToast('Shop profile settings saved!', 'success');
  });

  // Load Demo Data Buttons
  document.getElementById('btn-load-demo-data').addEventListener('click', handleLoadDemoData);
  document.getElementById('btn-pos-quick-demo').addEventListener('click', handleLoadDemoData);

  // Backup & Restore
  document.getElementById('btn-export-backup').addEventListener('click', handleExportBackup);
  document.getElementById('btn-restore-backup').addEventListener('click', handleRestoreBackup);

  // Close Modals
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });
}

// ============================================================================
// TOKEN VERIFICATION, DEMO DATA & BACKUP HANDLERS
// ============================================================================

async function handleActivateToken(e) {
  e.preventDefault();
  const shopId = String(AppState.settings.shop_id || 'HS-001').trim().toUpperCase();
  let issueCode = document.getElementById('token-issue-code').value.trim().toUpperCase();
  const planSelection = document.getElementById('token-plan-days').value;
  let enteredToken = document.getElementById('token-code-input').value.trim().toUpperCase();

  // Support combined format if user pasted "ISSUE:TOKEN" or "ISSUE-TOKEN"
  if (enteredToken.includes(':') || (enteredToken.includes('-') && enteredToken.length > 8)) {
    const parts = enteredToken.split(/[:\-]/);
    if (parts.length === 2 && parts[1].length === 8) {
      issueCode = parts[0].trim().toUpperCase();
      enteredToken = parts[1].trim().toUpperCase();
      document.getElementById('token-issue-code').value = issueCode;
      document.getElementById('token-code-input').value = enteredToken;
    }
  }

  if (!issueCode || enteredToken.length !== 8) {
    showToast('Please enter a valid Issue Code and an 8-character Unlock Token.', 'error');
    return;
  }

  const candidatePlans = planSelection === 'AUTO' ? [7, 30] : [Number(planSelection), 7, 30];
  let matchedPlan = null;

  for (const days of candidatePlans) {
    const expected = generateLicenseToken(shopId, days, issueCode);
    if (expected === enteredToken) {
      matchedPlan = days;
      break;
    }
  }

  if (!matchedPlan) {
    showToast(
      `Invalid Unlock Token for Shop ID "${shopId}" and Issue Code "${issueCode}". Verify details in Admin Keygen.`,
      'error'
    );
    return;
  }

  const tokenKey = `${shopId}|${matchedPlan}|${issueCode}|${enteredToken}`;

  try {
    await window.HolyStarDB.applyLicenseToken({
      tokenKey,
      tokenCode: enteredToken,
      issueCode,
      planDays: matchedPlan,
      shopId
    });

    document.getElementById('token-issue-code').value = '';
    document.getElementById('token-code-input').value = '';
    await refreshAllData();
    showToast(`🎉 Success! Unlocked +${matchedPlan} Days subscription for ${shopId}.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLoadDemoData() {
  try {
    await window.HolyStarDB.loadDemoShopData();
    await refreshAllData();
    showToast('🇬🇭 Loaded realistic Ghanaian provision shop items, sample sales & debtor!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to load demo data.', 'error');
  }
}

async function handleExportBackup() {
  try {
    const backup = await window.HolyStarDB.exportFullBackup();
    const dateStr = window.HolyStarDB.formatLocalDate();
    const shopId = (AppState.settings.shop_id || 'HS-001').toLowerCase();
    const filename = `holystar-pos-backup-${shopId}-${dateStr}.json`;

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Exported full backup: ${filename}`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to export backup.', 'error');
  }
}

async function handleRestoreBackup() {
  const fileInput = document.getElementById('restore-file-input');
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please choose a .json backup file first.', 'warning');
    return;
  }

  const file = fileInput.files[0];
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await window.HolyStarDB.restoreFullBackup(parsed);
    fileInput.value = '';
    await refreshAllData();
    showToast('Backup validated and restored successfully!', 'success');
  } catch (err) {
    showToast(err.message || 'Invalid JSON backup file.', 'error');
  }
}

// ============================================================================
// UI HELPERS (TABS, MODALS, TOASTS, ESCAPING)
// ============================================================================

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

function updateProductModalProfitPreview() {
  const cost = Number(document.getElementById('prod-cost').value || 0);
  const price = Number(document.getElementById('prod-price').value || 0);
  const profit = price - cost;
  const pct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : '100.0';
  const el = document.getElementById('prod-profit-preview');
  if (profit >= 0) {
    el.style.background = '#f0fdf4';
    el.style.color = '#166534';
    el.style.borderColor = '#86efac';
    el.textContent = `Unit Profit: GHS ${profit.toFixed(2)} (+${pct}% markup)`;
  } else {
    el.style.background = '#fef2f2';
    el.style.color = '#991b1b';
    el.style.borderColor = '#fca5a5';
    el.textContent = `⚠️ Warning: Selling below cost! Loss of GHS ${Math.abs(profit).toFixed(2)} per unit`;
  }
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 4000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

