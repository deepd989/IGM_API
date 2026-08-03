// The refreshProductsData button in the top bar: calls /refreshCache and shows
// the raw response in a tooltip, so a partial failure stays readable.
import { $ } from './dom.js';
import { request } from './api.js';
import { loadBrandPanel } from './microsite.js';

function showTooltip(state, title, text) {
  var tooltip = $('refreshTooltip');
  tooltip.className = 'tooltip ' + state;
  $('tooltipTitle').innerHTML = '<span class="status-dot ' + state + '"></span>' + title;
  $('tooltipBody').textContent = text;
  tooltip.hidden = false;
}

export function hideTooltip() { $('refreshTooltip').hidden = true; }

export function initRefresh() {
  $('tooltipClose').addEventListener('click', hideTooltip);

  document.addEventListener('click', function (e) {
    var tooltip = $('refreshTooltip');
    if (tooltip.hidden) return;
    if (tooltip.contains(e.target) || e.target === $('refreshBtn')) return;
    hideTooltip();
  });

  $('refreshBtn').addEventListener('click', onRefresh);
}

function onRefresh() {
  var btn = $('refreshBtn');
  btn.disabled = true;
  var original = btn.textContent;
  btn.textContent = 'refreshing…';
  showTooltip('', '/refreshCache', 'Refreshing caches…');

  request('/refreshCache')
    .then(function (r) {
      var pretty = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
      showTooltip(r.ok ? 'ok' : 'err', '/refreshCache · ' + r.status, pretty);
      // Sellers may have changed — repopulate the left panel from the fresh cache.
      if (r.ok) loadBrandPanel();
    })
    .catch(function (e) {
      showTooltip('err', '/refreshCache · failed', e.message);
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = original;
    });
}
