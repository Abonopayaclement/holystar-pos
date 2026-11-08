/**
 * Holy Star POS - Cloud Sync Serverless API (/api/sync.js v3.1)
 * Persists store profiles, products, sales, debtors, closed_days, license, and telemetry
 * across PC and mobile phones using a hybrid Cloud Channel + local file cache (`api/data.json` / `/tmp`).
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

function readLocalCache() {
  const merged = { stores: {}, bundles: {} };
  for (const filePath of [LOCAL_DATA_FILE, TMP_DATA_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.assign(merged.stores, parsed.stores || {});
          Object.assign(merged.bundles, parsed.bundles || {});
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
  const existingSummary = dbObj.stores[sid];
  const existingTs = existingSummary ? Number(existingSummary.last_synced_ts || existingSummary.updated_at || 0) : 0;

  if (msg.telemetry && (!existingSummary || incomingTs >= existingTs)) {
    dbObj.stores[sid] = {
      ...(existingSummary || {}),
      ...msg.telemetry,
      last_synced_ts: incomingTs || Date.now(),
      last_synced_at: new Date(incomingTs || Date.now()).toISOString()
    };
  }

  const bundleCandidate = msg.bundle || (msg.store ? {
    store_id: sid,
    store: msg.store,
    products: msg.products || [],
    sales: msg.sales || [],
    debtors: msg.debtors || [],
    closed_days: msg.closed_days || [],
    license: msg.license || []
  } : null);

  if (bundleCandidate && bundleCandidate.store) {
    const existingBundle = dbObj.bundles[sid];
    const existingBundleTs = existingBundle ? Number(existingBundle.updated_at || 0) : 0;
    if (!existingBundle || incomingTs >= existingBundleTs) {
      dbObj.bundles[sid] = {
        ...bundleCandidate,
        updated_at: incomingTs || Date.now()
      };
    }
  }
}

async function pullCloudChannelState(dbObj) {
  // 1. Pull V1 telemetry channel for stores registered in v2.x
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

    // Fetch up to the latest 3 attachments if any store sent a >4KB payload
    for (const att of attachmentUrls.slice(-3)) {
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
  try {
    await fetch(`https://ntfy.sh/${CLOUD_TOPIC_SYNC}`, {
      method: 'POST',
      headers: {
        'Title': `HolyStar Sync ${record.store_id}`,
        'Priority': 'default'
      },
      body: JSON.stringify(record)
    });
  } catch (e) {}
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
      const rawProducts = Array.isArray(body.products) ? body.products : (body.bundle?.products || []);
      const compactProducts = compactProductsForCloud(rawProducts);

      const telemetry = body.telemetry || {
        store_id: storeId,
        store_name: store ? store.store_name : `Store ${storeId}`,
        store_category: store ? store.store_category : 'Retail',
        owner_name: store ? store.owner_name : '',
        owner_phone: store ? store.owner_phone : '',
        location: store ? (store.shop_location || store.location || '') : '',
        total_products_count: compactProducts.length,
        total_stock_units: compactProducts.reduce((s, p) => s + Number(p.stock_qty || 0), 0),
        total_sales_count: Array.isArray(body.sales) ? body.sales.length : 0,
        total_revenue_ghs: Array.isArray(body.sales)
          ? Number(body.sales.reduce((s, x) => s + Number(x.total_amount || 0), 0).toFixed(2))
          : 0,
        license_plan: store ? store.license_plan : '7-Day Trial',
        license_expiry_ts: store ? Number(store.license_expiry || now) : now,
        license_expiry_date: new Date(store ? Number(store.license_expiry || now) : now).toISOString(),
        last_synced_ts: now,
        last_synced_at: new Date(now).toISOString()
      };

      telemetry.last_synced_ts = now;
      telemetry.last_synced_at = new Date(now).toISOString();
      dbObj.stores[storeId] = {
        ...(dbObj.stores[storeId] || {}),
        ...telemetry
      };

      let bundleToSave = null;
      if (store) {
        bundleToSave = {
          store_id: storeId,
          store,
          products: compactProducts.length > 0 ? compactProducts : (dbObj.bundles[storeId]?.products || []),
          sales: Array.isArray(body.sales) ? body.sales : (dbObj.bundles[storeId]?.sales || []),
          debtors: Array.isArray(body.debtors) ? body.debtors : (dbObj.bundles[storeId]?.debtors || []),
          closed_days: Array.isArray(body.closed_days) ? body.closed_days : (dbObj.bundles[storeId]?.closed_days || []),
          license: Array.isArray(body.license) ? body.license : (dbObj.bundles[storeId]?.license || []),
          updated_at: now
        };
        dbObj.bundles[storeId] = bundleToSave;
      }

      writeLocalCache(dbObj);

      await pushToCloudChannel({
        _type: 'HOLYSTAR_CLOUD_SYNC_V3',
        store_id: storeId,
        updated_at: now,
        telemetry: dbObj.stores[storeId],
        bundle: bundleToSave
      });

      return res.status(200).json({
        ok: true,
        store_id: storeId,
        synced_at: new Date(now).toISOString(),
        telemetry: dbObj.stores[storeId]
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Sync error' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
