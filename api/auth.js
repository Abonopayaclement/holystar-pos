/**
 * Holy Star POS - Cross-Device Cloud Authentication API (/api/auth.js v3.1)
 * Allows logging into any registered store from ANY phone or PC anywhere,
 * returning the store account and full synced bundle (`products`, `sales`, `debtors`, `closed_days`, `license`).
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
      } catch (e) {}
    }

    for (const att of attachmentUrls.slice(-3)) {
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

      // 1. Check full v3 bundles first
      let matchedBundle = Object.values(dbObj.bundles).find((b) => b && matchStoreRecord(b.store));

      // 2. Fallback: Check stores registry (e.g. stores created in v2.x before v3 bundle existed)
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
