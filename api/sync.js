/**
 * Holy Star POS - Cloud Sync Serverless API (/api/sync.js)
 * Persists store profiles, products, sales, debtors, closed_days, license, and telemetry
 * across PC and mobile phones using a hybrid Cloud Channel + local file cache (`api/data.json` / `/tmp`).
 */

const fs = require('fs');
const path = require('path');

const CLOUD_TOPIC_SYNC = 'holystar_pos_cloud_v3_sync_2026';
const LOCAL_DATA_FILE = path.join(process.cwd(), 'api', 'data.json');
const TMP_DATA_FILE = '/tmp/holystar_cloud_db_v3.json';

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').replace(/^\+233/, '0');
}

function readLocalCache() {
  for (const filePath of [LOCAL_DATA_FILE, TMP_DATA_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            stores: parsed.stores || {},
            bundles: parsed.bundles || {}
          };
        }
      }
    } catch (e) {
      // Ignore read error
    }
  }
  return { stores: {}, bundles: {} };
}

function writeLocalCache(dbObj) {
  const payload = JSON.stringify(dbObj, null, 2);
  try {
    fs.writeFileSync(TMP_DATA_FILE, payload, 'utf8');
  } catch (e) {
    // Ignore tmp write error on Windows if /tmp doesn't exist
  }
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_DATA_FILE, payload, 'utf8');
  } catch (e) {
    // Ignore read-only filesystem error on Vercel production
  }
}

async function pullCloudChannelState(dbObj) {
  try {
    const res = await fetch(`https://ntfy.sh/${CLOUD_TOPIC_SYNC}/json?poll=1&since=all`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) return dbObj;
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const env = JSON.parse(line);
        if (env && env.event === 'message' && env.message) {
          const msg = JSON.parse(env.message);
          if (msg && msg.store_id) {
            const sid = msg.store_id;
            const incomingTs = Number(msg.updated_at || msg.sent_at || 0);
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

            if (msg.bundle && msg.bundle.store) {
              const existingBundle = dbObj.bundles[sid];
              const existingBundleTs = existingBundle ? Number(existingBundle.updated_at || 0) : 0;
              if (!existingBundle || incomingTs >= existingBundleTs) {
                dbObj.bundles[sid] = {
                  ...msg.bundle,
                  updated_at: incomingTs || Date.now()
                };
              }
            }
          }
        }
      } catch (lineErr) {
        // Ignore malformed message
      }
    }
  } catch (err) {
    // Ignore network error
  }
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
  } catch (e) {
    // Ignore push error
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
    const { all, store_id, phone } = req.query || {};

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

    // Default or ?all=1: Return all registered stores for Super-Admin & cross-device directory
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
      const telemetry = body.telemetry || {
        store_id: storeId,
        store_name: store ? store.store_name : `Store ${storeId}`,
        store_category: store ? store.store_category : 'Retail',
        owner_name: store ? store.owner_name : '',
        owner_phone: store ? store.owner_phone : '',
        location: store ? (store.shop_location || store.location || '') : '',
        total_products_count: Array.isArray(body.products) ? body.products.length : 0,
        total_stock_units: Array.isArray(body.products)
          ? body.products.reduce((s, p) => s + Number(p.stock_qty || 0), 0)
          : 0,
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
          products: Array.isArray(body.products) ? body.products : (dbObj.bundles[storeId]?.products || []),
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
