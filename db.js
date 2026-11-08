/**
 * Holy Star POS v3.0 - Multi-Store SaaS IndexedDB & Cross-Device Cloud Sync Engine (db.js)
 * Features:
 * - Strict Store Isolation by `store_id` (0 Products, 0 Sales, 0 Debtors on new store)
 * - Cross-Device Cloud Login & Hydration (`/api/auth`, `/api/sync`, and Cloud Relay)
 * - Period Financial Analytics (Today, Pick Date, This Week, This Month, All-Time)
 * - Daily Close Receipt Archiving (`closed_days` object store)
 * - Full Store Cloud Backup & Sync (`syncFullStoreOnline`)
 */

const DB_NAME = 'HolyStarPOS_DB';
const DB_VERSION = 4;
const CLOCK_DRIFT_TOLERANCE_MS = 5 * 60 * 1000;
const SESSION_STORAGE_KEY = 'holystar_active_session_v3';
const CLOUD_SYNC_TOPIC_V3 = 'holystar_pos_cloud_v3_sync_2026';

class HolyStarDatabase {
  constructor() {
    this.db = null;
    this.legacyCleaned = false;
  }

  /**
   * Initialize IndexedDB (v4 schema with `closed_days` and non-blocking upgrade)
   */
  async init() {
    if (this.db) return this.db;

    this.db = await new Promise((resolve, reject) => {
      let settled = false;
      const finishResolve = (dbInstance) => {
        if (settled) return;
        settled = true;
        if (dbInstance) {
          dbInstance.onversionchange = () => {
            try { dbInstance.close(); } catch (e) { }
            this.db = null;
          };
        }
        resolve(dbInstance);
      };
      const finishReject = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        console.warn('IndexedDB upgrade blocked by another tab; closing old connection...');
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;

        db.onversionchange = () => {
          try { db.close(); } catch (e) { }
          this.db = null;
        };

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('stores')) {
          const storeObj = db.createObjectStore('stores', { keyPath: 'store_id' });
          storeObj.createIndex('owner_phone', 'owner_phone', { unique: false });
        }

        if (!db.objectStoreNames.contains('staff_devices')) {
          const staffStore = db.createObjectStore('staff_devices', { keyPath: 'id' });
          staffStore.createIndex('store_id', 'store_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('category', 'category', { unique: false });
          productStore.createIndex('store_id', 'store_id', { unique: false });
          productStore.createIndex('barcode', 'barcode', { unique: false });
        }

        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('date_str', 'date_str', { unique: false });
          salesStore.createIndex('timestamp', 'timestamp', { unique: false });
          salesStore.createIndex('payment_method', 'payment_method', { unique: false });
          salesStore.createIndex('store_id', 'store_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('debtors')) {
          const debtorStore = db.createObjectStore('debtors', { keyPath: 'id' });
          debtorStore.createIndex('phone', 'phone', { unique: false });
          debtorStore.createIndex('status', 'status', { unique: false });
          debtorStore.createIndex('store_id', 'store_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('license')) {
          const licenseStore = db.createObjectStore('license', { keyPath: 'token_id' });
          licenseStore.createIndex('applied_at', 'applied_at', { unique: false });
        }

        if (!db.objectStoreNames.contains('closed_days')) {
          const closedStore = db.createObjectStore('closed_days', { keyPath: 'id' });
          closedStore.createIndex('store_id', 'store_id', { unique: false });
          closedStore.createIndex('date_str', 'date_str', { unique: false });
        }

        // Purge any legacy records without `store_id`
        ['products', 'sales', 'debtors', 'license'].forEach((storeName) => {
          if (db.objectStoreNames.contains(storeName)) {
            const os = tx.objectStore(storeName);
            const cursorReq = os.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) {
                const val = cursor.value;
                if (!val || !val.store_id) {
                  cursor.delete();
                }
                cursor.continue();
              }
            };
          }
        });
      };

      request.onsuccess = (event) => finishResolve(event.target.result);
      request.onerror = (event) => finishReject(new Error('Failed to open IndexedDB: ' + event.target.error));
    });

    if (!this.legacyCleaned) {
      this.legacyCleaned = true;
      await this.purgeLegacyRecordsWithoutStoreId();
    }

    return this.db;
  }

  async initFromExisting() {
    if (!this.db) {
      await this.init();
    }
  }

  async purgeLegacyRecordsWithoutStoreId() {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['products', 'sales', 'debtors', 'license'], 'readwrite');
        ['products', 'sales', 'debtors', 'license'].forEach((storeName) => {
          const store = tx.objectStore(storeName);
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              if (!cursor.value || !cursor.value.store_id) {
                cursor.delete();
              }
              cursor.continue();
            }
          };
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  // =========================================================================
  // SESSION, AUTHENTICATION & CROSS-DEVICE MULTI-STORE ONBOARDING
  // =========================================================================

  getActiveSession() {
    try {
      let raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        const legacyV2 = localStorage.getItem('holystar_active_session_v2');
        if (legacyV2) {
          localStorage.setItem(SESSION_STORAGE_KEY, legacyV2);
          raw = legacyV2;
        }
      }
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
      localStorage.removeItem('holystar_active_session_v2');
      return;
    }
    const str = JSON.stringify(sessionObj);
    localStorage.setItem(SESSION_STORAGE_KEY, str);
    localStorage.setItem('holystar_active_session_v2', str);
  }

  logoutSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('holystar_active_session_v2');
  }

  clearActiveSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('holystar_active_session_v2');
  }

  getActiveStoreId() {
    const sess = this.getActiveSession();
    return sess ? sess.store_id : null;
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/\s+/g, '').replace(/^\+233/, '0');
  }

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
   * Create a brand-new Store account with 0 products, 0 sales, 0 debtors, and a 7-day trial,
   * and immediately sync to Cloud if online so it works across Phone & PC.
   */
  async registerNewStore(params = {}) {
    await this.initFromExisting();

    const cleanName = String(params.store_name || params.storeName || '').trim();
    const cleanCat = String(params.store_category || params.storeCategory || 'Provision & Mini-Mart').trim();
    const cleanOwner = String(params.owner_name || params.ownerName || '').trim();
    const cleanPhone = this.normalizePhone(params.owner_phone || params.ownerPhone);
    const cleanPass = String(params.owner_password || params.password || '').trim();
    const cleanLoc = String(params.store_location || params.location || 'Ghana').trim();

    if (!cleanName) throw new Error('Store Name is required.');
    if (!cleanOwner) throw new Error('Owner Full Name is required.');
    if (!cleanPhone || cleanPhone.length < 9) throw new Error('Valid Owner Phone Number is required.');
    if (!cleanPass || cleanPass.length < 4) throw new Error('Password must be at least 4 characters.');

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
      shop_id: storeId,
      store_name: cleanName,
      shop_name: cleanName,
      store_category: cleanCat,
      owner_name: cleanOwner,
      owner_phone: cleanPhone,
      owner_password: cleanPass,
      shop_location: cleanLoc,
      location: cleanLoc,
      license_expiry: now + sevenDaysMs,
      license_plan: '7-Day Initial Trial',
      last_seen_timestamp: now,
      last_active_at: now,
      last_synced_at: typeof navigator !== 'undefined' && navigator.onLine ? now : 0,
      clock_tampered: false,
      created_at: now
    };

    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stores'], 'readwrite');
      tx.objectStore('stores').put(newStore);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to create store.'));
    });

    const session = {
      store_id: storeId,
      owner_name: cleanOwner,
      logged_in_at: now
    };
    this.setActiveSession(session);

    // Sync new store to Cloud in background if online so Phone & PC both see it
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.syncFullStoreOnline(storeId).catch(() => { });
    } else {
      this.syncTelemetryHeartbeat(storeId, 'store_registered_offline').catch(() => { });
    }

    return { store: newStore, session };
  }

  /**
   * Cross-Device Unified Store Login:
   * 1. Checks local IndexedDB.
   * 2. If not on this device yet (or if online), fetches from `/api/auth` & Cloud Sync Channel
   *    and hydrates local IndexedDB so the user can log in from ANY phone or PC anywhere!
   */
  async loginToStore({ identifier, password }) {
    await this.initFromExisting();
    const cleanId = String(identifier || '').trim();
    const cleanPhone = this.normalizePhone(cleanId);
    const cleanPass = String(password || '').trim();

    if (!cleanId || !cleanPass) {
      throw new Error('Please enter your Store Phone / ID and Password.');
    }

    const matchStoreFn = (s) =>
      s &&
      (this.normalizePhone(s.owner_phone) === cleanPhone ||
        String(s.store_id || '').toUpperCase() === cleanId.toUpperCase() ||
        String(s.store_name || '').toLowerCase() === cleanId.toLowerCase());

    let localStores = await this.getAllStores();
    let store = localStores.find(matchStoreFn);

    // If online, try fetching latest cloud bundle (especially if store isn't on this device yet!)
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const cloudResult = await this.fetchCloudStoreBundleForLogin(cleanId, cleanPass);
        if (cloudResult && cloudResult.store) {
          await this.hydrateStoreBundleIntoIndexedDB(cloudResult.bundle || { store: cloudResult.store });
          localStores = await this.getAllStores();
          store = localStores.find(matchStoreFn) || cloudResult.store;
        }
      } catch (cloudErr) {
        // Fallback to local store if cloud unreachable
      }
    }

    if (!store) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Store not found on this device while offline. Connect to the internet once to download your store from Cloud.');
      }
      throw new Error('Store account not found. Check your Phone Number / Store ID, or sync the store online from your other device first.');
    }

    if (cleanPass !== String(store.owner_password || '')) {
      throw new Error('Incorrect password. Please try again.');
    }

    const session = {
      store_id: store.store_id,
      owner_name: store.owner_name,
      logged_in_at: Date.now()
    };
    this.setActiveSession(session);
    await this.TouchClock();

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.syncFullStoreOnline(store.store_id).catch(() => { });
    }

    return { store, session };
  }

  /**
   * Look up a store bundle from `/api/auth`, the V3 Cloud Sync Stream (`ntfy.sh` inline + attachments),
   * and the V1 Telemetry Stream so ANY registered store can be logged into from ANY device.
   */
  async fetchCloudStoreBundleForLogin(identifier, password) {
    const cleanId = String(identifier || '').trim();
    const cleanPhone = this.normalizePhone(cleanId);
    const cleanPass = String(password || '').trim();

    const isStoreMatch = (s) =>
      s &&
      (this.normalizePhone(s.owner_phone) === cleanPhone ||
        String(s.store_id || '').toUpperCase() === cleanId.toUpperCase() ||
        String(s.store_name || '').toLowerCase() === cleanId.toLowerCase());

    // 1. Try serverless `/api/auth`
    try {
      const res = await fetch('./api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', identifier: cleanId, password: cleanPass })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.store) {
          return { store: data.store, bundle: data.bundle };
        }
      }
    } catch (e) {}

    // 2. Fallback: Query V3 Cloud Sync Channel directly from browser (inline JSON + attachments)
    try {
      const res = await fetch(`https://ntfy.sh/${CLOUD_SYNC_TOPIC_V3}/json?poll=1&since=all`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        let latestStore = null;
        let latestBundle = null;
        let latestTs = 0;
        const matchingAttachments = [];

        for (const line of lines) {
          try {
            const env = JSON.parse(line);
            if (env && env.event === 'message') {
              if (env.attachment && env.attachment.url) {
                const titleStr = String(env.title || '');
                if (!titleStr || titleStr.toUpperCase().includes(cleanId.toUpperCase()) || matchingAttachments.length < 6) {
                  matchingAttachments.push({ url: env.attachment.url, time: env.time });
                }
              } else if (env.message && env.message.startsWith('{')) {
                const msg = JSON.parse(env.message);
                const candidateStore = msg.store || (msg.bundle && msg.bundle.store) || null;
                if (candidateStore && isStoreMatch(candidateStore)) {
                  const ts = Number(msg.updated_at || (env.time ? env.time * 1000 : 0));
                  if (ts >= latestTs) {
                    latestTs = ts;
                    latestStore = candidateStore;
                    if (msg.bundle) latestBundle = msg.bundle;
                  }
                }
              }
            }
          } catch (lineErr) {}
        }

        // Check attachments (newest first) for full bundle or store match
        for (const att of matchingAttachments.slice(-4).reverse()) {
          try {
            const attRes = await fetch(att.url);
            if (attRes.ok) {
              const attJson = await attRes.json();
              const b = attJson.bundle || (attJson.store ? attJson : null);
              const s = (b && b.store) || attJson.store;
              if (s && isStoreMatch(s)) {
                latestStore = s;
                latestBundle = b;
                break;
              }
            }
          } catch (attErr) {}
        }

        if (latestStore) {
          const storedPass = String(latestStore.owner_password || '');
          if (!storedPass || storedPass === cleanPass) {
            return {
              store: latestStore,
              bundle: latestBundle || { store: latestStore }
            };
          }
        }
      }
    } catch (e) {}

    // 3. Fallback: Check V1 Telemetry Channel & Local Telemetry Registry for stores created in v2.x
    try {
      await this.pullCloudTelemetry();
      const registry = this.getTelemetryRegistryMap();
      const matchedSummary = Object.values(registry).find((s) => isStoreMatch(s));
      if (matchedSummary && matchedSummary.store_id) {
        const now = Date.now();
        const reconstructedStore = {
          store_id: matchedSummary.store_id,
          shop_id: matchedSummary.store_id,
          store_name: matchedSummary.store_name || `Store ${matchedSummary.store_id}`,
          shop_name: matchedSummary.store_name || `Store ${matchedSummary.store_id}`,
          store_category: matchedSummary.store_category || 'Provision & Mini-Mart',
          owner_name: matchedSummary.owner_name || 'Store Owner',
          owner_phone: matchedSummary.owner_phone || cleanPhone,
          owner_password: matchedSummary.owner_password || cleanPass,
          shop_location: matchedSummary.location || 'Ghana',
          location: matchedSummary.location || 'Ghana',
          license_expiry: Number(matchedSummary.license_expiry_ts || (now + 7 * 24 * 60 * 60 * 1000)),
          license_plan: matchedSummary.license_plan || '7-Day Initial Trial',
          last_seen_timestamp: now,
          last_active_at: now,
          last_synced_at: now,
          clock_tampered: false,
          created_at: Number(matchedSummary.created_at_ts || now)
        };
        return {
          store: reconstructedStore,
          bundle: { store: reconstructedStore, products: [], sales: [], debtors: [], closed_days: [], license: [] }
        };
      }
    } catch (e) {}

    return null;
  }

  /**
   * Hydrate a store bundle (`store`, `products`, `sales`, `debtors`, `closed_days`, `license`)
   * into local IndexedDB so a newly logged-in phone or PC has all store data offline!
   */
  async hydrateStoreBundleIntoIndexedDB(bundle) {
    if (!bundle || !bundle.store || !bundle.store.store_id) return false;
    await this.initFromExisting();

    const targetStore = bundle.store;
    const storeId = targetStore.store_id;
    targetStore.last_seen_timestamp = Date.now();
    targetStore.clock_tampered = false;

    const products = Array.isArray(bundle.products) ? bundle.products : [];
    const sales = Array.isArray(bundle.sales) ? bundle.sales : [];
    const debtors = Array.isArray(bundle.debtors) ? bundle.debtors : [];
    const closedDays = Array.isArray(bundle.closed_days) ? bundle.closed_days : [];
    const license = Array.isArray(bundle.license) ? bundle.license : [];

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(
          ['stores', 'products', 'sales', 'debtors', 'closed_days', 'license'],
          'readwrite'
        );
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

        const cStore = tx.objectStore('closed_days');
        for (const c of closedDays) {
          if (c && c.id) cStore.put({ ...c, store_id: storeId });
        }

        const lStore = tx.objectStore('license');
        for (const l of license) {
          if (l && l.token_id) lStore.put({ ...l, store_id: storeId });
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
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
        message: 'Device clock was rolled backward. Please fix your phone/PC date and time.'
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

  async getSettings() {
    const store = await this.getActiveStore();
    if (!store) return {};
    return {
      ...store,
      shop_id: store.store_id,
      shop_name: store.store_name
    };
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
  // LICENSE & TOKEN MANAGEMENT (STRICTLY SCOPED BY STORE_ID)
  // =========================================================================

  async getUsedTokens(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license'], 'readonly');
      const req = tx.objectStore('license').getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(all.filter((t) => t && (t.store_id === storeId || t.shop_id === storeId)));
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
          reject(new Error('This token has already been used on this store.'));
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
  // PRODUCTS / INVENTORY STORE (STRICTLY SCOPED BY STORE_ID)
  // =========================================================================

  async getAllProducts(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readonly');
      const req = tx.objectStore('products').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((p) => p && p.store_id === storeId);
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

  async restockProduct(productId, addQty) {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    if (!storeId) throw new Error('No active store session.');

    const qtyToAdd = Math.floor(Number(addQty || 0));
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      throw new Error('Quantity to add must be at least 1.');
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      const getReq = store.get(productId);
      let updatedItem = null;

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item || item.store_id !== storeId) {
          tx.abort();
          return reject(new Error('Product not found in store inventory.'));
        }
        item.stock_qty = Math.max(0, Number(item.stock_qty || 0) + qtyToAdd);
        item.updated_at = Date.now();
        updatedItem = item;
        store.put(item);
      };

      tx.oncomplete = () => resolve(updatedItem);
      tx.onerror = () => reject(tx.error || new Error('Failed to restock product.'));
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
  // ATOMIC CHECKOUT TRANSACTION (SUPPORTS CASH, MOMO & PARTIAL-CASH DEBTORS)
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
    const { cartItems, paymentMethod, cashTendered, momoPhone, creditDetails } = checkoutPayload;

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
          try { tx.abort(); } catch (e) { }
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
          if (!dbProduct || dbProduct.store_id !== storeId) {
            return failTransaction(`Product not found in store inventory.`);
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
            return failTransaction('Customer details are required to record balance in Debtors.');
          }
          const cName = String(creditDetails.customerName || '').trim();
          const cPhone = String(creditDetails.customerPhone || '').trim();
          const cLoc = String(creditDetails.customerLocation || '').trim();
          const cDue = String(creditDetails.dueDate || '').trim();
          depositMethod = creditDetails.depositMethod === 'MoMo' ? 'MoMo' : 'Cash';
          initialDeposit = Number(Number(creditDetails.initialDeposit || 0).toFixed(2));

          if (!cName) return failTransaction('Customer Name is required.');
          if (!cPhone) return failTransaction('Customer Phone Number is required.');
          if (!cLoc) return failTransaction('Customer Location / Landmark is required.');
          if (isNaN(initialDeposit) || initialDeposit < 0) return failTransaction('Amount paid cannot be negative.');
          if (initialDeposit >= totalAmount) {
            return failTransaction('Amount paid equals or exceeds total. Use Cash or MoMo instead.');
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

        const tenderedNum = cashTendered !== undefined && cashTendered !== '' ? Number(cashTendered) : totalAmount;
        const changeGiven = paymentMethod === 'Cash' ? Math.max(0, Number((tenderedNum - totalAmount).toFixed(2))) : 0;

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
          cash_tendered: paymentMethod === 'Cash' ? tenderedNum : initialDeposit,
          change_given: changeGiven,
          momo_phone: momoPhone || '',
          initial_deposit: paymentMethod === 'Credit' ? initialDeposit : totalAmount,
          deposit_method: paymentMethod === 'Credit' ? depositMethod : paymentMethod,
          balance_owed: paymentMethod === 'Credit' ? balanceOwed : 0,
          customer: customerInfo,
          served_by: session ? session.owner_name : 'Store Owner',
          repayments: []
        };

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
          const allDebtors = (allDebtorsReq.result || []).filter((d) => d && d.store_id === storeId);
          let debtor = allDebtors.find(
            (d) => String(d.phone || '').replace(/\s+/g, '') === normalizedPhone
          );

          const historyEntry = {
            id: 'HST-' + now + '-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
            type: 'CREDIT_SALE',
            sale_id: receiptId,
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
            note: `Paid GHS ${initialDeposit.toFixed(2)}, Remainder GHS ${balanceOwed.toFixed(2)}`
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
  // DEBTORS MANAGEMENT (STRICTLY SCOPED BY STORE_ID)
  // =========================================================================

  async getAllDebtors(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['debtors'], 'readonly');
      const req = tx.objectStore('debtors').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((d) => d && d.store_id === storeId);
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
    const desc = String(itemDescription || 'Credit entry').trim();

    if (!cName || !cPhone || !cLoc) {
      throw new Error('Name, Phone Number, and Location are required.');
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
        const list = (allReq.result || []).filter((d) => d && d.store_id === storeId);
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
    const storeId = this.getActiveStoreId();
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
        if (!debtor || debtor.store_id !== storeId) {
          tx.abort();
          return reject(new Error('Debtor record not found in this store.'));
        }

        const currentOwed = Number(debtor.total_owed || 0);
        if (currentOwed <= 0) {
          tx.abort();
          return reject(new Error('This customer already has a cleared balance.'));
        }
        if (payAmount > currentOwed) {
          tx.abort();
          return reject(new Error(`Payment (GHS ${payAmount.toFixed(2)}) exceeds balance owed (GHS ${currentOwed.toFixed(2)}).`));
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
          note: String(note || `Repayment via ${method}`).trim()
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
  // SALES ANALYTICS (TODAY / PICK DATE / THIS WEEK / THIS MONTH / ALL-TIME)
  // =========================================================================

  async getAllSales(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sales'], 'readonly');
      const req = tx.objectStore('sales').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((s) => s && s.store_id === storeId);
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  isDateInPeriod(dateStr, timestamp, periodType = 'TODAY', customDateStr = '') {
    const todayStr = this.formatLocalDate();
    if (periodType === 'ALL') return true;
    if (periodType === 'TODAY') return dateStr === todayStr;
    if (periodType === 'DATE') return dateStr === (customDateStr || todayStr);

    const now = new Date();
    if (periodType === 'MONTH') {
      const monthPrefix = todayStr.slice(0, 7); // YYYY-MM
      return String(dateStr || '').startsWith(monthPrefix);
    }

    if (periodType === 'WEEK') {
      // Monday-start of current week (or last 7 days)
      const dayOfWeek = now.getDay(); // 0 (Sun) .. 6 (Sat)
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
      const itemTs = timestamp ? Number(timestamp) : Date.parse(dateStr + 'T12:00:00');
      return itemTs >= startOfWeek.getTime();
    }

    return dateStr === todayStr;
  }

  async getSalesReportByPeriod(periodType = 'TODAY', customDateStr = '') {
    const [allSales, allDebtors] = await Promise.all([
      this.getAllSales(),
      this.getAllDebtors()
    ]);

    const filteredSales = allSales.filter((s) =>
      this.isDateInPeriod(s.date_str, s.timestamp, periodType, customDateStr)
    );

    let totalRevenue = 0;
    let grossProfit = 0;
    let cashSalesCollected = 0;
    let momoSalesCollected = 0;
    let newCreditGiven = 0;

    for (const sale of filteredSales) {
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
    const periodRepayments = [];

    for (const debtor of allDebtors) {
      if (!Array.isArray(debtor.history)) continue;
      for (const h of debtor.history) {
        if (h.type === 'PAYMENT' && this.isDateInPeriod(h.date_str, h.timestamp, periodType, customDateStr)) {
          const amt = Number(h.amount_paid || 0);
          if (h.payment_method === 'MoMo') {
            momoDebtRepayments += amt;
          } else {
            cashDebtRepayments += amt;
          }
          periodRepayments.push({
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
      periodType,
      dateStr: customDateStr || this.formatLocalDate(),
      sales: filteredSales,
      repayments: periodRepayments,
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
        salesCount: filteredSales.length
      }
    };
  }

  async getDailyReport(dateStr) {
    return this.getSalesReportByPeriod('DATE', dateStr || this.formatLocalDate());
  }

  // =========================================================================
  // DAILY CLOSE RECEIPT ARCHIVE (`closed_days` STORE)
  // =========================================================================

  async archiveClosedDay({ dateStr, metrics, auditSeal }) {
    await this.initFromExisting();
    const store = await this.getActiveStore();
    if (!store) throw new Error('No active store.');

    const targetDate = dateStr || this.formatLocalDate();
    const recordId = `${store.store_id}_${targetDate}`;
    const now = Date.now();

    const closedRecord = {
      id: recordId,
      store_id: store.store_id,
      store_name: store.store_name,
      date_str: targetDate,
      sales_count: Number(metrics?.salesCount || 0),
      revenue: Number(metrics?.totalRevenue || 0),
      profit: Number(metrics?.grossProfit || 0),
      cash_collected: Number(metrics?.cashCollected || 0),
      momo: Number(metrics?.momoRecorded || 0),
      credit_given: Number(metrics?.newCreditGiven || 0),
      audit_seal: auditSeal || '',
      closed_at: now
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['closed_days'], 'readwrite');
      tx.objectStore('closed_days').put(closedRecord);
      tx.oncomplete = () => resolve(closedRecord);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllClosedDays(storeId = this.getActiveStoreId()) {
    await this.initFromExisting();
    if (!storeId) return [];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['closed_days'], 'readonly');
      const req = tx.objectStore('closed_days').getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter((c) => c && c.store_id === storeId);
        list.sort((a, b) => String(b.date_str || '').localeCompare(String(a.date_str || '')));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // CLOUD + LOCAL SYNC ENGINE (`/api/sync` + `ntfy.sh` + `localStorage`)
  // =========================================================================

  getTelemetryRegistryMap() {
    const merged = {};
    for (const key of ['holystar_superadmin_registry_v1', 'holystar_telemetry_registry_v1']) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.assign(merged, parsed);
          }
        }
      } catch (e) {}
    }
    return merged;
  }

  saveTelemetryRegistryMap(mapObj) {
    try {
      const str = JSON.stringify(mapObj || {});
      localStorage.setItem('holystar_telemetry_registry_v1', str);
      localStorage.setItem('holystar_superadmin_registry_v1', str);
    } catch (e) {}
  }

  getCloudSyncConfig() {
    return {
      topic: CLOUD_SYNC_TOPIC_V3,
      customUrl: ''
    };
  }

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
    const msLeft = expiry - now;
    const daysRemaining = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;

    let licenseStatus = 'Active';
    if (store.clock_tampered) {
      licenseStatus = 'Clock_Tamper_Locked';
    } else if (expiry <= now) {
      licenseStatus = 'Expired';
    } else if (daysRemaining <= 2) {
      licenseStatus = 'Expiring_Soon';
    } else if (String(store.license_plan || '').toLowerCase().includes('trial')) {
      licenseStatus = 'Trial_Active';
    }

    const lastSyncedTs = Number(store.last_synced_at || 0);

    return {
      store_id: store.store_id,
      store_name: store.store_name,
      store_category: store.store_category || 'Provision & Mini-Mart',
      owner_name: store.owner_name || '',
      owner_phone: store.owner_phone || '',
      location: store.shop_location || store.location || '',
      created_at: new Date(store.created_at || now).toISOString(),
      created_at_ts: Number(store.created_at || now),
      total_products_count: products.length,
      total_stock_units: totalStockUnits,
      total_sales_count: sales.length,
      total_revenue_ghs: totalRevenueGhs,
      license_plan: store.license_plan || '7-Day Free Trial',
      license_status: licenseStatus,
      days_remaining: daysRemaining,
      license_expiry_ts: expiry,
      license_expiry_date: new Date(expiry || now).toISOString(),
      last_active_at: new Date(store.last_active_at || now).toISOString(),
      last_active_ts: Number(store.last_active_at || now),
      last_synced_at: lastSyncedTs ? new Date(lastSyncedTs).toISOString() : '',
      last_synced_ts: lastSyncedTs
    };
  }

  /**
   * Explicit Full Store Cloud Sync (used by `Sync Database Online` in Settings & `Close Day` Sync Prompt).
   * Throws `OFFLINE_NO_INTERNET` if the device is disconnected or cannot reach the server.
   */
  async syncFullStoreOnline(storeId = this.getActiveStoreId()) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('OFFLINE_NO_INTERNET');
    }

    await this.initFromExisting();
    const store = await this.getStoreById(storeId);
    if (!store) throw new Error('No active store to sync.');

    const [products, sales, debtors, closed_days, license, telemetry] = await Promise.all([
      this.getAllProducts(storeId),
      this.getAllSales(storeId),
      this.getAllDebtors(storeId),
      this.getAllClosedDays(storeId),
      this.getUsedTokens(storeId),
      this.getStoreTelemetrySummary(storeId)
    ]);

    const now = Date.now();
    telemetry.last_synced_ts = now;
    telemetry.last_synced_at = new Date(now).toISOString();

    const compactProducts = (products || []).map((p) => {
      if (!p || typeof p !== 'object') return p;
      const copy = { ...p };
      if (copy.image_url && String(copy.image_url).startsWith('data:image/svg+xml')) {
        delete copy.image_url;
      }
      if (copy.image_data && String(copy.image_data).startsWith('data:image/svg+xml')) {
        delete copy.image_data;
      }
      return copy;
    });

    const syncedStoreRecord = { ...store, last_synced_at: now };
    const fullBundle = {
      store_id: storeId,
      store: syncedStoreRecord,
      products: compactProducts,
      sales,
      debtors,
      closed_days,
      license,
      telemetry,
      updated_at: now
    };

    let anySuccess = false;

    // 1. Push to `/api/sync`
    try {
      const apiRes = await fetch('./api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullBundle)
      });
      if (apiRes.ok) {
        anySuccess = true;
      }
    } catch (e) {}

    // 2. Push lightweight (<1.5KB) inline Auth + Telemetry message to Cloud Relay (`ntfy.sh`)
    // so `ntfy.sh` NEVER turns store credentials into an attachment, plus push full bundle
    try {
      const authRes = await fetch(`https://ntfy.sh/${CLOUD_SYNC_TOPIC_V3}`, {
        method: 'POST',
        headers: {
          'Title': `HolyStar Auth ${storeId}`,
          'Priority': 'default'
        },
        body: JSON.stringify({
          _type: 'HOLYSTAR_STORE_AUTH_V3',
          store_id: storeId,
          updated_at: now,
          store: syncedStoreRecord,
          telemetry
        })
      });
      if (authRes.ok) {
        anySuccess = true;
      }

      const cloudRes = await fetch(`https://ntfy.sh/${CLOUD_SYNC_TOPIC_V3}`, {
        method: 'POST',
        headers: {
          'Title': `HolyStar Cloud Sync ${storeId}`,
          'Priority': 'default'
        },
        body: JSON.stringify({
          _type: 'HOLYSTAR_CLOUD_SYNC_V3',
          store_id: storeId,
          updated_at: now,
          telemetry,
          bundle: fullBundle
        })
      });
      if (cloudRes.ok) {
        anySuccess = true;
      }
    } catch (e) {}

    if (!anySuccess) {
      throw new Error('OFFLINE_NO_INTERNET');
    }

    // Update `last_synced_at` in local IndexedDB & registry
    store.last_synced_at = now;
    await this.saveActiveStoreRecord(store);

    const registry = this.getTelemetryRegistryMap();
    registry[storeId] = {
      ...(registry[storeId] || {}),
      ...telemetry,
      last_synced_ts: now,
      last_synced_at: new Date(now).toISOString()
    };
    this.saveTelemetryRegistryMap(registry);

    return { ok: true, synced_at: now, telemetry: registry[storeId] };
  }

  /**
   * Non-blocking background heartbeat
   */
  async syncTelemetryHeartbeat(storeId = this.getActiveStoreId(), eventReason = 'heartbeat') {
    try {
      await this.initFromExisting();
      if (!storeId) return null;

      const summary = await this.getStoreTelemetrySummary(storeId);
      if (!summary) return null;

      const registry = this.getTelemetryRegistryMap();
      registry[storeId] = {
        ...(registry[storeId] || {}),
        ...summary,
        last_event: eventReason,
        updated_local_ts: Date.now()
      };
      this.saveTelemetryRegistryMap(registry);

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.syncFullStoreOnline(storeId).catch(() => { });
      }

      return registry[storeId];
    } catch (e) {
      return null;
    }
  }

  async pushTelemetryToCloud(telemetryItem) {
    if (!telemetryItem || !telemetryItem.store_id) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    try {
      await fetch(`https://ntfy.sh/${CLOUD_SYNC_TOPIC_V3}`, {
        method: 'POST',
        body: JSON.stringify({
          _type: 'HOLYSTAR_CLOUD_SYNC_V3',
          store_id: telemetryItem.store_id,
          updated_at: Date.now(),
          telemetry: telemetryItem
        })
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async getAllStoresTelemetry() {
    await this.initFromExisting();
    const dbStores = await this.getAllStores();
    const registry = this.getTelemetryRegistryMap();

    for (const s of dbStores) {
      if (!s || !s.store_id) continue;
      const liveSummary = await this.getStoreTelemetrySummary(s.store_id);
      if (liveSummary) {
        const prev = registry[s.store_id] || {};
        if (prev.admin_expected_expiry_ts && prev.admin_expected_expiry_ts > liveSummary.license_expiry_ts) {
          liveSummary.admin_expected_expiry_ts = prev.admin_expected_expiry_ts;
          liveSummary.admin_expected_expiry_date = prev.admin_expected_expiry_date;
        }
        registry[s.store_id] = {
          ...prev,
          ...liveSummary
        };
      }
    }

    this.saveTelemetryRegistryMap(registry);
    return Object.values(registry).filter((item) => item && item.store_id);
  }

  /**
   * Pull global store directory from `/api/sync?all=1` + Cloud Sync Channel,
   * and auto-push any local IndexedDB stores that haven't been announced to the cloud yet
   * so PC and Phone always show the exact same stores!
   */
  async pullCloudTelemetry() {
    const localList = await this.getAllStoresTelemetry();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return localList;
    }

    const registry = this.getTelemetryRegistryMap();
    const seenInCloud = new Set();

    // 1. Fetch from `/api/sync?all=1`
    try {
      const apiRes = await fetch('./api/sync?all=1', { cache: 'no-store' });
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data && Array.isArray(data.stores)) {
          for (const t of data.stores) {
            if (t && t.store_id) {
              seenInCloud.add(t.store_id);
              const existing = registry[t.store_id];
              const incomingTs = Number(t.last_synced_ts || 0);
              const existingTs = existing ? Number(existing.last_synced_ts || 0) : 0;
              if (!existing || incomingTs >= existingTs) {
                registry[t.store_id] = { ...(existing || {}), ...t };
              }
            }
          }
        }
      }
    } catch (e) { }

    // 2. Fetch from Cloud Relay (`ntfy.sh` v3 + legacy v1 topic)
    for (const topic of [CLOUD_SYNC_TOPIC_V3, 'holystar_pos_telemetry_sync_2026_v1']) {
      try {
        const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const text = await res.text();
          const lines = text.split('\n').filter((l) => l.trim().length > 0);
          for (const line of lines) {
            try {
              const env = JSON.parse(line);
              if (env && env.event === 'message' && env.message) {
                const parsed = JSON.parse(env.message);
                const t = parsed && parsed.telemetry ? parsed.telemetry : null;
                if (t && t.store_id) {
                  seenInCloud.add(t.store_id);
                  const existing = registry[t.store_id];
                  const incomingTs = Number(t.last_synced_ts || parsed.updated_at || parsed.sent_at || 0);
                  const existingTs = existing ? Number(existing.last_synced_ts || 0) : 0;
                  if (!existing || incomingTs >= existingTs) {
                    registry[t.store_id] = {
                      ...(existing || {}),
                      ...t,
                      last_synced_ts: incomingTs || Date.now(),
                      last_synced_at: new Date(incomingTs || Date.now()).toISOString()
                    };
                  }
                }
              }
            } catch (lineErr) { }
          }
        }
      } catch (err) { }
    }

    // 3. Re-announce any local IndexedDB stores not yet in Cloud so Phone & PC stay 100% identical
    const localDbStores = await this.getAllStores();
    for (const s of localDbStores) {
      if (s && s.store_id && !seenInCloud.has(s.store_id)) {
        this.syncFullStoreOnline(s.store_id).catch(() => { });
      }
    }

    this.saveTelemetryRegistryMap(registry);
    return Object.values(registry).filter((item) => item && item.store_id);
  }

  // =========================================================================
  // BACKUP & RESTORE
  // =========================================================================

  async exportFullBackup() {
    await this.initFromExisting();
    const storeId = this.getActiveStoreId();
    const [store, products, sales, debtors, closed_days, license, telemetry] = await Promise.all([
      this.getActiveStore(),
      this.getAllProducts(storeId),
      this.getAllSales(storeId),
      this.getAllDebtors(storeId),
      this.getAllClosedDays(storeId),
      this.getUsedTokens(storeId),
      this.getStoreTelemetrySummary(storeId)
    ]);

    return {
      app: 'HolyStarPOS',
      version: '3.0.0',
      exported_at: new Date().toISOString(),
      shop_id: store ? store.store_id : 'HS-0000',
      telemetry_summary: telemetry,
      data: {
        settings: store || {},
        store: store || {},
        products,
        sales,
        debtors,
        closed_days,
        license
      }
    };
  }

  async restoreFullBackup(backupJson) {
    await this.initFromExisting();
    if (!backupJson || typeof backupJson !== 'object' || backupJson.app !== 'HolyStarPOS' || !backupJson.data) {
      throw new Error('Invalid backup file format. Expected a valid HolyStarPOS JSON backup.');
    }

    const { settings, store, products, sales, debtors, closed_days, license } = backupJson.data;
    const targetStore = store && store.store_id ? store : settings;
    if (!Array.isArray(products) || !Array.isArray(sales) || !Array.isArray(debtors) || !targetStore) {
      throw new Error('Corrupted backup structure.');
    }

    const storeId = targetStore.store_id || targetStore.shop_id || this.getActiveStoreId() || 'HS-RESTORED';
    targetStore.store_id = storeId;
    targetStore.shop_id = storeId;
    targetStore.store_name = targetStore.store_name || targetStore.shop_name || 'Restored Store';
    targetStore.shop_name = targetStore.store_name;
    targetStore.last_seen_timestamp = Date.now();
    targetStore.clock_tampered = false;

    await this.hydrateStoreBundleIntoIndexedDB({
      store: targetStore,
      products,
      sales,
      debtors,
      closed_days: Array.isArray(closed_days) ? closed_days : [],
      license: Array.isArray(license) ? license : []
    });

    return true;
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
