/**
 * Holy Star POS - Cross-Device Cloud Authentication API (/api/auth.js)
 * Allows logging into any registered store from ANY phone or PC anywhere,
 * returning the store account and full synced bundle (`products`, `sales`, `debtors`, `closed_days`, `license`).
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
  } catch (e) {}
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_DATA_FILE, payload, 'utf8');
  } catch (e) {}
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
            if (msg.telemetry) {
              const existingSummary = dbObj.stores[sid];
              const existingTs = existingSummary ? Number(existingSummary.last_synced_ts || 0) : 0;
              if (!existingSummary || incomingTs >= existingTs) {
                dbObj.stores[sid] = { ...(existingSummary || {}), ...msg.telemetry };
              }
            }
            if (msg.bundle && msg.bundle.store) {
              const existingBundle = dbObj.bundles[sid];
              const existingBundleTs = existingBundle ? Number(existingBundle.updated_at || 0) : 0;
              if (!existingBundle || incomingTs >= existingBundleTs) {
                dbObj.bundles[sid] = { ...msg.bundle, updated_at: incomingTs || Date.now() };
              }
            }
          }
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

      const bundlesList = Object.values(dbObj.bundles);
      const matchedBundle = bundlesList.find((b) => {
        if (!b || !b.store) return false;
        const s = b.store;
        return (
          normalizePhone(s.owner_phone) === cleanPhone ||
          String(s.store_id || '').toUpperCase() === cleanId.toUpperCase() ||
          String(s.store_name || '').toLowerCase() === cleanId.toLowerCase()
        );
      });

      if (!matchedBundle || !matchedBundle.store) {
        return res.status(404).json({
          ok: false,
          error: 'Store account not found in Cloud. Ensure the store was synced online at least once.'
        });
      }

      if (String(matchedBundle.store.owner_password || '') !== cleanPass) {
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
