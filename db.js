/**
 * Holy Star POS - IndexedDB Wrapper (db.js)
 * Complete offline-first storage layer with atomic transactions,
 * anti-tamper clock tracking, license store, products, sales, and debtors.
 */

const DB_NAME = 'HolyStarPOS_DB';
const DB_VERSION = 1;
const CLOCK_DRIFT_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance

class HolyStarDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize IndexedDB and ensure default settings & 7-day trial exist
   */
  async init() {
    if (this.db) return this.db;

    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Settings Store (key-value style using 'key')
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 2. Products Store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('category', 'category', { unique: false });
        }

        // 3. Sales Store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('date_str', 'date_str', { unique: false });
          salesStore.createIndex('timestamp', 'timestamp', { unique: false });
          salesStore.createIndex('payment_method', 'payment_method', { unique: false });
        }

        // 4. Debtors Store
        if (!db.objectStoreNames.contains('debtors')) {
          const debtorStore = db.createObjectStore('debtors', { keyPath: 'id' });
          debtorStore.createIndex('phone', 'phone', { unique: false });
          debtorStore.createIndex('status', 'status', { unique: false });
        }

        // 5. License Store (stores used tokens/issue codes to prevent replay)
        if (!db.objectStoreNames.contains('license')) {
          const licenseStore = db.createObjectStore('license', { keyPath: 'token_id' });
          licenseStore.createIndex('applied_at', 'applied_at', { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(new Error('Failed to open IndexedDB: ' + event.target.error));
    });

    await this.ensureDefaults();
    return this.db;
  }

  /**
   * Ensure initial shop settings and 7-day trial are initialized on first load
   */
  async ensureDefaults() {
    const settings = await this.getSettings();
    const now = Date.now();

    if (!settings.initialized) {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const defaultSettings = {
        initialized: true,
        shop_id: 'HS-001',
        shop_name: 'Holy Star Provision Store',
        owner_phone: '0240000000',
        shop_location: 'Bolgatanga Central Market',
        license_expiry: now + sevenDaysMs,
        license_plan: '7-Day Initial Trial',
        last_seen_timestamp: now,
        clock_tampered: false,
        created_at: now
      };
      await this.saveSettings(defaultSettings);
    } else {
      await this.TouchClock();
    }
  }

  /**
   * Anti-tamper check: updates last_seen_timestamp or flags clock rollback
   */
  async TouchClock() {
    const settings = await this.getSettings();
    const now = Date.now();
    const lastSeen = Number(settings.last_seen_timestamp || 0);

    if (now + CLOCK_DRIFT_TOLERANCE_MS < lastSeen) {
      // Device clock was rolled backward significantly
      await this.setSetting('clock_tampered', true);
      return {
        valid: false,
        lastSeen,
        now,
        message: `System clock rollback detected! Current device time (${new Date(now).toLocaleString()}) is behind last recorded activity (${new Date(lastSeen).toLocaleString()}). Please fix your device date and time.`
      };
    }

    // Clock is valid and moving forward
    const updates = { last_seen_timestamp: Math.max(now, lastSeen), clock_tampered: false };
    await this.saveSettings(updates);
    return { valid: true, lastSeen: updates.last_seen_timestamp, now };
  }

  /**
   * Get all settings as a flat object
   */
  async getSettings() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      const req = store.getAll();
      req.onsuccess = () => {
        const result = {};
        for (const item of req.result) {
          result[item.key] = item.value;
        }
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async initFromExisting() {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * Save single setting key/value
   */
  async setSetting(key, value) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Save multiple settings at once
   */
  async saveSettings(obj) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      for (const [key, value] of Object.entries(obj)) {
        store.put({ key, value });
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // LICENSE & TOKEN MANAGEMENT
  // =========================================================================

  async getUsedTokens() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license'], 'readonly');
      const req = tx.objectStore('license').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async isTokenUsed(tokenKey) {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license'], 'readonly');
      const req = tx.objectStore('license').get(tokenKey);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  async applyLicenseToken({ tokenKey, tokenCode, issueCode, planDays, shopId }) {
    await this.initFromExisting();
    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) {
      throw new Error(clockCheck.message);
    }

    const settings = await this.getSettings();
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['license', 'settings'], 'readwrite');
      const licenseStore = tx.objectStore('license');
      const settingsStore = tx.objectStore('settings');

      const checkReq = licenseStore.get(tokenKey);
      checkReq.onsuccess = () => {
        if (checkReq.result) {
          tx.abort();
          reject(new Error('This token / issue code has already been used on this shop device.'));
          return;
        }

        const currentExpiry = Number(settings.license_expiry || 0);
        const baseTime = currentExpiry > now ? currentExpiry : now;
        const addedMs = Number(planDays) * 24 * 60 * 60 * 1000;
        const newExpiry = baseTime + addedMs;

        licenseStore.put({
          token_id: tokenKey,
          token_code: tokenCode,
          issue_code: issueCode,
          plan_days: Number(planDays),
          shop_id: shopId,
          applied_at: now,
          new_expiry: newExpiry
        });

        settingsStore.put({ key: 'license_expiry', value: newExpiry });
        settingsStore.put({ key: 'license_plan', value: `${planDays}-Day Prepaid License` });
        settingsStore.put({ key: 'last_seen_timestamp', value: now });
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to apply license token.'));
    });
  }

  // =========================================================================
  // PRODUCTS / INVENTORY STORE
  // =========================================================================

  async getAllProducts() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products'], 'readonly');
      const req = tx.objectStore('products').getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => a.name.localeCompare(b.name));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveProduct(product) {
    await this.initFromExisting();
    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) throw new Error(clockCheck.message);

    const cleanProduct = {
      id: product.id || ('PRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase()),
      name: String(product.name || '').trim(),
      category: String(product.category || 'General').trim(),
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
  // ATOMIC CHECKOUT TRANSACTION (Products + Sales + Debtors + Clock)
  // =========================================================================

  /**
   * Process a checkout atomically in a single IndexedDB transaction.
   * Enforces stock quantities, deducts stock, saves sale record, and updates/creates debtor if Credit.
   */
  async processAtomicCheckout(checkoutPayload) {
    await this.initFromExisting();
    const clockCheck = await this.TouchClock();
    if (!clockCheck.valid) {
      throw new Error(clockCheck.message);
    }

    const {
      cartItems, // [{ id, qty }]
      paymentMethod, // 'Cash' | 'MoMo' | 'Credit'
      creditDetails // { customerName, customerPhone, customerLocation, initialDeposit, depositMethod, dueDate }
    } = checkoutPayload;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error('Cannot checkout an empty cart.');
    }

    const now = Date.now();
    const todayStr = this.formatLocalDate(now);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products', 'sales', 'debtors', 'settings'], 'readwrite');
      const productStore = tx.objectStore('products');
      const salesStore = tx.objectStore('sales');
      const debtorsStore = tx.objectStore('debtors');
      const settingsStore = tx.objectStore('settings');

      let aborted = false;
      const failTransaction = (msg) => {
        if (!aborted) {
          aborted = true;
          try { tx.abort(); } catch (e) { /* ignore */ }
          reject(new Error(msg));
        }
      };

      // Step 1: Fetch and verify all products inside the atomic transaction
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
          if (!dbProduct) {
            return failTransaction(`Product not found in database (ID: ${cartItem.id}).`);
          }
          if (qty > dbProduct.stock_qty) {
            return failTransaction(`Insufficient stock for "${dbProduct.name}". Available: ${dbProduct.stock_qty}, Requested: ${qty}.`);
          }

          // Deduct stock immediately within the transaction
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
          timestamp: now,
          date_str: todayStr,
          items: verifiedItems,
          item_count: verifiedItems.reduce((sum, i) => sum + i.qty, 0),
          total_amount: totalAmount,
          total_profit: totalProfit,
          payment_method: paymentMethod, // 'Cash' | 'MoMo' | 'Credit'
          initial_deposit: paymentMethod === 'Credit' ? initialDeposit : totalAmount,
          deposit_method: paymentMethod === 'Credit' ? depositMethod : paymentMethod,
          balance_owed: paymentMethod === 'Credit' ? balanceOwed : 0,
          customer: customerInfo,
          repayments: [] // populated if credit repayments are linked or tracked in debtor history
        };

        // Update clock timestamp inside atomic transaction
        settingsStore.put({ key: 'last_seen_timestamp', value: now });

        if (paymentMethod !== 'Credit') {
          salesStore.put(saleRecord);
          tx.oncomplete = () => resolve({ sale: saleRecord, debtor: null });
          return;
        }

        // For Credit sales: find existing debtor by normalized phone or create new debtor record
        const normalizedPhone = customerInfo.phone.replace(/\s+/g, '');
        const allDebtorsReq = debtorsStore.getAll();

        allDebtorsReq.onsuccess = () => {
          if (aborted) return;
          const allDebtors = allDebtorsReq.result || [];
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
  // DEBTORS BOOK MANAGEMENT
  // =========================================================================

  async getAllDebtors() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['debtors'], 'readonly');
      const req = tx.objectStore('debtors').getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Add a manual debtor record directly to the Debtors Book
   */
  async addManualDebtor({ name, phone, location, amountOwed, itemDescription, dueDate }) {
    await this.initFromExisting();
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
      const tx = this.db.transaction(['debtors', 'settings'], 'readwrite');
      const debtorsStore = tx.objectStore('debtors');
      const settingsStore = tx.objectStore('settings');

      const allReq = debtorsStore.getAll();
      allReq.onsuccess = () => {
        const list = allReq.result || [];
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
        settingsStore.put({ key: 'last_seen_timestamp', value: now });
        tx.oncomplete = () => resolve(debtor);
      };
      allReq.onerror = () => reject(allReq.error);
    });
  }

  /**
   * Record a partial or full payment from a debtor
   */
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
      const tx = this.db.transaction(['debtors', 'settings'], 'readwrite');
      const debtorsStore = tx.objectStore('debtors');
      const settingsStore = tx.objectStore('settings');

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
        settingsStore.put({ key: 'last_seen_timestamp', value: now });

        tx.oncomplete = () => resolve({ debtor, paymentEntry });
      };

      req.onerror = () => reject(req.error);
    });
  }

  // =========================================================================
  // SALES HISTORY & DAILY FINANCIAL METRICS
  // =========================================================================

  async getAllSales() {
    await this.initFromExisting();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sales'], 'readonly');
      const req = tx.objectStore('sales').getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Calculate complete daily report for a specific YYYY-MM-DD date string
   */
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

      // Calculate accurate profit from items sold: sum((selling_price - cost_price) * qty)
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

    // Also include debtor repayments made on `dateStr`
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
  // BACKUP, RESTORE & DEMO DATA
  // =========================================================================

  async exportFullBackup() {
    await this.initFromExisting();
    const [settings, products, sales, debtors, license] = await Promise.all([
      this.getSettings(),
      this.getAllProducts(),
      this.getAllSales(),
      this.getAllDebtors(),
      this.getUsedTokens()
    ]);

    return {
      app: 'HolyStarPOS',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      shop_id: settings.shop_id || 'HS-001',
      data: {
        settings,
        products,
        sales,
        debtors,
        license
      }
    };
  }

  async restoreFullBackup(backupJson) {
    await this.initFromExisting();

    if (!backupJson || typeof backupJson !== 'object' || backupJson.app !== 'HolyStarPOS' || !backupJson.data) {
      throw new Error('Invalid backup file format. Expected a valid HolyStarPOS JSON backup.');
    }

    const { settings, products, sales, debtors, license } = backupJson.data;
    if (!Array.isArray(products) || !Array.isArray(sales) || !Array.isArray(debtors) || typeof settings !== 'object') {
      throw new Error('Corrupted backup structure: missing products, sales, debtors, or settings.');
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['settings', 'products', 'sales', 'debtors', 'license'], 'readwrite');

      const settingsStore = tx.objectStore('settings');
      const productsStore = tx.objectStore('products');
      const salesStore = tx.objectStore('sales');
      const debtorsStore = tx.objectStore('debtors');
      const licenseStore = tx.objectStore('license');

      settingsStore.clear();
      productsStore.clear();
      salesStore.clear();
      debtorsStore.clear();
      licenseStore.clear();

      for (const [key, value] of Object.entries(settings)) {
        settingsStore.put({ key, value });
      }
      // Update last_seen_timestamp to now so restore doesn't false-lock if backup is older
      settingsStore.put({ key: 'last_seen_timestamp', value: Date.now() });
      settingsStore.put({ key: 'clock_tampered', value: false });

      for (const p of products) {
        if (p && p.id) productsStore.put(p);
      }
      for (const s of sales) {
        if (s && s.id) salesStore.put(s);
      }
      for (const d of debtors) {
        if (d && d.id) debtorsStore.put(d);
      }
      if (Array.isArray(license)) {
        for (const l of license) {
          if (l && l.token_id) licenseStore.put(l);
        }
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to restore backup.'));
    });
  }

  /**
   * Load realistic Ghanaian Provision Shop Demo Data
   */
  async loadDemoShopData() {
    await this.initFromExisting();
    const now = Date.now();
    const todayStr = this.formatLocalDate(now);

    const demoProducts = [
      {
        id: 'PRD-DEMO-01',
        name: 'Nestle Milo Tin 400g',
        category: 'Beverages',
        cost_price: 42.00,
        selling_price: 50.00,
        stock_qty: 24,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-02',
        name: 'Ideal Evaporated Milk 170g',
        category: 'Milk & Dairy',
        cost_price: 9.50,
        selling_price: 12.00,
        stock_qty: 48,
        low_stock_threshold: 10,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-03',
        name: 'Gino Tomato Paste Mix 70g (Sachet)',
        category: 'Cooking & Spices',
        cost_price: 3.80,
        selling_price: 5.00,
        stock_qty: 60,
        low_stock_threshold: 12,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-04',
        name: 'Frytol Vegetable Oil 1 Litre',
        category: 'Cooking & Spices',
        cost_price: 36.00,
        selling_price: 43.00,
        stock_qty: 15,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-05',
        name: 'Titus Sardines in Vegetable Oil 125g',
        category: 'Canned Goods',
        cost_price: 14.50,
        selling_price: 18.00,
        stock_qty: 30,
        low_stock_threshold: 8,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-06',
        name: 'White Granulated Sugar 1kg Pack',
        category: 'Grains & Staples',
        cost_price: 20.00,
        selling_price: 25.00,
        stock_qty: 20,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-07',
        name: 'Indomie InstantJollof / Onion Chicken 70g',
        category: 'Noodles & Pasta',
        cost_price: 5.50,
        selling_price: 7.50,
        stock_qty: 4, // Low stock demo!
        low_stock_threshold: 10,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-08',
        name: 'Key Soap Long Bar (Multipurpose)',
        category: 'Household & Toiletries',
        cost_price: 17.00,
        selling_price: 21.00,
        stock_qty: 18,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-09',
        name: 'Lele Royal Perfume Rice 5kg',
        category: 'Grains & Staples',
        cost_price: 105.00,
        selling_price: 125.00,
        stock_qty: 10,
        low_stock_threshold: 4,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-10',
        name: 'Peak Powdered Milk Sachet 30g',
        category: 'Milk & Dairy',
        cost_price: 4.50,
        selling_price: 6.00,
        stock_qty: 0, // Out of stock demo!
        low_stock_threshold: 10,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-11',
        name: 'Geisha Bath Soap 125g',
        category: 'Household & Toiletries',
        cost_price: 8.50,
        selling_price: 11.00,
        stock_qty: 22,
        low_stock_threshold: 5,
        updated_at: now
      },
      {
        id: 'PRD-DEMO-12',
        name: 'Blue Band Margarine Tub 250g',
        category: 'Beverages',
        cost_price: 19.00,
        selling_price: 24.00,
        stock_qty: 14,
        low_stock_threshold: 5,
        updated_at: now
      }
    ];

    const demoDebtor = {
      id: 'DBT-DEMO-01',
      name: 'Madam Akosua Mensah',
      phone: '0244123456',
      location: 'Near Bolga Central Market Lorry Station',
      due_date: todayStr,
      total_owed: 47.00,
      total_credit_taken: 67.00,
      total_paid: 20.00,
      status: 'Unpaid',
      created_at: now - 3600000,
      updated_at: now - 3600000,
      history: [
        {
          id: 'HST-DEMO-01',
          type: 'CREDIT_SALE',
          receipt_id: 'RCP-DEMO-01',
          timestamp: now - 3600000,
          date_str: todayStr,
          items: [
            { name: 'Nestle Milo Tin 400g', qty: 1, selling_price: 50.00, subtotal: 50.00 },
            { name: 'Ideal Evaporated Milk 170g', qty: 1, selling_price: 12.00, subtotal: 12.00 },
            { name: 'Gino Tomato Paste Mix 70g (Sachet)', qty: 1, selling_price: 5.00, subtotal: 5.00 }
          ],
          total_credit_sale: 67.00,
          initial_deposit: 20.00,
          deposit_method: 'Cash',
          amount_added_to_debt: 47.00,
          due_date: todayStr,
          note: 'Credit purchase (3 items)'
        }
      ]
    };

    const demoSales = [
      {
        id: 'RCP-DEMO-01',
        timestamp: now - 3600000,
        date_str: todayStr,
        items: [
          {
            id: 'PRD-DEMO-01',
            name: 'Nestle Milo Tin 400g',
            category: 'Beverages',
            cost_price: 42.00,
            selling_price: 50.00,
            qty: 1,
            subtotal: 50.00,
            profit: 8.00
          },
          {
            id: 'PRD-DEMO-02',
            name: 'Ideal Evaporated Milk 170g',
            category: 'Milk & Dairy',
            cost_price: 9.50,
            selling_price: 12.00,
            qty: 1,
            subtotal: 12.00,
            profit: 2.50
          },
          {
            id: 'PRD-DEMO-03',
            name: 'Gino Tomato Paste Mix 70g (Sachet)',
            category: 'Cooking & Spices',
            cost_price: 3.80,
            selling_price: 5.00,
            qty: 1,
            subtotal: 5.00,
            profit: 1.20
          }
        ],
        item_count: 3,
        total_amount: 67.00,
        total_profit: 11.70,
        payment_method: 'Credit',
        initial_deposit: 20.00,
        deposit_method: 'Cash',
        balance_owed: 47.00,
        debtor_id: 'DBT-DEMO-01',
        customer: {
          name: 'Madam Akosua Mensah',
          phone: '0244123456',
          location: 'Near Bolga Central Market Lorry Station',
          due_date: todayStr,
          initial_deposit: 20.00,
          deposit_method: 'Cash',
          balance_owed: 47.00
        }
      },
      {
        id: 'RCP-DEMO-02',
        timestamp: now - 1800000,
        date_str: todayStr,
        items: [
          {
            id: 'PRD-DEMO-04',
            name: 'Frytol Vegetable Oil 1 Litre',
            category: 'Cooking & Spices',
            cost_price: 36.00,
            selling_price: 43.00,
            qty: 1,
            subtotal: 43.00,
            profit: 7.00
          },
          {
            id: 'PRD-DEMO-05',
            name: 'Titus Sardines in Vegetable Oil 125g',
            category: 'Canned Goods',
            cost_price: 14.50,
            selling_price: 18.00,
            qty: 2,
            subtotal: 36.00,
            profit: 7.00
          }
        ],
        item_count: 3,
        total_amount: 79.00,
        total_profit: 14.00,
        payment_method: 'Cash',
        initial_deposit: 79.00,
        deposit_method: 'Cash',
        balance_owed: 0,
        customer: null
      }
    ];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['products', 'debtors', 'sales', 'settings'], 'readwrite');
      const productStore = tx.objectStore('products');
      const debtorStore = tx.objectStore('debtors');
      const salesStore = tx.objectStore('sales');
      const settingsStore = tx.objectStore('settings');

      for (const p of demoProducts) {
        productStore.put(p);
      }
      debtorStore.put(demoDebtor);
      for (const s of demoSales) {
        salesStore.put(s);
      }
      settingsStore.put({ key: 'last_seen_timestamp', value: now });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to load demo shop data.'));
    });
  }

  /**
   * Helper: format timestamp as local YYYY-MM-DD
   */
  formatLocalDate(ts = Date.now()) {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

window.HolyStarDB = new HolyStarDatabase();

