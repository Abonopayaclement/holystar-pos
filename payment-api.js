/**
 * Holy Star POS - Automated Hubtel MoMo Checkout Service (payment-api.js)
 *
 * TEST_MODE = true enables instant 1-tap MoMo test renewals right now.
 * Flip TEST_MODE = false and drop in live Hubtel Client ID, Client Secret,
 * and Merchant Account Number in HUBTEL_CONFIG when ready for production billing.
 */

(function (global) {
  'use strict';

  const TEST_MODE = true;

  const HUBTEL_CONFIG = {
    clientId: '', // e.g. 'your_hubtel_client_id'
    clientSecret: '', // e.g. 'your_hubtel_client_secret'
    merchantAccountNumber: '', // e.g. '2012345'
    callbackUrl: 'https://holystar-pos.vercel.app/api/hubtel-callback',
    endpoint: 'https://rmp.hubtel.com/v1/merchantaccount/merchants'
  };

  const PLAN_PRICING = {
    7: { days: 7, amountGhs: 5, label: '7 Days (Weekly)' },
    14: { days: 14, amountGhs: 10, label: '14 Days (Bi-Weekly)' },
    30: { days: 30, amountGhs: 20, label: '30 Days (Monthly)' }
  };

  function isTestMode() {
    return TEST_MODE;
  }

  function isConfigured() {
    if (TEST_MODE) return true;
    return Boolean(
      HUBTEL_CONFIG.clientId &&
      HUBTEL_CONFIG.clientSecret &&
      HUBTEL_CONFIG.merchantAccountNumber
    );
  }

  function getPlanDetails(planDays) {
    const d = Number(planDays || 30);
    return PLAN_PRICING[d] || { days: d, amountGhs: d >= 30 ? 20 : d >= 14 ? 10 : 5, label: `${d} Days` };
  }

  function generateAutoUnlockToken(storeId, planDays, issueCode) {
    const cleanId = String(storeId || 'HS-0000').trim().toUpperCase();
    const cleanCode = String(issueCode || '001').trim().toUpperCase();
    const payload = `${cleanId}|${String(Number(planDays) || 30)}|${cleanCode}|HOLY_STAR_SECRET_2026`;
    if (global.HolyStarCrypto && typeof global.HolyStarCrypto.generateDeterministicToken === 'function') {
      return global.HolyStarCrypto.generateDeterministicToken(cleanId, planDays, cleanCode);
    }
    let h1 = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h1 ^= payload.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    return (h1 >>> 0).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  }

  function recordMoMoRenewalInSuperAdmin({ storeId, storeName, planDays, amountGhs, tokenCode, issueCode, momoPhone }) {
    const now = Date.now();
    const newExpiryTs = now + Number(planDays) * 24 * 60 * 60 * 1000;
    try {
      const logRaw = localStorage.getItem('holystar_superadmin_token_log_v1');
      const log = logRaw ? JSON.parse(logRaw) : [];
      if (Array.isArray(log)) {
        log.unshift({
          id: 'MOMO-' + now,
          store_id: storeId,
          store_name: storeName || `Store ${storeId}`,
          owner_phone: momoPhone || '',
          plan_days: Number(planDays),
          amount_ghs: Number(amountGhs),
          issue_code: issueCode,
          token: tokenCode,
          expected_expiry_ts: newExpiryTs,
          source: TEST_MODE ? 'MoMo Instant (Test)' : 'Hubtel MoMo',
          created_at: now
        });
        localStorage.setItem('holystar_superadmin_token_log_v1', JSON.stringify(log.slice(0, 200)));
      }
    } catch (e) {}

    // Announce issued token & payment to cloud stream for Super-Admin revenue tracking
    if (typeof navigator === 'undefined' || navigator.onLine) {
      fetch('https://ntfy.sh/holystar_pos_cloud_v3_sync_2026', {
        method: 'POST',
        headers: { 'Title': `MoMo Renewal ${storeId}` },
        body: JSON.stringify({
          _type: 'HOLYSTAR_ISSUED_TOKEN_V1',
          store_id: storeId,
          store_name: storeName || '',
          token: tokenCode,
          plan_days: Number(planDays),
          amount_ghs: Number(amountGhs),
          issue_code: issueCode,
          source: TEST_MODE ? 'momo_test' : 'hubtel_momo',
          created_at: now
        })
      }).catch(() => {});
    }
  }

  async function initiateMoMoPayment({ storeId, storeName, planDays, momoPhone }) {
    const cleanPhone = String(momoPhone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return { ok: false, message: 'Enter a valid 10-digit MoMo number.' };
    }

    const plan = getPlanDetails(planDays);
    const issueCode = 'M' + String(Date.now()).slice(-4);
    const tokenCode = generateAutoUnlockToken(storeId, plan.days, issueCode);
    const tokenKey = `${storeId}-${plan.days}D-${issueCode}-${tokenCode}`;

    // TEST MODE: Instant approval without Hubtel keys
    if (TEST_MODE) {
      if (global.HolyStarDB && typeof global.HolyStarDB.applyLicenseToken === 'function') {
        await global.HolyStarDB.applyLicenseToken({
          tokenKey,
          tokenCode,
          issueCode,
          planDays: plan.days,
          shopId: storeId
        });
      }
      recordMoMoRenewalInSuperAdmin({
        storeId,
        storeName,
        planDays: plan.days,
        amountGhs: plan.amountGhs,
        tokenCode,
        issueCode,
        momoPhone: cleanPhone
      });

      return {
        ok: true,
        testMode: true,
        planDays: plan.days,
        amountGhs: plan.amountGhs,
        tokenCode,
        message: `Subscription Activated for ${plan.days} Days!`
      };
    }

    // LIVE HUBTEL MODE
    const clientReference = `HS-${String(storeId || '0000').replace(/[^A-Z0-9]/gi, '')}-${Date.now()}`;
    const authHeader = 'Basic ' + btoa(`${HUBTEL_CONFIG.clientId}:${HUBTEL_CONFIG.clientSecret}`);
    const url = `${HUBTEL_CONFIG.endpoint}/${encodeURIComponent(HUBTEL_CONFIG.merchantAccountNumber)}/receive/mobilemoney`;

    const payload = {
      CustomerName: String(storeName || 'Holy Star Merchant'),
      CustomerMsisdn: '233' + cleanPhone.slice(1),
      CustomerEmail: 'billing@holystarpos.com',
      Channel: cleanPhone.startsWith('024') || cleanPhone.startsWith('054') || cleanPhone.startsWith('055') || cleanPhone.startsWith('059') || cleanPhone.startsWith('053')
        ? 'mtn-gh'
        : cleanPhone.startsWith('020') || cleanPhone.startsWith('050')
          ? 'vodafone-gh'
          : 'tigo-gh',
      Amount: plan.amountGhs,
      PrimaryCallbackUrl: HUBTEL_CONFIG.callbackUrl,
      Description: `Holy Star POS ${plan.label} (${storeId})`,
      ClientReference: clientReference
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || (data.ResponseCode && data.ResponseCode !== '0000' && data.ResponseCode !== '0001')) {
        return {
          ok: false,
          message: data.Message || 'MoMo payment prompt failed. Please try again or use an Alternative Code.'
        };
      }

      if (global.HolyStarDB && typeof global.HolyStarDB.applyLicenseToken === 'function') {
        await global.HolyStarDB.applyLicenseToken({
          tokenKey,
          tokenCode,
          issueCode,
          planDays: plan.days,
          shopId: storeId
        });
      }

      recordMoMoRenewalInSuperAdmin({
        storeId,
        storeName,
        planDays: plan.days,
        amountGhs: plan.amountGhs,
        tokenCode,
        issueCode,
        momoPhone: cleanPhone
      });

      return {
        ok: true,
        testMode: false,
        planDays: plan.days,
        amountGhs: plan.amountGhs,
        tokenCode,
        reference: clientReference,
        message: `Subscription Activated for ${plan.days} Days!`
      };
    } catch (err) {
      return {
        ok: false,
        message: 'Network error connecting to MoMo gateway. Check internet or use an Alternative Code.'
      };
    }
  }

  global.HolyStarPaymentAPI = {
    isTestMode,
    isConfigured,
    getPlanDetails,
    initiateMoMoPayment,
    PLAN_PRICING
  };
})(window);
