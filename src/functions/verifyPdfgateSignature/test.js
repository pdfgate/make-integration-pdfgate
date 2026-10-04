// Tests for verifyPdfgateSignature. Timestamps are generated relative to "now"
// so the 5-minute replay window stays valid whenever the suite runs.
var secret = 'whsec_example';
var payload = '{"event":"envelope.completed","data":{"envelopeId":"env_123"}}';
var ts = Math.floor(Date.now() / 1000);
var goodSig = iml.sha256(ts + '.' + payload, secret);

// Valid signature passes.
assert.strictEqual(
    verifyPdfgateSignature('t=' + ts + ',v1=' + goodSig, payload, secret),
    true,
    'valid signature should pass'
);

// Tampered signature fails.
assert.strictEqual(
    verifyPdfgateSignature('t=' + ts + ',v1=deadbeef', payload, secret),
    false,
    'tampered signature should fail'
);

// Wrong secret fails.
assert.strictEqual(
    verifyPdfgateSignature('t=' + ts + ',v1=' + goodSig, payload, 'wrong-secret'),
    false,
    'wrong secret should fail'
);

// Expired timestamp (older than 5 minutes) fails even with a correct HMAC.
var oldTs = ts - 3600;
var oldSig = iml.sha256(oldTs + '.' + payload, secret);
assert.strictEqual(
    verifyPdfgateSignature('t=' + oldTs + ',v1=' + oldSig, payload, secret),
    false,
    'expired timestamp should fail'
);

// A parsed object payload is stringified the same way the sender signs it.
var obj = JSON.parse(payload);
var objSig = iml.sha256(ts + '.' + JSON.stringify(obj), secret);
assert.strictEqual(
    verifyPdfgateSignature('t=' + ts + ',v1=' + objSig, obj, secret),
    true,
    'object payload should verify'
);

// Multiple v1 signatures (secret rotation): passes if any matches.
assert.strictEqual(
    verifyPdfgateSignature('t=' + ts + ',v1=deadbeef,v1=' + goodSig, payload, secret),
    true,
    'one matching v1 among several should pass'
);

// Missing header or secret fails closed.
assert.strictEqual(verifyPdfgateSignature('', payload, secret), false, 'empty header fails');
assert.strictEqual(verifyPdfgateSignature('t=' + ts + ',v1=' + goodSig, payload, ''), false, 'empty secret fails');
