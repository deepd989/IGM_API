// One request helper for every admin call. The routes answer with JSON, but an
// error page or an empty body is still possible, so the parse is defensive and
// the status comes back either way instead of throwing.
export function request(url, options) {
  return fetch(url, options).then(function (res) {
    return res.text().then(function (text) {
      var body;
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = text; }
      return { ok: res.ok, status: res.status, body: body };
    });
  });
}

export function sendJson(url, method, payload) {
  return request(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Turns whatever the API returned into readable text — the microsite routes
// answer with { error, details } where details may be a validation array.
export function formatApiError(status, body) {
  if (!body || typeof body !== 'object') return 'HTTP ' + status + ': ' + String(body);

  var head = body.error || body.message || ('HTTP ' + status);
  var detail = body.details;

  if (Array.isArray(detail)) {
    return head + '\n' + detail.map(function (d) {
      return '  • ' + (d.field ? d.field + ': ' : '') + d.message;
    }).join('\n');
  }
  if (detail) return head + '\n  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  return head;
}
