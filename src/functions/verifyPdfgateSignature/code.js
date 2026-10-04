/**
 * Verify a PDFGate webhook signature (HMAC-SHA256).
 *
 * PDFGate signs `${timestamp}.${JSON.stringify(payload)}` with each webhook
 * secret and sends the result in the `x-pdfgate-signature` header, formatted as:
 *   t=<unixSeconds>,v1=<hexSignature>[,v1=<hexSignature>...]
 * The request body is the same `JSON.stringify(payload)` that was signed.
 *
 * @param {string} signatureHeader - the raw `x-pdfgate-signature` header value
 * @param {string|object} payload  - the webhook body (raw string, or parsed object)
 * @param {string} secret          - the webhook secret saved when the hook was attached
 * @returns {boolean} true only if a valid, unexpired signature is present
 */
function verifyPdfgateSignature(signatureHeader, payload, secret) {
    if (!signatureHeader || !secret) return false;

    // Reproduce the exact bytes PDFGate signed. When Make hands us the parsed
    // object, JSON.stringify mirrors the sender's own JSON.stringify(payload).
    var raw = (typeof payload === 'string') ? payload : JSON.stringify(payload);

    var timestamp = null;
    var signatures = [];
    String(signatureHeader).split(',').forEach(function (part) {
        var idx = part.indexOf('=');
        if (idx === -1) return;
        var key = part.slice(0, idx).trim();
        var value = part.slice(idx + 1).trim();
        if (key === 't' && value) timestamp = Number(value);
        else if (key === 'v1' && value) signatures.push(value.toLowerCase());
    });

    if (!timestamp || isNaN(timestamp)) return false;
    if (signatures.length === 0) return false;

    // Reject replays: the timestamp must be within 5 minutes of now.
    var now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) return false;

    // iml.sha256(value, key) returns the HMAC-SHA256 as a lowercase hex string.
    var expected = String(iml.sha256(timestamp + '.' + raw, secret)).toLowerCase();

    return signatures.some(function (sig) {
        return sig.length === expected.length && sig === expected;
    });
}
