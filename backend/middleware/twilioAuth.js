//
// Verifies the X-Twilio-Signature header on every incoming webhook request
// so nobody can POST fake WhatsApp messages straight to our endpoint and
// have them processed as if they came from a real user via Twilio.
//
// Twilio computes the signature from: AUTH_TOKEN + the EXACT webhook URL
// Twilio called (scheme+host+path+query, no trailing slash weirdness) +
// the sorted POST body params. If the URL we reconstruct here doesn't
// match byte-for-byte what Twilio used, validation fails even for a
// legitimate request — this is the #1 cause of "valid request rejected"
// bugs, almost always because of a reverse proxy / tunnel rewriting the
// host or protocol. See PUBLIC_BASE_URL note below.

const twilio = require('twilio');

function twilioWebhookAuth(req, res, next) {
  // Allow disabling signature checks only for local dev when explicitly
  // opted in — never silently skip this in a deployed environment.
  if (process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === 'true') {
    console.warn('⚠️  TWILIO_SKIP_SIGNATURE_VALIDATION=true — webhook signature check bypassed. Do NOT use this in production.');
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('❌ TWILIO_AUTH_TOKEN is not set — refusing webhook request');
    return res.status(500).send('Server misconfigured');
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    console.warn('🚫 Webhook request missing X-Twilio-Signature header');
    return res.status(403).send('Forbidden');
  }

  // PUBLIC_BASE_URL must be the exact public origin Twilio is configured
  // to call, e.g. https://abc123.trycloudflare.com or your prod domain.
  // We build it from env rather than trusting req.protocol/req.host
  // because tunnels and load balancers commonly rewrite those.
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.error('❌ PUBLIC_BASE_URL is not set — cannot validate Twilio signature');
    return res.status(500).send('Server misconfigured');
  }

  const fullUrl = `${baseUrl.replace(/\/$/, '')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, signature, fullUrl, req.body);

  if (!isValid) {
    console.warn(`🚫 Invalid Twilio signature for ${fullUrl}`);
    return res.status(403).send('Forbidden');
  }

  next();
}

module.exports = { twilioWebhookAuth };
