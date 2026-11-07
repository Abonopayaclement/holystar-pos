/**
 * Holy Star POS - Multi-Store SaaS IndexedDB Wrapper (db.js)
 * Supports Store Registration/Login, Boss vs. Cashier roles, Staff/Device accounts,
 * Barcode & Image-enabled Inventory, Atomic Checkout, Debtors Book, Prepaid Tokens,
 * and Super-Admin Sync Telemetry Summary.
 */

const DB_NAME = 'HolyStarPOS_DB';
const DB_VERSION = 2;
const CLOCK_DRIFT_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance
const SESSION_STORAGE_KEY = 'holystar_active_session_v2';

class HolyStarDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize IndexedDB (v2 schema with multi-store support)
   */
  async init() {
    if (this.db) return this.db;

    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 2. Stores Registry (Multi-Store SaaS support)
        if (!db.objectStoreNames.contains('stores')) {
          const storeObj = db.createObjectStore('stores', { keyPath: 'store_id' });
          storeObj.createIndex('owner_phone', 'owner_phone', { unique: false });
        }

        // 3. Staff & Devices Store
        if (!db.objectStoreNames.contains('staff_devices')) {
          const staffStore = db.createObjectStore('staff_devices', { keyPath: 'id' });
          staffStore.createIndex('store_id', 'store_id', { unique: false });
        }

        // 4. Products Store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('category', 'category', { unique: false });
          productStore.createIndex('store_id', 'store_id', { unique: false });
          productStore.createIndex('barcode', 'barcode', { unique: false });
        }

        // 5. Sales Store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('date_str', 'date_str', { unique: false });
          salesStore.createIndex('timestamp', 'timestamp', { unique: false });
          salesStore.createIndex('payment_method', 'payment_method', { unique: false });
          salesStore.createIndex('store_id', 'store_id', { unique: false });
        }

        // 6. Debtors Store
        if (!db.objectStoreNames.contains('debtors')) {
          const debtorStore = db.createObjectStore('debtors', { keyPath: 'id' });
          debtorStore.createIndex('phone', 'phone', { unique: false });
          debtorStore.createIndex('status', 'status', { unique: false });
          debtorStore.createIndex('store_id', 'store_id', { unique: false });
        }

        // 7. License Store
        if (!db.objectStoreNames.contains('license')) {
          const licenseStore = db.createObjectStore('license', { keyPath: 'token_id' });
          licenseStore.createIndex('applied_at', 'applied_at', { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(new Error('Failed to open IndexedDB: ' + event.target.error));
    });

    return this.db;
  }

  async initFromExisting() {
    if (!this.db) {
      await this.init();
    }
  }

  // =========================================================================
  // SESSION, AUTHENTICATION & MULTI-STORE ONBOARDING
  // =========================================================================

  /**
   * Returns current active session:
   * { store_id, role_mode: 'boss' | 'cashier', staff_name, logged_in_at } or null
   */
  getActiveSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.store_id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  setActiveSession(sessionObj) {
    if (!sessionObj) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionObj));
  }

  logoutSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  getActiveStoreId() {
    const sess = this.getActiveSession();
    return sess ? sess.store_id : null;
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/\s+/g, '').replace(/^\+233/, '0');
  }

  /**
   * Generate unique `HS-XXXX` store_id
   */
  generateStoreId(existingIds = []) {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = 'HS-';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!existingIds.includes(code)) return code;
    }
    return 'HS-' + Date.now().toString(36).slice(-4).toUpperCase();
  }

  async getAllStores() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores'], 'readonly');
      const req = tx.objectStore('stores').getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getStoreById(storeId) {
    await this.initFromExisting();
    if (!storeId) return null;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores'], 'readonly');
      const req = tx.objectStore('stores').get(storeId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getActiveStore() {
    const storeId = this.getActiveStoreId();
    if (!storeId) return null;
    return this.getStoreById(storeId);
  }

  /**
   * Create a new Store account with 0 products, 0 sales, 0 debtors, and a 7-day trial
   */
  async registerNewStore({
    store_name,
    store_category,
    owner_name,
    owner_phone,
    owner_password,
    boss_pin,
    store_location
  }) {
    await this.initFromExisting();

    const cleanName = String(store_name || '').trim();
    const cleanCat = String(store_category || 'Provision & Mini-Mart').trim();
    const cleanOwner = String(owner_name || '').trim();
    const cleanPhone = this.normalizePhone(owner_phone);
    const cleanPass = String(owner_password || '').trim();
    const cleanPin = String(boss_pin || '').trim();
    const cleanLoc = String(store_location || 'Ghana').trim();

    if (!cleanName) throw new Error('Store Name is required.');
    if (!cleanOwner) throw new Error('Owner Full Name is required.');
    if (!cleanPhone || cleanPhone.length < 9) throw new Error('Valid Owner Phone Number is required.');
    if (!cleanPass || cleanPass.length < 4) throw new Error('Password must be at least 4 characters.');
    if (!/^\d{4}$/.test(cleanPin)) throw new Error('Boss PIN must be an exact 4-digit number (e.g. 1234).');

    const existingStores = await this.getAllStores();
    const duplicatePhone = existingStores.find((s) => this.normalizePhone(s.owner_phone) === cleanPhone);
    if (duplicatePhone) {
      throw new Error(`A store ("${duplicatePhone.store_name}") is already registered with phone ${cleanPhone}. Please log in instead.`);
    }

    const storeId = this.generateStoreId(existingStores.map((s) => s.store_id));
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const newStore = {
      store_id: storeId,
      shop_id: storeId, // alias for backward compatibility
      store_name: cleanName,
      shop_name: cleanName,
      store_category: cleanCat,
      owner_name: cleanOwner,
      owner_phone: cleanPhone,
      owner_password: cleanPass,
      boss_pin: cleanPin,
      shop_location: cleanLoc,
      license_expiry: now + sevenDaysMs,
      license_plan: '7-Day Initial Trial',
      last_seen_timestamp: now,
      last_active_at: now,
      clock_tampered: false,
      created_at: now
    };

    const defaultStaff = {
      id: 'STF-' + now,
      store_id: storeId,
      name: 'Shop Cashier',
      phone: cleanPhone,
      role: 'cashier',
      pin_or_pass: cleanPass,
      device_label: 'Main Counter Device',
      created_at: now
    };

    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores', 'staff_devices'], 'readwrite');
      tx.objectStore('stores').put(newStore);
      tx.objectStore('staff_devices').put(defaultStaff);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to create store.'));
    });

    const session = {
      store_id: storeId,
      role_mode: 'boss',
      staff_name: cleanOwner,
      logged_in_at: now
    };
    this.setActiveSession(session);
    return { store: newStore, session };
  }

  /**
   * Login to an existing Store as Boss or Cashier
   */
  async loginToStore({ identifier, password, role }) {
    await this.initFromExisting();
    const cleanId = String(identifier || '').trim();
    const cleanPhone = this.normalizePhone(cleanId);
    const cleanPass = String(password || '').trim();
    const requestedRole = role === 'boss' ? 'boss' : 'cashier';

    if (!cleanId || !cleanPass) {
      throw new Error('Please enter your Store Phone / ID and Password.');
    }

    const stores = await this.getAllStores();
    if (stores.length === 0) {
      throw new Error('No store registered on this device yet. Please switch to "Create New Store (Sign Up)" first.');
    }

    const store = stores.find(
      (s) =>
        this.normalizePhone(s.owner_phone) === cleanPhone ||
        s.store_id.toUpperCase() === cleanId.toUpperCase() ||
        s.store_name.toLowerCase() === cleanId.toLowerCase()
    );

    if (!store) {
      throw new Error('Store not found. Check your Store Phone Number or Store ID.');
    }

    if (requestedRole === 'boss') {
      if (cleanPass !== store.owner_password && cleanPass !== store.boss_pin) {
        throw new Error('Invalid Boss Password or PIN.');
      }
      const session = {
        store_id: store.store_id,
        role_mode: 'boss',
        staff_name: store.owner_name,
        logged_in_at: Date.now()
      };
      this.setActiveSession(session);
      await this.TouchClock();
      return { store, session };
    }

    // Cashier login: check staff_devices or store password/PIN
    const staffList = await this.getStoreStaff(store.store_id);
    const matchedStaff = staffList.find(
      (st) => st.pin_or_pass === cleanPass || this.normalizePhone(st.phone) === cleanPhone && st.pin_or_pass === cleanPass
    );

    if (!matchedStaff && cleanPass !== store.owner_password && cleanPass !== store.boss_pin) {
      throw new Error('Invalid Cashier Password or PIN.');
    }

    const session = {
      store_id: store.store_id,
      role_mode: 'cashier',
      staff_name: matchedStaff ? matchedStaff.name : 'Cashier / Attendant',
      logged_in_at: Date.now()
    };
    this.setActiveSession(session);
    await this.TouchClock();
    return { store, session };
  }

  /**
   * Verify 4-digit Boss PIN (or Boss Password) to unlock Boss Mode
   */
  async verifyBossPin(pinInput) {
    const store = await this.getActiveStore();
    if (!store) throw new Error('No active store session.');
    const clean = String(pinInput || '').trim();
    if (clean === store.boss_pin || clean === store.owner_password) {
      const sess = this.getActiveSession() || { store_id: store.store_id };
      sess.role_mode = 'boss';
      sess.staff_name = store.owner_name;
      this.setActiveSession(sess);
      return true;
    }
    return false;
  }

  switchToCashierMode() {
    const sess = this.getActiveSession();
    if (!sess) return;
    sess.role_mode = 'cashier';
    this.setActiveSession(sess);
  }

  // =========================================================================
  // STAFF / CASHIER DEVICE MANAGEMENT
  // =========================================================================

  async getStoreStaff(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['staff_devices'], 'readonly');
      const req = tx.objectStore('staff_devices').getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(all.filter((s) => s.store_id === storeId));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async addStoreStaff({ name, phone, pin_or_pass, device_label }) {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('No active store.');

    const cleanName = String(name || '').trim();
    const cleanPass = String(pin_or_pass || '').trim();
    if (!cleanName || !cleanPass) {
      throw new Error('Staff Name and Cashier Password/PIN are required.');
    }

    const record = {
      id: 'STF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase(),
      store_id: storeId,
      name: cleanName,
      phone: String(phone || '').trim(),
      role: 'cashier',
      pin_or_pass: cleanPass,
      device_label: String(device_label || 'Shop Counter Phone').trim(),
      created_at: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['staff_devices'], 'readwrite');
      tx.objectStore('staff_devices').put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteStoreStaff(staffId) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['staff_devices'], 'readwrite');
      tx.objectStore('staff_devices').delete(staffId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // ANTI-TAMPER CLOCK & STORE SETTINGS
  // =========================================================================

  async TouchClock() {
    const store = await this.getActiveStore();
    const now = Date.now();
    if (!store) {
      return { valid: true, lastSeen: now, now };
    }

    const lastSeen = Number(store.last_seen_timestamp || 0);
    if (now + CLOCK_DRIFT_TOLERANCE_MS < lastSeen) {
      store.clock_tampered = true;
      await this.saveActiveStoreRecord(store);
      return {
        valid: false,
        lastSeen,
        now,
        message: `System clock rollback detected! Current device time (${new Date(now).toLocaleString()}) is behind last recorded activity (${new Date(lastSeen).toLocaleString()}). Please fix your device date and time.`
      };
    }

    store.last_seen_timestamp = Math.max(now, lastSeen);
    store.last_active_at = now;
    store.clock_tampered = false;
    await this.saveActiveStoreRecord(store);
    return { valid: true, lastSeen: store.last_seen_timestamp, now };
  }

  async saveActiveStoreRecord(storeObj) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores'], 'readwrite');
      tx.objectStore('stores').put(storeObj);
      tx.oncomplete = () => resolve(storeObj);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Returns active store settings mapped cleanly for app.js
   */
  async getSettings() {
    const store = await this.getActiveStore();
    if (!store) return {};
    return {
      ...store,
      shop_id: store.store_id,
      shop_name: store.store_name
    };
  }

  async setSetting(key, value) {
    const store = await this.getActiveStore();
    if (!store) return false;
    store[key] = value;
    if (key === 'shop_name' || key === 'store_name') {
      store.store_name = value;
      store.shop_name = value;
    }
    await this.saveActiveStoreRecord(store);
    return true;
  }

  async saveSettings(updates) {
    const store = await this.getActiveStore();
    if (!store) return false;
    Object.assign(store, updates);
    if (updates.shop_name) store.store_name = updates.shop_name;
    if (updates.store_name) store.shop_name = updates.store_name;
    await this.saveActiveStoreRecord(store);
    return true;
  }

  // =========================================================================
  // LICENSE & TOKEN MANAGEMENT (SCOPED BY STORE_ID)
  // =========================================================================

  async getUsedTokens() {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license'], 'readonly');
      const req = tx.objectStore('license').getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(storeId ? all.filter((t) => !t.shop_id || t.shop_id === storeId) : all);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async applyLicenseToken({ tokenKey, tokenCode, issueCode, planDays, shopId }) {
    await this.initFromExisting();
    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) {
      throw new Error(clockCheck.message);
    }

    const store = await this.getActiveStore();
    if (!store) throw new Error('No active store.');
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license', 'stores'], 'readwrite');
      const licenseStore = tx.objectStore('license');
      const storesStore = tx.objectStore('stores');

      const checkReq = licenseStore.get(tokenKey);
      checkReq.onsuccess = () => {
        if (checkReq.result) {
          tx.abort();
          reject(new Error('This token / issue code has already been used on this store.'));
          return;
        }

        const currentExpiry = Number(store.license_expiry || 0);
        const baseTime = currentExpiry > now ? currentExpiry : now;
        const addedMs = Number(planDays) * 24 * 60 * 60 * 1000;
        const newExpiry = baseTime + addedMs;

        licenseStore.put({
          token_id: tokenKey,
          token_code: tokenCode,
          issue_code: issueCode,
          plan_days: Number(planDays),
          shop_id: shopId,
          store_id: store.store_id,
          applied_at: now,
          new_expiry: newExpiry
        });

        store.license_expiry = newExpiry;
        store.license_plan = `${planDays}-Day Prepaid License`;
        store.last_seen_timestamp = now;
        store.last_active_at = now;
        storesStore.put(store);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to apply license token.'));
    });
  }

  // =========================================================================
  // PRODUCTS / INVENTORY STORE (WITH BARCODE & THUMBNAIL IMAGE)
  // =========================================================================

  async getAllProducts(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readonly');
      const req = tx.objectStore('products').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((p) => !p.store_id || p.store_id === storeId);
        list.sort((a, b) => a.name.localeCompare(b.name));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveProduct(product) {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('No active store session.');

    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) throw new Error(clockCheck.message);

    const name = String(product.name || '').trim();
    const category = String(product.category || 'General').trim();
    const barcode = String(product.barcode || '').trim();
    const fallbackThumb =
      typeof window.generateProductSvgThumbnail === 'function'
        ? window.generateProductSvgThumbnail(name, category)
        : '';

    const cleanProduct = {
      id: product.id || ('PRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase()),
      store_id: storeId,
      name,
      category,
      barcode,
      image_url: product.image_url || fallbackThumb,
      cost_price: Number(Number(product.cost_price || 0).toFixed(2)),
      selling_price: Number(Number(product.selling_price || 0).toFixed(2)),
      stock_qty: Math.max(0, Math.floor(Number(product.stock_qty || 0))),
      low_stock_threshold: Math.max(0, Math.floor(Number(product.low_stock_threshold ?? 5))),
      updated_at: Date.now()
    };

    if (!cleanProduct.name) throw new Error('Product name is required.');
    if (isNaN(cleanProduct.cost_price) || cleanProduct.cost_price < 0) throw new Error('Invalid cost price.');
    if (isNaN(cleanProduct.selling_price) || cleanProduct.selling_price <= 0) throw new Error('Selling price must be greater than 0.');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      tx.objectStore('products').put(cleanProduct);
      tx.oncomplete = () => resolve(cleanProduct);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteProduct(productId) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      tx.objectStore('products').delete(productId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // ATOMIC CHECKOUT TRANSACTION (Products + Sales + Debtors + Store Clock)
  // =========================================================================

  async processAtomicCheckout(checkoutPayload) {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('No active store session.');

    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) {
      throw new Error(clockCheck.message);
    }

    const session = this.getActiveSession();
    const { cartItems, paymentMethod, creditDetails } = checkoutPayload;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error('Cannot checkout an empty cart.');
    }

    const now = Date.now();
    const todayStr = this.formatLocalDate(now);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products', 'sales', 'debtors', 'stores'], 'readwrite');
      const productStore = tx.objectStore('products');
      const salesStore = tx.objectStore('sales');
      const debtorsStore = tx.objectStore('debtors');
      const storesStore = tx.objectStore('stores');

      let aborted = false;
      const failTransaction = (msg) => {
        if (!aborted) {
          aborted = true;
          try { tx.abort(); } catch (e) { /* ignore */ }
          reject(new Error(msg));
        }
      };

      const verifiedItems = [];
      let totalAmount = 0;
      let totalProfit = 0;
      let processedCount = 0;

      for (const cartItem of cartItems) {
        const qty = Number(cartItem.qty);
        if (!Number.isInteger(qty) || qty <= 0 || isNaN(qty)) {
          return failTransaction(`Invalid quantity (${cartItem.qty}) for item.`);
        }

        const getReq = productStore.get(cartItem.id);
        getReq.onsuccess = () => {
          if (aborted) return;
          const dbProduct = getReq.result;
          if (!dbProduct || (dbProduct.store_id && dbProduct.store_id !== storeId)) {
            return failTransaction(`Product not found in store inventory (ID: ${cartItem.id}).`);
          }
          if (qty > dbProduct.stock_qty) {
            return failTransaction(`Insufficient stock for "${dbProduct.name}". Available: ${dbProduct.stock_qty}, Requested: ${qty}.`);
          }

          dbProduct.stock_qty -= qty;
          dbProduct.updated_at = now;
          productStore.put(dbProduct);

          const unitCost = Number(dbProduct.cost_price || 0);
          const unitPrice = Number(dbProduct.selling_price || 0);
          const subtotal = Number((unitPrice * qty).toFixed(2));
          const itemProfit = Number(((unitPrice - unitCost) * qty).toFixed(2));

          totalAmount = Number((totalAmount + subtotal).toFixed(2));
          totalProfit = Number((totalProfit + itemProfit).toFixed(2));

          verifiedItems.push({
            id: dbProduct.id,
            name: dbProduct.name,
            category: dbProduct.category,
            barcode: dbProduct.barcode || '',
            cost_price: unitCost,
            selling_price: unitPrice,
            qty,
            subtotal,
            profit: itemProfit
          });

          processedCount++;
          if (processedCount === cartItems.length) {
            finalizeSaleAndDebtor();
          }
        };

        getReq.onerror = () => failTransaction('Database error while verifying product stock.');
      }

      const finalizeSaleAndDebtor = () => {
        if (aborted) return;

        const receiptId = 'RCP-' + new Date(now).toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        let initialDeposit = 0;
        let balanceOwed = 0;
        let customerInfo = null;
        let depositMethod = 'Cash';

        if (paymentMethod === 'Credit') {
          if (!creditDetails) {
            return failTransaction('Customer credit details are required for Credit sales.');
          }
          const cName = String(creditDetails.customerName || '').trim();
          const cPhone = String(creditDetails.customerPhone || '').trim();
          const cLoc = String(creditDetails.customerLocation || '').trim();
          const cDue = String(creditDetails.dueDate || '').trim();
          depositMethod = creditDetails.depositMethod === 'MoMo' ? 'MoMo' : 'Cash';
          initialDeposit = Number(Number(creditDetails.initialDeposit || 0).toFixed(2));

          if (!cName) return failTransaction('Customer Name is required for Credit sales.');
          if (!cPhone) return failTransaction('Customer Phone Number is required for Credit sales.');
          if (!cLoc) return failTransaction('Customer Location / Landmark is required for Credit sales.');
          if (isNaN(initialDeposit) || initialDeposit < 0) return failTransaction('Initial deposit cannot be negative.');
          if (initialDeposit >= totalAmount) {
            return failTransaction('Initial deposit equals or exceeds total amount. Please use Cash or MoMo payment instead.');
          }

          balanceOwed = Number((totalAmount - initialDeposit).toFixed(2));
          customerInfo = {
            name: cName,
            phone: cPhone,
            location: cLoc,
            due_date: cDue,
            initial_deposit: initialDeposit,
            deposit_method: depositMethod,
            balance_owed: balanceOwed
          };
        }

        const saleRecord = {
          id: receiptId,
          store_id: storeId,
          timestamp: now,
          date_str: todayStr,
          items: verifiedItems,
          item_count: verifiedItems.reduce((sum, i) => sum + i.qty, 0),
          total_amount: totalAmount,
          total_profit: totalProfit,
          payment_method: paymentMethod,
          initial_deposit: paymentMethod === 'Credit' ? initialDeposit : totalAmount,
          deposit_method: paymentMethod === 'Credit' ? depositMethod : paymentMethod,
          balance_owed: paymentMethod === 'Credit' ? balanceOwed : 0,
          customer: customerInfo,
          served_by: session ? session.staff_name : 'Attendant',
          repayments: []
        };

        // Update store timestamp
        const storeReq = storesStore.get(storeId);
        storeReq.onsuccess = () => {
          if (storeReq.result) {
            storeReq.result.last_seen_timestamp = now;
            storeReq.result.last_active_at = now;
            storesStore.put(storeReq.result);
          }
        };

        if (paymentMethod !== 'Credit') {
          salesStore.put(saleRecord);
          tx.oncomplete = () => resolve({ sale: saleRecord, debtor: null });
          return;
        }

        const normalizedPhone = customerInfo.phone.replace(/\s+/g, '');
        const allDebtorsReq = debtorsStore.getAll();

        allDebtorsReq.onsuccess = () => {
          if (aborted) return;
          const allDebtors = (allDebtorsReq.result || []).filter((d) => !d.store_id || d.store_id === storeId);
          let debtor = allDebtors.find(
            (d) => String(d.phone || '').replace(/\s+/g, '') === normalizedPhone
          );

          const historyEntry = {
            id: 'HST-' + now + '-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
            type: 'CREDIT_SALE',
            receipt_id: receiptId,
            timestamp: now,
            date_str: todayStr,
            items: verifiedItems.map((i) => ({
              name: i.name,
              qty: i.qty,
              selling_price: i.selling_price,
              subtotal: i.subtotal
            })),
            total_credit_sale: totalAmount,
            initial_deposit: initialDeposit,
            deposit_method: depositMethod,
            amount_added_to_debt: balanceOwed,
            due_date: customerInfo.due_date || null,
            note: `Credit purchase (${verifiedItems.length} item${verifiedItems.length === 1 ? '' : 's'})`
          };

          if (debtor) {
            debtor.store_id = storeId;
            debtor.name = customerInfo.name || debtor.name;
            debtor.location = customerInfo.location || debtor.location;
            debtor.total_owed = Number((Number(debtor.total_owed || 0) + balanceOwed).toFixed(2));
            debtor.total_credit_taken = Number((Number(debtor.total_credit_taken || 0) + totalAmount).toFixed(2));
            debtor.total_paid = Number((Number(debtor.total_paid || 0) + initialDeposit).toFixed(2));
            if (customerInfo.due_date) {
              debtor.due_date = customerInfo.due_date;
            }
            debtor.status = debtor.total_owed > 0 ? 'Unpaid' : 'Cleared';
            debtor.updated_at = now;
            debtor.history = Array.isArray(debtor.history) ? debtor.history : [];
            debtor.history.unshift(historyEntry);
          } else {
            debtor = {
              id: 'DBT-' + now + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
              store_id: storeId,
              name: customerInfo.name,
              phone: customerInfo.phone,
              location: customerInfo.location,
              due_date: customerInfo.due_date || '',
              total_owed: balanceOwed,
              total_credit_taken: totalAmount,
              total_paid: initialDeposit,
              status: balanceOwed > 0 ? 'Unpaid' : 'Cleared',
              created_at: now,
              updated_at: now,
              history: [historyEntry]
            };
          }

          saleRecord.debtor_id = debtor.id;
          salesStore.put(saleRecord);
          debtorsStore.put(debtor);

          tx.oncomplete = () => resolve({ sale: saleRecord, debtor });
        };

        allDebtorsReq.onerror = () => failTransaction('Failed to access Debtors Book during checkout.');
      };

      tx.onerror = () => {
        if (!aborted) {
          reject(tx.error || new Error('Checkout transaction failed.'));
        }
      };
    });
  }

  // =========================================================================
  // DEBTORS BOOK MANAGEMENT (SCOPED BY STORE_ID)
  // =========================================================================

  async getAllDebtors(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['debtors'], 'readonly');
      const req = tx.objectStore('debtors').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((d) => !d.store_id || d.store_id === storeId);
        list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async addManualDebtor({ name, phone, location, amountOwed, itemDescription, dueDate }) {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('No active store.');

    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) throw new Error(clockCheck.message);

    const cName = String(name || '').trim();
    const cPhone = String(phone || '').trim();
    const cLoc = String(location || '').trim();
    const owed = Number(Number(amountOwed || 0).toFixed(2));
    const desc = String(itemDescription || 'Manual credit entry').trim();

    if (!cName || !cPhone || !cLoc) {
      throw new Error('Name, Phone Number, and Location/Landmark are required.');
    }
    if (isNaN(owed) || owed <= 0) {
      throw new Error('Amount owed must be greater than GHS 0.');
    }

    const now = Date.now();
    const todayStr = this.formatLocalDate(now);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['debtors'], 'readwrite');
      const debtorsStore = tx.objectStore('debtors');

      const allReq = debtorsStore.getAll();
      allReq.onsuccess = () => {
        const list = (allReq.result || []).filter((d) => !d.store_id || d.store_id === storeId);
        const normalizedPhone = cPhone.replace(/\s+/g, '');
        let debtor = list.find((d) => String(d.phone || '').replace(/\s+/g, '') === normalizedPhone);

        const historyEntry = {
          id: 'HST-' + now + '-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          type: 'MANUAL_CREDIT',
          timestamp: now,
          date_str: todayStr,
          items: [{ name: desc, qty: 1, selling_price: owed, subtotal: owed }],
          total_credit_sale: owed,
          initial_deposit: 0,
          amount_added_to_debt: owed,
          due_date: dueDate || null,
          note: desc
        };

        if (debtor) {
          debtor.store_id = storeId;
          debtor.name = cName;
          debtor.location = cLoc;
          if (dueDate) debtor.due_date = dueDate;
          debtor.total_owed = Number((Number(debtor.total_owed || 0) + owed).toFixed(2));
          debtor.total_credit_taken = Number((Number(debtor.total_credit_taken || 0) + owed).toFixed(2));
          debtor.status = debtor.total_owed > 0 ? 'Unpaid' : 'Cleared';
          debtor.updated_at = now;
          debtor.history = Array.isArray(debtor.history) ? debtor.history : [];
          debtor.history.unshift(historyEntry);
        } else {
          debtor = {
            id: 'DBT-' + now + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
            store_id: storeId,
            name: cName,
            phone: cPhone,
            location: cLoc,
            due_date: dueDate || '',
            total_owed: owed,
            total_credit_taken: owed,
            total_paid: 0,
            status: 'Unpaid',
            created_at: now,
            updated_at: now,
            history: [historyEntry]
          };
        }

        debtorsStore.put(debtor);
        tx.oncomplete = () => resolve(debtor);
      };
      allReq.onerror = () => reject(allReq.error);
    });
  }

  async recordDebtorPayment({ debtorId, amount, paymentMethod, note }) {
    await this.initFromExisting();
    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) throw new Error(clockCheck.message);

    const payAmount = Number(Number(amount || 0).toFixed(2));
    if (isNaN(payAmount) || payAmount <= 0) {
      throw new Error('Payment amount must be greater than GHS 0.00');
    }

    const method = paymentMethod === 'MoMo' ? 'MoMo' : 'Cash';
    const now = Date.now();
    const todayStr = this.formatLocalDate(now);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['debtors'], 'readwrite');
      const debtorsStore = tx.objectStore('debtors');

      const req = debtorsStore.get(debtorId);
      req.onsuccess = () => {
        const debtor = req.result;
        if (!debtor) {
          tx.abort();
          return reject(new Error('Debtor record not found.'));
        }

        const currentOwed = Number(debtor.total_owed || 0);
        if (currentOwed <= 0) {
          tx.abort();
          return reject(new Error('This customer already has a cleared balance (GHS 0.00).'));
        }
        if (payAmount > currentOwed) {
          tx.abort();
          return reject(new Error(`Payment amount (GHS ${payAmount.toFixed(2)}) exceeds balance owed (GHS ${currentOwed.toFixed(2)}).`));
        }

        const newBalance = Number((currentOwed - payAmount).toFixed(2));
        debtor.total_owed = newBalance;
        debtor.total_paid = Number((Number(debtor.total_paid || 0) + payAmount).toFixed(2));
        debtor.status = newBalance <= 0 ? 'Cleared' : 'Unpaid';
        debtor.updated_at = now;

        const paymentEntry = {
          id: 'PAY-' + now + '-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          type: 'PAYMENT',
          timestamp: now,
          date_str: todayStr,
          amount_paid: payAmount,
          payment_method: method,
          balance_before: currentOwed,
          balance_after: newBalance,
          note: String(note || `Debt repayment via ${method}`).trim()
        };

        debtor.history = Array.isArray(debtor.history) ? debtor.history : [];
        debtor.history.unshift(paymentEntry);

        debtorsStore.put(debtor);
        tx.oncomplete = () => resolve({ debtor, paymentEntry });
      };

      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // SALES HISTORY & DAILY FINANCIAL METRICS (SCOPED BY STORE_ID)
  // =========================================================================

  async getAllSales(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sales'], 'readonly');
      const req = tx.objectStore('sales').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((s) => !s.store_id || s.store_id === storeId);
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getDailyReport(dateStr) {
    const [allSales, allDebtors] = await Promise.all([
      this.getAllSales(),
      this.getAllDebtors()
    ]);

    const daySales = allSales.filter((s) => s.date_str === dateStr);

    let totalRevenue = 0;
    let grossProfit = 0;
    let cashSalesCollected = 0;
    let momoSalesCollected = 0;
    let newCreditGiven = 0;

    for (const sale of daySales) {
      totalRevenue += Number(sale.total_amount || 0);

      const saleProfit = Array.isArray(sale.items)
        ? sale.items.reduce((acc, item) => {
            const p = (Number(item.selling_price || 0) - Number(item.cost_price || 0)) * Number(item.qty || 0);
            return acc + p;
          }, 0)
        : Number(sale.total_profit || 0);

      grossProfit += saleProfit;

      if (sale.payment_method === 'Cash') {
        cashSalesCollected += Number(sale.total_amount || 0);
      } else if (sale.payment_method === 'MoMo') {
        momoSalesCollected += Number(sale.total_amount || 0);
      } else if (sale.payment_method === 'Credit') {
        const initDep = Number(sale.initial_deposit || 0);
        const depMethod = sale.deposit_method || 'Cash';
        if (depMethod === 'MoMo') {
          momoSalesCollected += initDep;
        } else {
          cashSalesCollected += initDep;
        }
        newCreditGiven += Number(sale.balance_owed || 0);
      }
    }

    let cashDebtRepayments = 0;
    let momoDebtRepayments = 0;
    const dayRepayments = [];

    for (const debtor of allDebtors) {
      if (!Array.isArray(debtor.history)) continue;
      for (const h of debtor.history) {
        if (h.type === 'PAYMENT' && h.date_str === dateStr) {
          const amt = Number(h.amount_paid || 0);
          if (h.payment_method === 'MoMo') {
            momoDebtRepayments += amt;
          } else {
            cashDebtRepayments += amt;
          }
          dayRepayments.push({
            ...h,
            debtor_name: debtor.name,
            debtor_phone: debtor.phone
          });
        }
      }
    }

    const totalCashCollected = cashSalesCollected + cashDebtRepayments;
    const totalMoMoRecorded = momoSalesCollected + momoDebtRepayments;

    return {
      dateStr,
      sales: daySales,
      repayments: dayRepayments,
      metrics: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        cashCollected: Number(totalCashCollected.toFixed(2)),
        cashFromSales: Number(cashSalesCollected.toFixed(2)),
        cashFromDebtors: Number(cashDebtRepayments.toFixed(2)),
        momoRecorded: Number(totalMoMoRecorded.toFixed(2)),
        momoFromSales: Number(momoSalesCollected.toFixed(2)),
        momoFromDebtors: Number(momoDebtRepayments.toFixed(2)),
        newCreditGiven: Number(newCreditGiven.toFixed(2)),
        salesCount: daySales.length
      }
    };
  }

  // =========================================================================
  // STAGE 3 & 4 SUPER-ADMIN TELEMETRY SUMMARY PAYLOAD
  // =========================================================================

  /**
   * Compiles a privacy-safe telemetry summary object for the active store
   */
  async getStoreTelemetrySummary(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    const store = await this.getStoreById(storeId);
    if (!store) return null;

    const [products, sales] = await Promise.all([
      this.getAllProducts(storeId),
      this.getAllSales(storeId)
    ]);

    const totalStockUnits = products.reduce((sum, p) => sum + Number(p.stock_qty || 0), 0);
    const totalRevenueGhs = Number(
      sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0).toFixed(2)
    );

    const now = Date.now();
    const expiry = Number(store.license_expiry || 0);
    let licenseStatus = 'Active';
    if (store.clock_tampered) {
      licenseStatus = 'Clock_Tamper_Locked';
    } else if (expiry <= now) {
      licenseStatus = 'Expired';
    } else if (String(store.license_plan || '').toLowerCase().includes('trial')) {
      licenseStatus = 'Trial_Active';
    }

    return {
      store_id: store.store_id,
      store_name: store.store_name,
      store_category: store.store_category || 'Provision & Mini-Mart',
      owner_name: store.owner_name || '',
      owner_phone: store.owner_phone || '',
      created_at: new Date(store.created_at || now).toISOString(),
      total_products_count: products.length,
      total_stock_units: totalStockUnits,
      total_sales_count: sales.length,
      total_revenue_ghs: totalRevenueGhs,
      license_status: licenseStatus,
      license_expiry_date: new Date(expiry || now).toISOString(),
      last_active_at: new Date(store.last_active_at || now).toISOString()
    };
  }

  // =========================================================================
  // BACKUP, RESTORE & OPTIONAL SAMPLE ITEMS LOADER
  // =========================================================================

  async exportFullBackup() {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    const [store, products, sales, debtors, license, staff, telemetry] = await Promise.all([
      this.getActiveStore(),
      this.getAllProducts(storeId),
      this.getAllSales(storeId),
      this.getAllDebtors(storeId),
      this.getUsedTokens(),
      this.getStoreStaff(storeId),
      this.getStoreTelemetrySummary(storeId)
    ]);

    return {
      app: 'HolyStarPOS',
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      shop_id: store ? store.store_id : 'HS-001',
      telemetry_summary: telemetry,
      data: {
        settings: store || {},
        store: store || {},
        products,
        sales,
        debtors,
        license,
        staff_devices: staff
      }
    };
  }

  async restoreFullBackup(backupJson) {
    await this.initFromExisting();
    if (!backupJson || typeof backupJson !== 'object' || backupJson.app !== 'HolyStarPOS' || !backupJson.data) {
      throw new Error('Invalid backup file format. Expected a valid HolyStarPOS JSON backup.');
    }

    const { settings, store, products, sales, debtors, license, staff_devices } = backupJson.data;
    const targetStore = store && store.store_id ? store : settings;
    if (!Array.isArray(products) || !Array.isArray(sales) || !Array.isArray(debtors) || !targetStore) {
      throw new Error('Corrupted backup structure: missing products, sales, debtors, or store settings.');
    }

    const storeId = targetStore.store_id || targetStore.shop_id || this.getActiveStoreId() || 'HS-RESTORED';
    targetStore.store_id = storeId;
    targetStore.shop_id = storeId;
    targetStore.store_name = targetStore.store_name || targetStore.shop_name || 'Restored Store';
    targetStore.shop_name = targetStore.store_name;
    targetStore.last_seen_timestamp = Date.now();
    targetStore.clock_tampered = false;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores', 'products', 'sales', 'debtors', 'license', 'staff_devices'], 'readwrite');
      tx.objectStore('stores').put(targetStore);

      const pStore = tx.objectStore('products');
      for (const p of products) {
        if (p && p.id) pStore.put({ ...p, store_id: storeId });
      }

      const sStore = tx.objectStore('sales');
      for (const s of sales) {
        if (s && s.id) sStore.put({ ...s, store_id: storeId });
      }

      const dStore = tx.objectStore('debtors');
      for (const d of debtors) {
        if (d && d.id) dStore.put({ ...d, store_id: storeId });
      }

      if (Array.isArray(license)) {
        const lStore = tx.objectStore('license');
        for (const l of license) {
          if (l && l.token_id) lStore.put({ ...l, store_id: storeId });
        }
      }

      if (Array.isArray(staff_devices)) {
        const stStore = tx.objectStore('staff_devices');
        for (const st of staff_devices) {
          if (st && st.id) stStore.put({ ...st, store_id: storeId });
        }
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to restore backup.'));
    });
  }

  /**
   * Optional: Load Sample Ghanaian Shop Items into the active store ONLY when clicked in Settings
   */
  async loadDemoShopData() {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('Please log into a store first.');

    const now = Date.now();
    const thumb = (n, c) =>
      typeof window.generateProductSvgThumbnail === 'function'
        ? window.generateProductSvgThumbnail(n, c)
        : '';

    const demoProducts = [
      {
        id: `PRD-${storeId}-01`,
        store_id: storeId,
        name: 'Nestle Milo Activ-Go Tin 400g',
        category: 'Beverages',
        barcode: '6031100200017',
        image_url: thumb('Nestle Milo Activ-Go Tin 400g', 'Beverages'),
        cost_price: 42.00,
        selling_price: 50.00,
        stock_qty: 24,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-02`,
        store_id: storeId,
        name: 'Ideal Evaporated Milk 160g Tin',
        category: 'Milk & Dairy',
        barcode: '6031100300014',
        image_url: thumb('Ideal Evaporated Milk 160g Tin', 'Milk & Dairy'),
        cost_price: 9.50,
        selling_price: 12.00,
        stock_qty: 48,
        low_stock_threshold: 10,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-03`,
        store_id: storeId,
        name: "McVitie's Digestive Biscuit 105g",
        category: 'Biscuits & Snacks',
        barcode: '6031100100010',
        image_url: thumb("McVitie's Digestive Biscuit 105g", 'Biscuits & Snacks'),
        cost_price: 11.00,
        selling_price: 15.00,
        stock_qty: 30,
        low_stock_threshold: 6,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-04`,
        store_id: storeId,
        name: 'Perk Milk Shortcake Biscuit',
        category: 'Biscuits & Snacks',
        barcode: '6031100100034',
        image_url: thumb('Perk Milk Shortcake Biscuit', 'Biscuits & Snacks'),
        cost_price: 3.50,
        selling_price: 5.00,
        stock_qty: 50,
        low_stock_threshold: 10,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-05`,
        store_id: storeId,
        name: 'Gino Tomato Paste Mix 70g Sachet',
        category: 'Tin & Canned Foods',
        barcode: '6031100400011',
        image_url: thumb('Gino Tomato Paste Mix 70g Sachet', 'Tin & Canned Foods'),
        cost_price: 3.80,
        selling_price: 5.00,
        stock_qty: 60,
        low_stock_threshold: 12,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-06`,
        store_id: storeId,
        name: 'Frytol Vegetable Cooking Oil 1 Litre',
        category: 'Grains & Oils',
        barcode: '6031100500018',
        image_url: thumb('Frytol Vegetable Cooking Oil 1 Litre', 'Grains & Oils'),
        cost_price: 36.00,
        selling_price: 43.00,
        stock_qty: 15,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-07`,
        store_id: storeId,
        name: 'Titus Sardines in Vegetable Oil 125g',
        category: 'Tin & Canned Foods',
        barcode: '6031100400059',
        image_url: thumb('Titus Sardines in Vegetable Oil 125g', 'Tin & Canned Foods'),
        cost_price: 14.50,
        selling_price: 18.00,
        stock_qty: 30,
        low_stock_threshold: 8,
        updated_at: now
      },
      {
        id: `PRD-${storeId}-08`,
        store_id: storeId,
        name: 'Cindy Jasmine Long Grain Rice 5kg',
        category: 'Grains & Oils',
        barcode: '6031100500032',
        image_url: thumb('Cindy Jasmine Long Grain Rice 5kg', 'Grains & Oils'),
        cost_price: 105.00,
        selling_price: 125.00,
        stock_qty: 12,
        low_stock_threshold: 4,
        updated_at: now
      }
    ];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const productStore = tx.objectStore('products');
      for (const p of demoProducts) {
        productStore.put(p);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to load sample items.'));
    });
  }

  formatLocalDate(ts = Date.now()) {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

window.HolyStarDB = new HolyStarDatabase();
