// The Brand Microsite page: the brand tiles on the left and the microsite form
// on the right. A tile sets the brand identity; its ⋮ loads that brand's saved
// microsite into the form.
import { $, setVal } from './dom.js';
import { request, sendJson, formatApiError } from './api.js';
import { fetchBrands, getBrands } from './brands.js';
import { SECTIONS, addRow, collectRows, initRowButtons, resetRows } from './microsite-rows.js';

// ---------- Brands (left panel) ----------
export function loadBrandPanel() {
  var list = $('brandList');
  list.innerHTML = '<p class="empty-note" style="padding:8px">Loading brands…</p>';

  fetchBrands()
    .then(function () {
      renderBrands('');
    })
    .catch(function (e) {
      list.innerHTML = '';
      var p = document.createElement('p');
      p.className = 'alert alert-err';
      p.textContent = 'Could not load brands: ' + e.message;
      list.appendChild(p);
    });
}

function renderBrands(filter) {
  var list = $('brandList');
  var q = filter.toLowerCase();
  var allBrands = getBrands();
  var shown = allBrands.filter(function (b) {
    return !q ||
      String(b.brandid || '').toLowerCase().indexOf(q) !== -1 ||
      String(b.brandName || '').toLowerCase().indexOf(q) !== -1;
  });

  $('brandCount').textContent = '(' + shown.length + ')';
  list.innerHTML = '';

  if (!shown.length) {
    var p = document.createElement('p');
    p.className = 'empty-note';
    p.style.padding = '8px';
    p.textContent = allBrands.length ? 'No brand matches that search.' : 'No brands found. Try refreshData.';
    list.appendChild(p);
    return;
  }

  shown.forEach(function (b) {
    var row = document.createElement('div');
    row.className = 'brand-row';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brand-item';
    btn.setAttribute('data-brandid', String(b.brandid));

    if (b.logoPic) {
      var img = document.createElement('img');
      img.className = 'logo';
      img.src = b.logoPic;
      img.alt = '';
      img.onerror = function () { img.style.visibility = 'hidden'; };
      btn.appendChild(img);
    } else {
      var ph = document.createElement('span');
      ph.className = 'logo';
      btn.appendChild(ph);
    }

    var box = document.createElement('span');
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = b.brandName || '(unnamed)';
    var id = document.createElement('span');
    id.className = 'id';
    id.textContent = 'id: ' + b.brandid;
    box.appendChild(nm);
    box.appendChild(document.createElement('br'));
    box.appendChild(id);
    btn.appendChild(box);

    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(list.querySelectorAll('.brand-item'), function (el) {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      $('brandId').value = String(b.brandid);
      $('brandName').value = b.brandName || '';
      // Selecting a tile only sets identity — it does not load a microsite,
      // so drop any edit mode left over from another brand.
      setMode(null);
    });

    var kebab = document.createElement('button');
    kebab.type = 'button';
    kebab.className = 'kebab';
    kebab.textContent = '⋮';
    kebab.title = 'Load microsite data into the form';
    kebab.setAttribute('aria-label', 'Load microsite data for ' + (b.brandName || b.brandid));
    kebab.addEventListener('click', function (e) {
      e.stopPropagation();
      Array.prototype.forEach.call(list.querySelectorAll('.brand-item'), function (el) {
        el.classList.remove('active');
      });
      btn.classList.add('active');
      loadMicrositeIntoForm(b);
    });

    row.appendChild(btn);
    row.appendChild(kebab);
    list.appendChild(row);
  });

  markSaved();
}

// ---------- Microsite data -> form (⋮ on a brand tile) ----------
// Locally cached microsite docs, keyed by brandId. Kept in sync on submit so
// an edit does not need a refetch.
var micrositeCache = {};
// Which brandId the form is currently editing, or null when creating.
var editingBrandId = null;

function setMode(brandId) {
  editingBrandId = brandId;
  var badge = $('modeBadge');
  if (brandId) {
    badge.textContent = 'editing ' + brandId;
    badge.className = 'mode-badge editing';
    $('submitBtn').textContent = 'Update brand microsite';
  } else {
    badge.textContent = 'new';
    badge.className = 'mode-badge';
    $('submitBtn').textContent = 'Post brand microsite';
  }
}

// Writes one row field. A <select> silently drops a value it has no option
// for, which would wipe an iconTag saved before the list existed — so keep an
// unrecognised one as an extra option rather than losing it on the next save.
function setField(field, value) {
  var v = value === undefined || value === null ? '' : String(value);

  if (field.tagName === 'SELECT') {
    var known = Array.prototype.some.call(field.options, function (o) { return o.value === v; });
    if (v && !known) field.appendChild(new Option(v + ' (unknown icon)', v));
    field.value = v;
    field.dispatchEvent(new Event('change'));
    return;
  }
  field.value = v;
}

// Rebuilds a repeatable section from an array of objects.
function fillRows(section, items) {
  var container = $(section);
  container.innerHTML = '';
  if (!Array.isArray(items) || !items.length) { addRow(section); return; }
  items.forEach(function (item) {
    addRow(section);
    var row = container.lastElementChild;
    Array.prototype.forEach.call(row.querySelectorAll('[data-key]'), function (input) {
      var k = input.getAttribute('data-key');
      setField(input, item ? item[k] : '');
    });
  });
}

function fillForm(d) {
  var info = d.brandInfoAttributes || {};
  var desc = d.brandDescription || {};
  var color = d.colorCode || {};
  var story = d.ourStory || {};

  setVal('brandId', d.brandId);
  setVal('brandName', d.brandName);
  setVal('brandMicrositeCoverPhotoUrl', d.brandMicrositeCoverPhotoUrl);
  setVal('mapLocationLink', d.mapLocationLink);

  setVal('establishedDate', info.establishedDate);
  setVal('rank', info.rank);
  setVal('numberOfStores', info.numberOfStores !== undefined ? info.numberOfStores : 0);
  setVal('numberOfCustomers', info.numberOfCustomers !== undefined ? info.numberOfCustomers : 0);

  setVal('bdTitle', desc.title);
  setVal('bdDescription', desc.description);

  setVal('primaryColor', color.primaryColor);
  setVal('secondaryColor', color.secondaryColor);

  setVal('wallpaperUrl', story.wallpaperUrl);
  setVal('tryBeforeBuyImgUrl', story.tryBeforeBuyImgUrl);

  fillRows('specialProducts', d.specialProducts);
  fillRows('milestones', story.milestones);
  fillRows('values', story.values);
  fillRows('brandReviews', story.brandReviews);
}

// Clears everything except the brand identity, for a brand with no microsite yet.
function blankForm(brand) {
  $('micrositeForm').reset();
  resetRows();
  setVal('brandId', brand.brandid);
  setVal('brandName', brand.brandName || '');
}

function loadMicrositeIntoForm(brand) {
  var errBox = $('formError');
  var okBox = $('formSuccess');
  errBox.hidden = true;
  okBox.hidden = true;
  $('submitStatus').textContent = 'Loading microsite…';

  request('/brand-microsite/' + encodeURIComponent(brand.brandid))
    .then(function (r) {
      if (r.status === 404) {
        delete micrositeCache[String(brand.brandid)];
        blankForm(brand);
        setMode(null);
        okBox.textContent = 'No microsite saved for ' + (brand.brandName || brand.brandid) +
          ' yet — the form is ready to create one.';
        okBox.hidden = false;
        return;
      }
      if (!r.ok) {
        errBox.textContent = formatApiError(r.status, r.body);
        errBox.hidden = false;
        return;
      }
      micrositeCache[String(brand.brandid)] = r.body;
      fillForm(r.body);
      setMode(String(brand.brandid));
      markSaved();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
    .catch(function (e) {
      errBox.textContent = 'Request failed: ' + e.message;
      errBox.hidden = false;
    })
    .finally(function () {
      $('submitStatus').textContent = '';
    });
}

// Flags tiles whose brandId is in the local cache.
function markSaved() {
  Array.prototype.forEach.call($('brandList').querySelectorAll('.brand-item'), function (el) {
    var id = el.getAttribute('data-brandid');
    var tag = el.querySelector('.saved');
    var has = Object.prototype.hasOwnProperty.call(micrositeCache, id);
    if (has && !tag) {
      var s = document.createElement('span');
      s.className = 'saved';
      s.textContent = ' ✓ saved';
      el.querySelector('.id').appendChild(s);
    } else if (!has && tag) {
      tag.remove();
    }
  });
}

// ---------- Submit ----------
function buildPayload() {
  return {
    brandId: $('brandId').value.trim(),
    brandName: $('brandName').value.trim(),
    brandMicrositeCoverPhotoUrl: $('brandMicrositeCoverPhotoUrl').value.trim(),
    specialProducts: collectRows('specialProducts'),
    mapLocationLink: $('mapLocationLink').value.trim(),
    brandInfoAttributes: {
      establishedDate: $('establishedDate').value.trim(),
      numberOfStores: Number($('numberOfStores').value),
      numberOfCustomers: Number($('numberOfCustomers').value),
      rank: $('rank').value.trim()
    },
    brandDescription: {
      title: $('bdTitle').value.trim(),
      description: $('bdDescription').value.trim()
    },
    colorCode: {
      primaryColor: $('primaryColor').value.trim(),
      secondaryColor: $('secondaryColor').value.trim()
    },
    ourStory: {
      wallpaperUrl: $('wallpaperUrl').value.trim(),
      milestones: collectRows('milestones'),
      values: collectRows('values'),
      tryBeforeBuyImgUrl: $('tryBeforeBuyImgUrl').value.trim(),
      brandReviews: collectRows('brandReviews')
    }
  };
}

// ---------- Wiring ----------
export function initMicrosite() {
  $('brandSearch').addEventListener('input', function (e) { renderBrands(e.target.value); });
  initRowButtons();
  // Start with one row in each repeatable section so the shape is obvious.
  SECTIONS.forEach(addRow);
  $('micrositeForm').addEventListener('submit', onSubmit);
  $('resetBtn').addEventListener('click', onReset);
}

function onSubmit(e) {
  e.preventDefault();

  var errBox = $('formError');
  var okBox = $('formSuccess');
  var btn = $('submitBtn');
  errBox.hidden = true;
  okBox.hidden = true;
  btn.disabled = true;

  var payload = buildPayload();
  // Editing only counts while the form still holds the brand we loaded.
  var isEdit = !!editingBrandId && editingBrandId === payload.brandId;
  var url = isEdit ? '/brand-microsite/' + encodeURIComponent(editingBrandId) : '/brand-microsite';

  $('submitStatus').textContent = isEdit ? 'Updating…' : 'Posting…';

  sendJson(url, isEdit ? 'PUT' : 'POST', payload)
    .then(function (r) {
      if (!r.ok) {
        errBox.textContent = formatApiError(r.status, r.body);
        errBox.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // Update the locally held copy instead of refetching.
      var saved = (r.body && r.body.data) || payload;
      micrositeCache[payload.brandId] = saved;
      setMode(payload.brandId); // a further submit now updates rather than creates
      markSaved();

      okBox.textContent = (r.body && r.body.message ? r.body.message :
        (isEdit ? 'Brand microsite updated.' : 'Brand microsite created.')) +
        ' (brandId: ' + (saved.brandId || payload.brandId) + ')';
      okBox.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
    .catch(function (e) {
      errBox.textContent = 'Request failed: ' + e.message;
      errBox.hidden = false;
    })
    .finally(function () {
      btn.disabled = false;
      $('submitStatus').textContent = '';
    });
}

function onReset() {
  $('micrositeForm').reset();
  resetRows();
  setMode(null);
  $('formError').hidden = true;
  $('formSuccess').hidden = true;
}
