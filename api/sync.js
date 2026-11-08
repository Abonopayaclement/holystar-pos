/**
 * Holy Star POS - Cloud Sync Serverless API (/api/sync.js v3.2)
 * Non-destructive multi-device merge sync across PC and mobile phones.
 * Keeps cloud messages < 4KB so `ntfy.sh` always stores inline JSON without attachment issues.
 */

const fs = require('fs');
const path = require('path');

const CLOUD_TOPIC_SYNC = 'holystar_pos_cloud_v3_sync_2026';
const CLOUD_TOPIC_V1 = 'holystar_pos_telemetry_sync_2026_v1';
const LOCAL_DATA_FILE = path.join(__dirname, 'data.json');
const TMP_DATA_FILE = '/tmp/holystar_cloud_db_v3.json';

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').replace(/^\+233/, '0');
}

function compactProductsForCloud(products) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => {
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
}

function compactSalesForCloud(sales) {
  if (!Array.isArray(sales)) return [];
  return sales.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const copy = { ...s };
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((it) => ({
        id: it.id,
        name: it.name,
        qty: it.qty,
        cost_price: it.cost_price,
        selling_price: it.selling_price,
        subtotal: it.subtotal,
        profit: it.profit
      }));
    }
    return copy;
  });
}

function mergeById(existingArr = [], incomingArr = [], idField = 'id', deletedIds = []) {
  const deletedSet = new Set(Array.isArray(deletedIds) ? deletedIds : []);
  const map = new Map();
  for (const item of existingArr) {
    if (item && item[idField] && !deletedSet.has(item[idField])) {
      map.set(item[idField], item);
    }
  }
  for (const item of incomingArr) {
    if (item && item[idField] && !deletedSet.has(item[idField])) {
      const prev = map.get(item[idField]);
      if (!prev) {
        map.set(item[idField], item);
      } else {
        const prevTs = Number(prev.updated_at || prev.timestamp || prev.closed_at || prev.applied_at || prev.created_at || 0);
        const nextTs = Number(item.updated_at || item.timestamp || item.closed_at || item.applied_at || item.created_at || 0);
        if (nextTs >= prevTs) {
          map.set(item[idField], { ...prev, ...item });
        }
      }
    }
  }
  return Array.from(map.values());
}

function mergeStoreBundles(existingBundle, incomingBundle) {
  if (!existingBundle) return incomingBundle;
  if (!incomingBundle) return existingBundle;

  const existingTs = Number(existingBundle.updated_at || 0);
  const incomingTs = Number(incomingBundle.updated_at || 0);

  const mergedStore = incomingTs >= existingTs
    ? { ...(existingBundle.store || {}), ...(incomingBundle.store || {}) }
    : { ...(incomingBundle.store || {}), ...(existingBundle.store || {}) };

  const deletedIds = Array.from(new Set([
    ...(existingBundle.store?.deleted_product_ids || []),
    ...(incomingBundle.store?.deleted_product_ids || [])
  ]));
  if (deletedIds.length > 0) {
    mergedStore.deleted_product_ids = deletedIds;
  }

  const products = compactProductsForCloud(
    mergeById(existingBundle.products, incomingBundle.products, 'id', deletedIds)
  );
  const sales = compactSalesForCloud(
    mergeById(existingBundle.sales, incomingBundle.sales, 'id')
  );
  const debtors = mergeById(existingBundle.debtors, incomingBundle.debtors, 'id');
  const closed_days = mergeById(existingBundle.closed_days, incomingBundle.closed_days, 'id');
  const license = mergeById(existingBundle.license, incomingBundle.license, 'token_id');

  return {
    store_id: mergedStore.store_id || existingBundle.store_id || incomingBundle.store_id,
    store: mergedStore,
    products,
    sales,
    debtors,
    closed_days,
    license,
    updated_at: Math.max(existingTs, incomingTs, Date.now())
  };
}

function readLocalCache() {
  const merged = { stores: {}, bundles: {} };
  for (const filePath of [LOCAL_DATA_FILE, TMP_DATA_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [sid, s] of Object.entries(parsed.stores || {})) {
            merged.stores[sid] = { ...(merged.stores[sid] || {}), ...s };
          }
          for (const [sid, b] of Object.entries(parsed.bundles || {})) {
            merged.bundles[sid] = mergeStoreBundles(merged.bundles[sid], b);
          }
        }
      }
    } catch (e) {}
  }
  return merged;
}

function writeLocalCache(dbObj) {
  const payload = JSON.stringify(dbObj, null, 2);
  try {
    fs.writeFileSync(TMP_DATA_FILE, payload, 'utf8');
  } catch (e) {}
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_DATA_FILE, payload, 'utf8');
  } catch (e) {}
}

function ingestSyncRecord(dbObj, msg, fallbackTimeSec) {
  if (!msg || typeof msg !== 'object') return;
  const sid = msg.store_id || msg.telemetry?.store_id || msg.bundle?.store?.store_id || msg.store?.store_id;
  if (!sid) return;

  const incomingTs = Number(msg.updated_at || msg.sent_at || (fallbackTimeSec ? fallbackTimeSec * 1000 : Date.now()));

  const bundleCandidate = msg.bundle || (msg.store ? {
    store_id: sid,
    store: msg.store,
    products: msg.products || [],
    sales: msg.sales || [],
    debtors: msg.debtors || [],
    closed_days: msg.closed_days || [],
    license: msg.license || [],
    updated_at: incomingTs
  } : null);

  if (bundleCandidate && bundleCandidate.store) {
    dbObj.bundles[sid] = mergeStoreBundles(dbObj.bundles[sid], {
      ...bundleCandidate,
      updated_at: incomingTs
    });
  }

  const mergedBundle = dbObj.bundles[sid];
  const existingSummary = dbObj.stores[sid] || {};
  const incomingTelemetry = msg.telemetry || {};

  const resolvedProductsCount = mergedBundle
    ? mergedBundle.products.length
    : Math.max(Number(existingSummary.total_products_count || 0), Number(incomingTelemetry.total_products_count || 0));

  const resolvedStockUnits = mergedBundle
    ? mergedBundle.products.reduce((s, p) => s + Number(p.stock_qty || 0), 0)
    : Math.max(Number(existingSummary.total_stock_units || 0), Number(incomingTelemetry.total_stock_units || 0));

  const resolvedSalesCount = mergedBundle
    ? mergedBundle.sales.length
    : Math.max(Number(existingSummary.total_sales_count || 0), Number(incomingTelemetry.total_sales_count || 0));

  const resolvedRevenue = mergedBundle
    ? Number(mergedBundle.sales.reduce((s, x) => s + Number(x.total_amount || 0), 0).toFixed(2))
    : Math.max(Number(existingSummary.total_revenue_ghs || 0), Number(incomingTelemetry.total_revenue_ghs || 0));

  dbObj.stores[sid] = {
    ...existingSummary,
    ...incomingTelemetry,
    store_id: sid,
    total_products_count: resolvedProductsCount,
    total_stock_units: resolvedStockUnits,
    total_sales_count: resolvedSalesCount,
    total_revenue_ghs: resolvedRevenue,
    last_synced_ts: Math.max(Number(existingSummary.last_synced_ts || 0), incomingTs),
    last_synced_at: new Date(Math.max(Number(existingSummary.last_synced_ts || 0), incomingTs)).toISOString()
  };
}

async function pullCloudChannelState(dbObj) {
  // 1. Pull V1 telemetry channel
  try {
    const resV1 = await fetch(`https://ntfy.sh/${CLOUD_TOPIC_V1}/json?poll=1&since=all`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (resV1.ok) {
      const textV1 = await resV1.text();
      for (const line of textV1.split('\n').filter((l) => l.trim().length > 0)) {
        try {
          const env = JSON.parse(line);
          if (env && env.event === 'message' && env.message) {
            const msg = JSON.parse(env.message);
            ingestSyncRecord(dbObj, msg, env.time);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 2. Pull V3 sync channel (inline JSON + attachment fallback)
  try {
    const res = await fetch(`https://ntfy.sh/${CLOUD_TOPIC_SYNC}/json?poll=1&since=all`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) return dbObj;
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const attachmentUrls = [];

    for (const line of lines) {
      try {
        const env = JSON.parse(line);
        if (env && env.event === 'message') {
          if (env.attachment && env.attachment.url) {
            attachmentUrls.push({ url: env.attachment.url, time: env.time });
          } else if (env.message && env.message.startsWith('{')) {
            const msg = JSON.parse(env.message);
            ingestSyncRecord(dbObj, msg, env.time);
          }
        }
      } catch (lineErr) {}
    }

    for (const att of attachmentUrls.slice(-2)) {
      try {
        const attRes = await fetch(att.url);
        if (attRes.ok) {
          const attJson = await attRes.json();
          ingestSyncRecord(dbObj, attJson, att.time);
        }
      } catch (e) {}
    }
  } catch (err) {}
  return dbObj;
}

async function pushToCloudChannel(record) {
  if (!record || !record.store_id) return;
  const sid = record.store_id;
  const now = record.updated_at || Date.now();
  const b = record.bundle || {};
  const store = b.store || record.store;
  const products = Array.isArray(b.products) ? b.products : [];
  const sales = Array.isArray(b.sales) ? b.sales : [];
  const debtors = Array.isArray(b.debtors) ? b.debtors : [];
  const closed_days = Array.isArray(b.closed_days) ? b.closed_days : [];
  const license = Array.isArray(b.license) ? b.license : [];

  const chunks = [];

  // Chunk 1+: Products in batches of 8 (always < 3.2KB inline JSON in ntfy.sh)
  if (products.length === 0) {
    chunks.push({
      _type: 'HOLYSTAR_CLOUD_SYNC_V3',
      store_id: sid,
      updated_at: now,
      telemetry: record.telemetry,
      bundle: { store_id: sid, store, products: [], debtors, closed_days, license }
    });
  } else {
    for (let i = 0; i < products.length; i += 8) {
      chunks.push({
        _type: 'HOLYSTAR_CLOUD_SYNC_V3',
        store_id: sid,
        updated_at: now,
        telemetry: i === 0 ? record.telemetry : undefined,
        bundle: {
          store_id: sid,
          store,
          products: products.slice(i, i + 8),
          debtors: i === 0 ? debtors : [],
          closed_days: i === 0 ? closed_days : [],
          license: i === 0 ? license : []
        }
      });
    }
  }

  // Sales in batches of 2 (always < 3.2KB inline JSON in ntfy.sh)
  for (let i = 0; i < sales.length; i += 2) {
    chunks.push({
      _type: 'HOLYSTAR_CLOUD_SYNC_V3',
      store_id: sid,
      updated_at: now,
      bundle: {
        store_id: sid,
        store,
        sales: sales.slice(i, i + 2)
      }
    });
  }

  for (const chunk of chunks) {
    try {
      await fetch(`https://ntfy.sh/${CLOUD_TOPIC_SYNC}`, {
        method: 'POST',
        headers: {
          'Title': `HolyStar Sync ${sid}`,
          'Priority': 'default'
        },
        body: JSON.stringify(chunk)
      });
    } catch (e) {}
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const dbObj = readLocalCache();
  await pullCloudChannelState(dbObj);

  if (req.method === 'GET') {
    const { store_id, phone } = req.query || {};

    if (store_id) {
      const cleanId = String(store_id).trim().toUpperCase();
      const bundle = dbObj.bundles[cleanId] || null;
      const summary = dbObj.stores[cleanId] || null;
      return res.status(200).json({ ok: true, store_id: cleanId, summary, bundle });
    }

    if (phone) {
      const targetPhone = normalizePhone(phone);
      const matchedBundle = Object.values(dbObj.bundles).find(
        (b) => b && b.store && normalizePhone(b.store.owner_phone) === targetPhone
      );
      return res.status(200).json({
        ok: Boolean(matchedBundle),
        bundle: matchedBundle || null
      });
    }

    writeLocalCache(dbObj);
    return res.status(200).json({
      ok: true,
      stores: Object.values(dbObj.stores),
      bundles_count: Object.keys(dbObj.bundles).length
    });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const store = body.store || (body.bundle && body.bundle.store) || null;
      const storeId = String(body.store_id || (store && store.store_id) || (body.telemetry && body.telemetry.store_id) || '').trim().toUpperCase();

      if (!storeId) {
        return res.status(400).json({ ok: false, error: 'Missing store_id in sync payload.' });
      }

      const now = Date.now();
      ingestSyncRecord(dbObj, {
        store_id: storeId,
        updated_at: now,
        telemetry: body.telemetry,
        bundle: {
          store_id: storeId,
          store: store || dbObj.bundles[storeId]?.store,
          products: Array.isArray(body.products) ? body.products : (body.bundle?.products || []),
          sales: Array.isArray(body.sales) ? body.sales : (body.bundle?.sales || []),
          debtors: Array.isArray(body.debtors) ? body.debtors : (body.bundle?.debtors || []),
          closed_days: Array.isArray(body.closed_days) ? body.closed_days : (body.bundle?.closed_days || []),
          license: Array.isArray(body.license) ? body.license : (body.bundle?.license || []),
          updated_at: now
        }
      });

      writeLocalCache(dbObj);

      const mergedBundle = dbObj.bundles[storeId];
      const mergedTelemetry = dbObj.stores[storeId];

      await pushToCloudChannel({
        _type: 'HOLYSTAR_CLOUD_SYNC_V3',
        store_id: storeId,
        updated_at: now,
        telemetry: mergedTelemetry,
        bundle: mergedBundle
      });

      return res.status(200).json({
        ok: true,
        store_id: storeId,
        synced_at: new Date(now).toISOString(),
        telemetry: mergedTelemetry,
        bundle: mergedBundle
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Sync error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
