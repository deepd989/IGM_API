// The Assets page: assetManifest.json entries listed on the left, with the
// url/description of the selected one editable on the right.
import { $ } from './dom.js';
import { request, sendJson, formatApiError } from './api.js';

var allAssets = [];
var assetsLoaded = false;
var currentAsset = null;

export function loadAssets() {
  if (assetsLoaded) return;
  assetsLoaded = true;

  var list = $('assetList');
  list.innerHTML = '<p class="empty-note" style="padding:8px">Loading assets…</p>';

  request('/assets')
    .then(function (r) {
      if (!r.ok) throw new Error(formatApiError(r.status, r.body));
      allAssets = Array.isArray(r.body) ? r.body : [];
      renderAssets('');
    })
    .catch(function (e) {
      assetsLoaded = false; // let the next tab switch retry
      list.innerHTML = '';
      $('assetError').textContent = 'Could not load assets: ' + e.message;
      $('assetError').hidden = false;
    });
}

function renderAssets(filter) {
  var list = $('assetList');
  var q = filter.toLowerCase();
  var shown = allAssets.filter(function (a) {
    return !q || String(a.key || '').toLowerCase().indexOf(q) !== -1;
  });

  $('assetCount').textContent = '(' + shown.length + ')';
  list.innerHTML = '';

  if (!shown.length) {
    var p = document.createElement('p');
    p.className = 'empty-note';
    p.style.padding = '8px';
    p.textContent = allAssets.length ? 'No asset matches that search.' : 'No assets in the manifest.';
    list.appendChild(p);
    return;
  }

  shown.forEach(function (a) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'asset-item';
    btn.textContent = a.key;
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(list.querySelectorAll('.asset-item'), function (el) {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      showAsset(a);
    });
    list.appendChild(btn);
  });
}

function showAsset(asset) {
  currentAsset = asset;
  $('assetError').hidden = true;
  $('assetSuccess').hidden = true;
  $('assetPlaceholder').hidden = true;
  $('assetDetail').hidden = false;

  $('assetName').textContent = asset.key;
  $('assetAspectRatio').textContent = formatRatio(asset.aspectRatio, '(not set)');
  $('assetPreviewRatio').textContent = formatRatio(asset.aspectRatio, '—');
  $('assetDescriptionInput').value = asset.description || '';
  $('assetUrlInput').value = asset.url || '';

  renderAssetImage(asset);
}

// Shown as a ratio against a height of 1 rather than the bare width/height
// number the manifest stores: 3 -> "3:1", 1 -> "1:1", 0.75 -> "0.75:1".
function formatRatio(aspectRatio, fallback) {
  if (aspectRatio === undefined || aspectRatio === null || aspectRatio === '') return fallback;
  // An un-migrated "W:H" entry is already a ratio — leave it as it is.
  if (String(aspectRatio).indexOf(':') !== -1) return String(aspectRatio);

  var n = parseFloat(aspectRatio);
  return n > 0 ? n + ':1' : fallback;
}

// The manifest stores aspectRatio as a width/height number (1.72, 0.75, 3).
// The legacy "W:H" form is still accepted so an un-migrated entry renders;
// anything else falls back to sizing on the image itself.
function toCssRatio(aspectRatio) {
  if (typeof aspectRatio === 'number') return aspectRatio > 0 ? String(aspectRatio) : 'auto';

  var parts = String(aspectRatio || '').split(':');
  if (parts.length === 2) {
    var w = parseFloat(parts[0]);
    var h = parseFloat(parts[1]);
    return (w > 0 && h > 0) ? (w + ' / ' + h) : 'auto';
  }

  var n = parseFloat(aspectRatio);
  return n > 0 ? String(n) : 'auto';
}

function renderAssetImage(asset) {
  var img = $('assetImage');
  var note = $('assetImageNote');
  var frame = $('assetFrame');

  frame.style.setProperty('--ar', toCssRatio(asset.aspectRatio));
  frame.hidden = true;
  img.hidden = true;
  note.hidden = false;

  if (!asset.url) {
    note.textContent = 'No url set for this asset.';
    return;
  }

  note.textContent = 'Loading image…';
  img.onload = function () { img.hidden = false; frame.hidden = false; note.hidden = true; };
  img.onerror = function () {
    img.hidden = true;
    frame.hidden = true;
    note.hidden = false;
    note.textContent = 'Image could not be loaded from that URL.';
  };
  img.alt = asset.key;
  img.src = asset.url;

  var link = $('assetUrlLink');
  link.href = asset.url;
}

export function initAssets() {
  $('assetSearch').addEventListener('input', function (e) { renderAssets(e.target.value); });
  $('assetSaveBtn').addEventListener('click', onSave);
}

function onSave() {
  if (!currentAsset) return;

  var btn = $('assetSaveBtn');
  var errBox = $('assetError');
  var okBox = $('assetSuccess');
  errBox.hidden = true;
  okBox.hidden = true;
  btn.disabled = true;
  $('assetSaveStatus').textContent = 'Saving…';

  var payload = {
    url: $('assetUrlInput').value.trim(),
    description: $('assetDescriptionInput').value.trim()
  };

  sendJson('/assets/' + encodeURIComponent(currentAsset.key), 'PUT', payload)
    .then(function (r) {
      if (!r.ok) {
        errBox.textContent = formatApiError(r.status, r.body);
        errBox.hidden = false;
        return;
      }

      // Trust the saved entry the API echoes back, so the panel shows what
      // actually landed in assetManifest.json.
      var saved = (r.body && r.body.data) || {
        key: currentAsset.key,
        url: payload.url,
        description: payload.description,
        aspectRatio: currentAsset.aspectRatio
      };

      var idx = allAssets.findIndex(function (a) { return a.key === saved.key; });
      if (idx !== -1) allAssets[idx] = saved;
      currentAsset = saved;

      $('assetDescriptionInput').value = saved.description || '';
      $('assetUrlInput').value = saved.url || '';
      renderAssetImage(saved);

      okBox.textContent = (r.body && r.body.message) || ('Asset ' + saved.key + ' updated');
      okBox.hidden = false;
    })
    .catch(function (e) {
      errBox.textContent = 'Request failed: ' + e.message;
      errBox.hidden = false;
    })
    .finally(function () {
      btn.disabled = false;
      $('assetSaveStatus').textContent = '';
    });
}
