/**
 * Holy Star POS - Cross-Device Cloud Authentication API (/api/auth.js v3.2)
 * Non-destructive multi-device merge authentication returning the complete merged
 * store bundle (`store`, `products`, `sales`, `debtors`, `closed_days`, `license`).
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
        if (nextTs > prevTs) {
          map.set(item[idField], { ...prev, ...item });
        } else if (nextTs === prevTs) {
          if (prev.stock_qty !== undefined && item.stock_qty !== undefined) {
            map.set(item[idField], { ...prev, ...item, stock_qty: Math.min(Number(prev.stock_qty), Number(item.stock_qty)) });
          } else {
            map.set(item[idField], { ...prev, ...item });
          }
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

  return {
    store_id: mergedStore.store_id || existingBundle.store_id || incomingBundle.store_id,
    store: mergedStore,
    products: compactProductsForCloud(mergeById(existingBundle.products, incomingBundle.products, 'id', deletedIds)),
    sales: mergeById(existingBundle.sales, incomingBundle.sales, 'id'),
    debtors: mergeById(existingBundle.debtors, incomingBundle.debtors, 'id'),
    closed_days: mergeById(existingBundle.closed_days, incomingBundle.closed_days, 'id'),
    license: mergeById(existingBundle.license, incomingBundle.license, 'token_id'),
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

  dbObj.stores[sid] = {
    ...existingSummary,
    ...incomingTelemetry,
    store_id: sid,
    total_products_count: mergedBundle
      ? mergedBundle.products.length
      : Math.max(Number(existingSummary.total_products_count || 0), Number(incomingTelemetry.total_products_count || 0)),
    total_stock_units: mergedBundle
      ? mergedBundle.products.reduce((s, p) => s + Number(p.stock_qty || 0), 0)
      : Math.max(Number(existingSummary.total_stock_units || 0), Number(incomingTelemetry.total_stock_units || 0)),
    total_sales_count: mergedBundle
      ? mergedBundle.sales.length
      : Math.max(Number(existingSummary.total_sales_count || 0), Number(incomingTelemetry.total_sales_count || 0)),
    total_revenue_ghs: mergedBundle
      ? Number(mergedBundle.sales.reduce((s, x) => s + Number(x.total_amount || 0), 0).toFixed(2))
      : Math.max(Number(existingSummary.total_revenue_ghs || 0), Number(incomingTelemetry.total_revenue_ghs || 0)),
    last_synced_ts: Math.max(Number(existingSummary.last_synced_ts || 0), incomingTs),
    last_synced_at: new Date(Math.max(Number(existingSummary.last_synced_ts || 0), incomingTs)).toISOString()
  };
}

async function pullCloudChannelState(dbObj) {
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
      } catch (e) {}
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
  } catch (e) {}
  return dbObj;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || 'login').toLowerCase();

    const dbObj = readLocalCache();
    await pullCloudChannelState(dbObj);

    if (action === 'login') {
      const cleanId = String(body.identifier || '').trim();
      const cleanPhone = normalizePhone(cleanId);
      const cleanPass = String(body.password || '').trim();

      if (!cleanId || !cleanPass) {
        return res.status(400).json({ ok: false, error: 'Enter Phone/Store ID and Password.' });
      }

      const matchStoreRecord = (s) =>
        s &&
        (normalizePhone(s.owner_phone) === cleanPhone ||
          String(s.store_id || '').toUpperCase() === cleanId.toUpperCase() ||
          String(s.store_name || '').toLowerCase() === cleanId.toLowerCase());

      let matchedBundle = Object.values(dbObj.bundles).find((b) => b && matchStoreRecord(b.store));

      if (!matchedBundle) {
        const matchedSummary = Object.values(dbObj.stores).find((s) => matchStoreRecord(s));
        if (matchedSummary) {
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
          matchedBundle = {
            store_id: reconstructedStore.store_id,
            store: reconstructedStore,
            products: [],
            sales: [],
            debtors: [],
            closed_days: [],
            license: [],
            updated_at: now
          };
          dbObj.bundles[reconstructedStore.store_id] = matchedBundle;
        }
      }

      if (!matchedBundle || !matchedBundle.store) {
        return res.status(404).json({
          ok: false,
          error: 'Store account not found. Check your Phone Number / Store ID.'
        });
      }

      const storedPass = String(matchedBundle.store.owner_password || '');
      if (storedPass && storedPass !== cleanPass) {
        return res.status(401).json({ ok: false, error: 'Incorrect password.' });
      }

      writeLocalCache(dbObj);
      return res.status(200).json({
        ok: true,
        store: matchedBundle.store,
        bundle: matchedBundle
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown auth action' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Auth server error' });
  }
};
