// The seller list behind both the Brand Microsite panel and the Collections
// page. Fetched once at sign-in and held here so a second page does not refetch.

var brands = [];
var pending = null;

export function getBrands() { return brands; }

export function fetchBrands() {
  return fetch('/getSellers')
    .then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || body.details || ('HTTP ' + res.status));
        return body;
      });
    })
    .then(function (data) {
      brands = Array.isArray(data) ? data : [];
      return brands;
    });
}

// For pages that only need the list to exist. Covers the case where a tab is
// opened before the sign-in fetch landed, or after it failed — a failure
// resolves to an empty list and lets the next call retry.
export function ensureBrands() {
  if (brands.length) return Promise.resolve(brands);
  if (!pending) {
    pending = fetchBrands().catch(function () { pending = null; return []; });
  }
  return pending;
}
