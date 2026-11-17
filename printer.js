/**
 * Holy Star POS - Thermal Receipt Printer Engine (printer.js)
 * Supports:
 * 1. 58mm & 80mm USB / Desktop Thermal Printers via optimized @media print CSS
 * 2. Direct Web Bluetooth ESC/POS Portable Thermal Printers (Android / Chrome)
 */

(function (global) {
  'use strict';

  const PRINTER_STORAGE_KEY = 'holystar_printer_settings_v1';

  // Common Bluetooth Thermal Printer GATT Service & Characteristic UUIDs
  const THERMAL_SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '0000ff00-0000-1000-8000-00805f9b34fb'
  ];

  const btState = {
    device: null,
    server: null,
    characteristic: null,
    deviceName: ''
  };

  function getSettings() {
    const defaults = {
      paperWidth: '80mm',
      customFooter: 'Goods sold are not returnable. Thank you!'
    };
    try {
      const raw = localStorage.getItem(PRINTER_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        paperWidth: parsed.paperWidth === '58mm' ? '58mm' : '80mm',
        customFooter: typeof parsed.customFooter === 'string' && parsed.customFooter.trim()
          ? parsed.customFooter.trim()
          : defaults.customFooter
      };
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings({ paperWidth, customFooter }) {
    const current = getSettings();
    const next = {
      paperWidth: paperWidth === '58mm' ? '58mm' : '80mm',
      customFooter: typeof customFooter === 'string' && customFooter.trim()
        ? customFooter.trim()
        : current.customFooter
    };
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function isBluetoothSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  function isBluetoothConnected() {
    return Boolean(btState.device && btState.device.gatt && btState.device.gatt.connected && btState.characteristic);
  }

  function getConnectedDeviceName() {
    return isBluetoothConnected() ? (btState.deviceName || btState.device.name || 'Thermal Printer') : '';
  }

  async function findWritableCharacteristic(server) {
    for (const uuid of THERMAL_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(uuid);
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties && (c.properties.write || c.properties.writeWithoutResponse)) {
            return c;
          }
        }
      } catch (e) {
        // Try next service UUID
      }
    }

    if (typeof server.getPrimaryServices === 'function') {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties && (c.properties.write || c.properties.writeWithoutResponse)) {
            return c;
          }
        }
      }
    }
    return null;
  }

  async function connectBluetoothPrinter() {
    if (!isBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome on Android or Desktop.');
    }

    let device = null;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: THERMAL_SERVICE_UUIDS
      });
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: THERMAL_SERVICE_UUIDS
        });
      } else {
        throw err;
      }
    }

    if (!device) {
      throw new Error('No Bluetooth printer selected.');
    }

    const server = await device.gatt.connect();
    const characteristic = await findWritableCharacteristic(server);
    if (!characteristic) {
      try { device.gatt.disconnect(); } catch (e) {}
      throw new Error('Connected device does not expose a writable ESC/POS print characteristic.');
    }

    btState.device = device;
    btState.server = server;
    btState.characteristic = characteristic;
    btState.deviceName = device.name || 'Bluetooth Printer';

    device.addEventListener('gattserverdisconnected', () => {
      btState.characteristic = null;
      btState.server = null;
    });

    return btState.deviceName;
  }

  function disconnectBluetoothPrinter() {
    if (btState.device && btState.device.gatt && btState.device.gatt.connected) {
      try { btState.device.gatt.disconnect(); } catch (e) {}
    }
    btState.device = null;
    btState.server = null;
    btState.characteristic = null;
    btState.deviceName = '';
  }

  // =========================================================================
  // ESC/POS BYTE ENCODER
  // =========================================================================

  function createEscPosBuffer(paperWidth) {
    const cols = paperWidth === '58mm' ? 32 : 42;
    const bytes = [];
    const encoder = new TextEncoder();

    const pushRaw = (arr) => {
      for (const b of arr) bytes.push(b);
    };
    const pushText = (str) => {
      const encoded = encoder.encode(String(str || ''));
      for (const b of encoded) bytes.push(b);
    };
    const line = (str = '') => {
      pushText(str + '\n');
    };
    const divider = (ch = '-') => {
      line(ch.repeat(cols));
    };
    const pair = (left, right) => {
      const l = String(left || '');
      const r = String(right || '');
      const maxLeft = Math.max(1, cols - r.length - 1);
      const lTrim = l.length > maxLeft ? l.slice(0, maxLeft) : l;
      const spaces = Math.max(1, cols - lTrim.length - r.length);
      line(lTrim + ' '.repeat(spaces) + r);
    };

    return {
      cols,
      init() { pushRaw([0x1b, 0x40]); }, // ESC @
      alignLeft() { pushRaw([0x1b, 0x61, 0x00]); },
      alignCenter() { pushRaw([0x1b, 0x61, 0x01]); },
      boldOn() { pushRaw([0x1b, 0x45, 0x01]); },
      boldOff() { pushRaw([0x1b, 0x45, 0x00]); },
      doubleSizeOn() { pushRaw([0x1d, 0x21, 0x11]); },
      doubleSizeOff() { pushRaw([0x1d, 0x21, 0x00]); },
      feed(n = 3) { pushRaw([0x1b, 0x64, n]); },
      cut() { pushRaw([0x1d, 0x56, 0x00]); },
      line,
      divider,
      pair,
      toUint8Array() { return new Uint8Array(bytes); }
    };
  }

  function fmtGhs(num) {
    return 'GHS ' + Number(num || 0).toFixed(2);
  }

  function formatPrintDate(ts) {
    return new Date(ts || Date.now()).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function encodeCustomerReceiptEscPos(sale, store) {
    const settings = getSettings();
    const esc = createEscPosBuffer(settings.paperWidth);
    const s = store || {};

    esc.init();
    esc.alignCenter();
    esc.boldOn();
    esc.doubleSizeOn();
    esc.line((s.store_name || 'HOLY STAR POS').toUpperCase());
    esc.doubleSizeOff();
    esc.boldOff();
    esc.line(`${s.shop_location || s.location || 'Ghana'}${s.owner_phone ? ' | ' + s.owner_phone : ''}`);
    esc.divider('-');

    esc.alignLeft();
    esc.pair('Receipt:', sale.id || '-');
    esc.pair('Date:', formatPrintDate(sale.timestamp));
    esc.pair('Method:', sale.payment_method || 'Cash');
    esc.divider('-');

    for (const item of (sale.items || [])) {
      esc.pair(`${item.qty}x ${item.name}`, fmtGhs(item.subtotal));
    }

    esc.divider('-');
    esc.boldOn();
    esc.pair('TOTAL:', fmtGhs(sale.total_amount));
    esc.boldOff();

    const chgVal = Number(sale.change_given ?? sale.change_due ?? 0);
    if (sale.payment_method === 'MoMo' && sale.momo_phone) {
      esc.pair('MoMo #:', sale.momo_phone);
    } else if (sale.payment_method === 'Cash' && Number(sale.cash_tendered || 0) > 0) {
      esc.pair('Paid:', fmtGhs(sale.cash_tendered));
      esc.pair('Change:', fmtGhs(chgVal));
    } else if (sale.payment_method === 'Credit' && sale.customer) {
      esc.divider('-');
      esc.pair('Customer:', sale.customer.name || '');
      esc.pair('Paid Now:', fmtGhs(sale.initial_deposit || 0));
      esc.pair('Balance Owed:', fmtGhs(sale.balance_owed ?? sale.remainder_owed ?? 0));
    }

    esc.divider('-');
    esc.alignCenter();
    esc.line(settings.customFooter);
    esc.feed(4);
    esc.cut();

    return esc.toUint8Array();
  }

  function encodeDailyCloseEscPos(closedRecord, store) {
    const settings = getSettings();
    const esc = createEscPosBuffer(settings.paperWidth);
    const s = store || {};

    esc.init();
    esc.alignCenter();
    esc.boldOn();
    esc.line('DAILY CLOSE RECEIPT');
    esc.line((closedRecord.store_name || s.store_name || 'HOLY STAR POS').toUpperCase());
    esc.boldOff();
    esc.line(`Date: ${closedRecord.date_str}`);
    esc.divider('-');

    esc.alignLeft();
    esc.pair('Sales Count:', String(closedRecord.sales_count || 0));
    esc.pair('Revenue:', fmtGhs(closedRecord.revenue));
    esc.pair('Gross Profit:', fmtGhs(closedRecord.profit));
    esc.divider('-');
    esc.pair('Cash Collected:', fmtGhs(closedRecord.cash_collected));
    esc.pair('MoMo Recorded:', fmtGhs(closedRecord.momo));
    esc.pair('Credit Given:', fmtGhs(closedRecord.credit_given));

    const debtorsPaid = Array.isArray(closedRecord.debtors_paid) ? closedRecord.debtors_paid : [];
    esc.divider('-');
    if (debtorsPaid.length > 0) {
      esc.boldOn();
      esc.line(`DEBTORS PAID (${debtorsPaid.length}):`);
      esc.boldOff();
      for (const d of debtorsPaid) {
        esc.pair(`${d.name} (${d.payment_method})`, fmtGhs(d.amount_paid));
      }
    } else {
      esc.line('Debtors Paid: None');
    }

    esc.divider('-');
    esc.alignCenter();
    esc.line(`Seal: ${closedRecord.audit_seal || 'AUTO'}`);
    esc.feed(4);
    esc.cut();

    return esc.toUint8Array();
  }

  function encodeTestReceiptEscPos(store) {
    const settings = getSettings();
    const esc = createEscPosBuffer(settings.paperWidth);
    const s = store || {};

    esc.init();
    esc.alignCenter();
    esc.boldOn();
    esc.doubleSizeOn();
    esc.line((s.store_name || 'HOLY STAR POS').toUpperCase());
    esc.doubleSizeOff();
    esc.boldOff();
    esc.line('PRINTER TEST RECEIPT');
    esc.divider('-');
    esc.alignLeft();
    esc.pair('Paper Width:', settings.paperWidth);
    esc.pair('Status:', 'Connected & Ready');
    esc.pair('Date:', formatPrintDate(Date.now()));
    esc.divider('-');
    esc.alignCenter();
    esc.line(settings.customFooter);
    esc.feed(4);
    esc.cut();

    return esc.toUint8Array();
  }

  async function writeEscPosBytes(dataBytes) {
    if (!isBluetoothConnected()) {
      throw new Error('Bluetooth printer is not connected.');
    }
    const char = btState.characteristic;
    const chunkSize = 20;
    for (let i = 0; i < dataBytes.length; i += chunkSize) {
      const chunk = dataBytes.slice(i, i + chunkSize);
      if (typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 18));
    }
  }

  function triggerBrowserThermalPrint(targetType) {
    const settings = getSettings();
    document.body.dataset.printWidth = settings.paperWidth;
    document.body.dataset.printTarget = targetType || 'receipt';
    window.print();
  }

  async function printCustomerReceipt(sale, store) {
    if (isBluetoothConnected()) {
      const bytes = encodeCustomerReceiptEscPos(sale, store);
      await writeEscPosBytes(bytes);
      return { mode: 'bluetooth' };
    }
    triggerBrowserThermalPrint('receipt');
    return { mode: 'browser' };
  }

  async function printDailyCloseReceipt(closedRecord, store) {
    if (isBluetoothConnected()) {
      const bytes = encodeDailyCloseEscPos(closedRecord, store);
      await writeEscPosBytes(bytes);
      return { mode: 'bluetooth' };
    }
    triggerBrowserThermalPrint('close-day');
    return { mode: 'browser' };
  }

  async function printTestReceipt(store) {
    if (isBluetoothConnected()) {
      const bytes = encodeTestReceiptEscPos(store);
      await writeEscPosBytes(bytes);
      return { mode: 'bluetooth' };
    }
    triggerBrowserThermalPrint('receipt');
    return { mode: 'browser' };
  }

  global.HolyStarPrinter = {
    getSettings,
    saveSettings,
    isBluetoothSupported,
    isBluetoothConnected,
    getConnectedDeviceName,
    connectBluetoothPrinter,
    disconnectBluetoothPrinter,
    printCustomerReceipt,
    printDailyCloseReceipt,
    printTestReceipt
  };
})(window);
