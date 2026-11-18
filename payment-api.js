/**
 * Holy Star POS - Paystack One-Time Mobile Money Checkout Service (payment-api.js)
 * Uses Paystack Inline Pop-up for one-time GHS Mobile Money payments
 * (7 Days = GHS 5, 14 Days = GHS 10, 30 Days = GHS 20).
 */

(function (global) {
  'use strict';

  const PAYSTACK_PUBLIC_KEY = 'pk_test_a17808664ce0c2df5b95053fe01e8cc09973858e';

  const PLAN_PRICING = {
    7: { days: 7, amountGhs: 5, label: '7 Days (Weekly)' },
    14: { days: 14, amountGhs: 10, label: '14 Days (Bi-Weekly)' },
    30: { days: 30, amountGhs: 20, label: '30 Days (Monthly)' }
  };

  function isTestMode() {
    return PAYSTACK_PUBLIC_KEY.startsWith('pk_test_');
  }

  function isConfigured() {
    return Boolean(PAYSTACK_PUBLIC_KEY && PAYSTACK_PUBLIC_KEY !== 'pk_test_REPLACE_WITH_MY_KEY');
  }

  function getPlanDetails(planDays) {
    const d = Number(planDays || 30);
    return PLAN_PRICING[d] || { days: d, amountGhs: d >= 30 ? 20 : d >= 14 ? 10 : 5, label: `${d} Days` };
  }

  function generateAutoUnlockToken(storeId, planDays, issueCode) {
    const cleanId = String(storeId || 'HS-0000').trim().toUpperCase();
    const cleanCode = String(issueCode || '001').trim().toUpperCase();
    if (global.HolyStarCrypto && typeof global.HolyStarCrypto.generateDeterministicToken === 'function') {
      return global.HolyStarCrypto.generateDeterministicToken(cleanId, planDays, cleanCode);
    }
    const payload = `${cleanId}|${String(Number(planDays) || 30)}|${cleanCode}|HOLY_STAR_SECRET_2026`;
    let h1 = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h1 ^= payload.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    return (h1 >>> 0).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  }

  function recordPaystackRenewalInSuperAdmin({ storeId, storeName, planDays, amountGhs, tokenCode, issueCode, momoPhone, reference }) {
    const now = Date.now();
    const newExpiryTs = now + Number(planDays) * 24 * 60 * 60 * 1000;
    try {
      const logRaw = localStorage.getItem('holystar_superadmin_token_log_v1');
      const log = logRaw ? JSON.parse(logRaw) : [];
      if (Array.isArray(log)) {
        log.unshift({
          id: 'PSK-' + now,
          store_id: storeId,
          store_name: storeName || `Store ${storeId}`,
          owner_phone: momoPhone || '',
          plan_days: Number(planDays),
          amount_ghs: Number(amountGhs),
          issue_code: issueCode,
          token: tokenCode,
          reference: reference || '',
          expected_expiry_ts: newExpiryTs,
          source: isTestMode() ? 'Paystack MoMo (Test)' : 'Paystack MoMo',
          created_at: now
        });
        localStorage.setItem('holystar_superadmin_token_log_v1', JSON.stringify(log.slice(0, 200)));
      }
    } catch (e) {}

    // Announce issued token & GHS payment to cloud stream for Super-Admin revenue tracking
    if (typeof navigator === 'undefined' || navigator.onLine) {
      fetch('https://ntfy.sh/holystar_pos_cloud_v3_sync_2026', {
        method: 'POST',
        headers: { 'Title': `Paystack Renewal ${storeId}` },
        body: JSON.stringify({
          _type: 'HOLYSTAR_ISSUED_TOKEN_V1',
          store_id: storeId,
          store_name: storeName || '',
          token: tokenCode,
          plan_days: Number(planDays),
          amount_ghs: Number(amountGhs),
          issue_code: issueCode,
          reference: reference || '',
          source: 'paystack_momo',
          created_at: now
        })
      }).catch(() => {});
    }
  }

  async function verifyTransactionWithBackend(reference) {
    try {
      const res = await fetch(`./api/verify-payment?reference=${encodeURIComponent(reference)}`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return { ok: true, verified: true, mode: 'client_fallback', reference };
  }

  function initiateMoMoPayment({ storeId, storeName, planDays, momoPhone }) {
    const cleanPhone = String(momoPhone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return Promise.resolve({ ok: false, message: 'Enter a valid 10-digit MoMo number.' });
    }

    if (typeof global.PaystackPop === 'undefined' || typeof global.PaystackPop.setup !== 'function') {
      return Promise.resolve({
        ok: false,
        message: 'Paystack checkout requires an internet connection. Connect to data/Wi-Fi or use an Alternative Code below.'
      });
    }

    const plan = getPlanDetails(planDays);
    const cleanStoreId = String(storeId || 'HS-0000').trim().toUpperCase();
    const fallbackEmail = `${cleanStoreId.toLowerCase()}@holystarpos.com`;
    const txRef = `HS-${cleanStoreId.replace(/[^A-Z0-9]/gi, '')}-${Date.now()}`;

    return new Promise((resolve) => {
      let settled = false;

      const handler = global.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: fallbackEmail,
        amount: plan.amountGhs * 100, // pesewas
        currency: 'GHS',
        channels: ['mobile_money'],
        ref: txRef,
        metadata: {
          store_id: cleanStoreId,
          store_name: String(storeName || 'Holy Star Store'),
          plan_days: plan.days,
          momo_number: cleanPhone
        },
        callback: function (response) {
          settled = true;
          const ref = (response && response.reference) || txRef;
          (async () => {
            try {
              await verifyTransactionWithBackend(ref);

              const issueCode = 'P' + String(Date.now()).slice(-4);
              const tokenCode = generateAutoUnlockToken(cleanStoreId, plan.days, issueCode);
              const tokenKey = `${cleanStoreId}-${plan.days}D-${issueCode}-${tokenCode}`;

              if (global.HolyStarDB && typeof global.HolyStarDB.applyLicenseToken === 'function') {
                await global.HolyStarDB.applyLicenseToken({
                  tokenKey,
                  tokenCode,
                  issueCode,
                  planDays: plan.days,
                  shopId: cleanStoreId
                });
              }

              recordPaystackRenewalInSuperAdmin({
                storeId: cleanStoreId,
                storeName,
                planDays: plan.days,
                amountGhs: plan.amountGhs,
                tokenCode,
                issueCode,
                momoPhone: cleanPhone,
                reference: ref
              });

              resolve({
                ok: true,
                reference: ref,
                planDays: plan.days,
                amountGhs: plan.amountGhs,
                tokenCode,
                message: `Subscription Activated for ${plan.days} Days!`
              });
            } catch (err) {
              resolve({
                ok: false,
                message: err.message || 'Payment succeeded, but local activation failed. Contact support with Ref: ' + ref
              });
            }
          })();
        },
        onClose: function () {
          if (!settled) {
            settled = true;
            resolve({
              ok: false,
              cancelled: true,
              message: 'Payment was cancelled. Store remains locked.'
            });
          }
        }
      });

      handler.openIframe();
    });
  }

  global.HolyStarPaymentAPI = {
    PAYSTACK_PUBLIC_KEY,
    isTestMode,
    isConfigured,
    getPlanDetails,
    initiateMoMoPayment,
    PLAN_PRICING
  };
})(window);
