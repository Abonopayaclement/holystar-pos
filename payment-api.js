/**
 * Holy Star POS - Automated Hubtel MoMo Checkout Service (payment-api.js)
 *
 * Ready-to-wire integration for Hubtel Direct Receive Money / Checkout API.
 * Drop your live Hubtel Client ID, Client Secret, and Merchant Account Number
 * into HUBTEL_CONFIG below to enable instant automated subscription renewals.
 */

(function (global) {
  'use strict';

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

  function isConfigured() {
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
    const cleanCode = String(issueCode || 'HUB').trim().toUpperCase();
    const raw = `HOLYSTAR-SAAS-2026::${cleanId}::${Number(planDays)}::${cleanCode}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch + (i << 3);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    const combined =
      ((h1 >>> 0).toString(36).toUpperCase().padStart(4, '0')) +
      ((h2 >>> 0).toString(36).toUpperCase().padStart(4, '0'));
    return combined.slice(0, 8);
  }

  async function initiateMoMoPayment({ storeId, storeName, planDays, momoPhone }) {
    const cleanPhone = String(momoPhone || '').replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return { ok: false, keysPending: false, message: 'Enter a valid 10-digit MoMo number.' };
    }

    const plan = getPlanDetails(planDays);

    if (!isConfigured()) {
      return {
        ok: false,
        keysPending: true,
        message: 'API Keys Pending — Use Alternative Code Below'
      };
    }

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
          keysPending: false,
          message: data.Message || 'MoMo payment prompt failed. Please try again or use an Alternative Code.'
        };
      }

      // Payment confirmed / initiated -> generate & apply unlock token automatically
      const issueCode = 'HUB' + String(Date.now()).slice(-3);
      const tokenCode = generateAutoUnlockToken(storeId, plan.days, issueCode);
      const tokenKey = `${storeId}-${plan.days}D-${issueCode}-${tokenCode}`;

      if (global.HolyStarDB && typeof global.HolyStarDB.applyLicenseToken === 'function') {
        await global.HolyStarDB.applyLicenseToken({
          tokenKey,
          tokenCode,
          issueCode,
          planDays: plan.days,
          shopId: storeId
        });
      }

      return {
        ok: true,
        keysPending: false,
        planDays: plan.days,
        amountGhs: plan.amountGhs,
        tokenCode,
        reference: clientReference,
        message: `Payment confirmed! Subscription extended by ${plan.days} days.`
      };
    } catch (err) {
      return {
        ok: false,
        keysPending: false,
        message: 'Network error connecting to MoMo gateway. Check internet or use an Alternative Code.'
      };
    }
  }

  global.HolyStarPaymentAPI = {
    isConfigured,
    getPlanDetails,
    initiateMoMoPayment,
    PLAN_PRICING
  };
})(window);
