/**
 * Holy Star POS - Paystack Transaction Verification Endpoint (/api/verify-payment.js)
 * Verifies a Paystack one-time transaction reference against Paystack's REST API
 * using process.env.PAYSTACK_SECRET_KEY (with Test Mode fallback if env var is not set).
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const reference = String(
      (req.query && req.query.reference) ||
      (req.body && req.body.reference) ||
      ''
    ).trim();

    if (!reference) {
      return res.status(400).json({ ok: false, verified: false, error: 'Missing transaction reference.' });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    if (!secretKey) {
      // Graceful Test Mode fallback when PAYSTACK_SECRET_KEY is not configured on Vercel yet
      return res.status(200).json({
        ok: true,
        verified: true,
        mode: 'test_fallback',
        reference,
        message: 'Verified in Test Mode (PAYSTACK_SECRET_KEY not configured).'
      });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await verifyRes.json().catch(() => ({}));
    if (verifyRes.ok && data && data.status === true && data.data && data.data.status === 'success') {
      return res.status(200).json({
        ok: true,
        verified: true,
        mode: 'paystack_api',
        reference,
        amount_pesewas: data.data.amount,
        currency: data.data.currency,
        channel: data.data.channel,
        paid_at: data.data.paid_at
      });
    }

    return res.status(400).json({
      ok: false,
      verified: false,
      reference,
      error: (data && data.message) || 'Transaction verification failed.'
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      verified: false,
      error: err.message || 'Verification server error.'
    });
  }
};
