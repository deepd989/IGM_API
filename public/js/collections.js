// The Collections page: collectionOutputData.json is keyed by sellerId, so the
// left panel lists seller groups and the right panel edits one group — its
// banner, its seller name, and one card per collection.
import { $ } from './dom.js';
import { request, sendJson, formatApiError } from './api.js';
import { ensureBrands, getBrands } from './brands.js';

// Last state read back from the API, keyed by sellerId. The DOM holds the
// in-progress edit; this is what Revert falls back to.
var collectionsData = {};
var collectionsLoaded = false;
var collectionFilter = '';
// The seller whose group is open, or null while creating a group for a seller
// that has none yet.
var currentGroupId = null;

var skuIndex = {};       // sku -> { name, sellerId }
var skusLoaded = false;
var skusLoading = false;

export function loadCollections() {
  if (collectionsLoaded) return;
  collectionsLoaded = true;

  loadSkus();

  var list = $('collectionList');
  list.innerHTML = '<p class="empty-note" style="padding:8px">Loading collections…</p>';

  Promise.all([
    ensureBrands(),
    request('/getCollections').then(function (r) {
      if (!r.ok) throw new Error(formatApiError(r.status, r.body));
      return r.body;
    })
  ])
    .then(function (results) {
      var data = results[1];
      collectionsData = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
      renderCollectionList();
    })
    .catch(function (e) {
      collectionsLoaded = false; // let the next tab switch retry
      list.innerHTML = '';
      $('collectionError').textContent = 'Could not load collections: ' + e.message;
      $('collectionError').hidden = false;
    });
}

function loadSkus() {
  if (skusLoaded || skusLoading) return;
  skusLoading = true;

  request('/productSkus')
    .then(function (r) {
      var list = r.body;
      skuIndex = {};
      (Array.isArray(list) ? list : []).forEach(function (p) {
        if (p && p.sku) skuIndex[p.sku] = { name: p.name || '', sellerId: String(p.sellerId || '') };
      });
      skusLoaded = true;
      refreshChipStates();
    })
    .catch(function () { /* chips still work, just without suggestions */ })
    .finally(function () { skusLoading = false; });
}

// Suggestions for a chip input, narrowed by whatever is typed in it. Both the
// SKU and the product name are searched, so "ring" finds a SKU that does not
// spell it. The open seller's own products sort first, but any SKU can be
// attached.
function filterSkus(query, taken) {
  var q = String(query || '').trim().toLowerCase();
  var mine = String(currentGroupId);

  return Object.keys(skuIndex)
    .filter(function (sku) {
      if (taken.indexOf(sku) !== -1) return false;
      if (!q) return true;
      return sku.toLowerCase().indexOf(q) !== -1 ||
        skuIndex[sku].name.toLowerCase().indexOf(q) !== -1;
    })
    .sort(function (a, b) {
      var own = (skuIndex[b].sellerId === mine) - (skuIndex[a].sellerId === mine);
      return own || a.localeCompare(b);
    });
}

// ----- left panel -----
function groupTitles(sellerId) {
  // While a group is open its titles come from the DOM, so unsaved edits and
  // freshly added collections show up in the left panel too.
  if (sellerId === currentGroupId && !$('collectionDetail').hidden) {
    return Array.prototype.map.call($('collectionRows').querySelectorAll('.collection-card'), function (card) {
      return {
        title: card.querySelector('[data-key="title"]').value.trim(),
        count: card.querySelectorAll('.chip').length
      };
    });
  }
  return ((collectionsData[sellerId] || {}).collections || []).map(function (c) {
    return { title: c.title || '', count: (c.productIds || []).length };
  });
}

function renderCollectionList() {
  var list = $('collectionList');
  var q = collectionFilter.toLowerCase();
  var ids = Object.keys(collectionsData).filter(function (id) {
    if (!q) return true;
    var group = collectionsData[id];
    return id.toLowerCase().indexOf(q) !== -1 ||
      String(group.sellerName || '').toLowerCase().indexOf(q) !== -1 ||
      groupTitles(id).some(function (c) { return c.title.toLowerCase().indexOf(q) !== -1; });
  });

  $('collectionCount').textContent = '(' + ids.length + ')';
  list.innerHTML = '';

  if (!ids.length) {
    var p = document.createElement('p');
    p.className = 'empty-note';
    p.style.padding = '8px';
    p.textContent = Object.keys(collectionsData).length
      ? 'Nothing matches that search.'
      : 'collectionOutputData.json holds no collections yet.';
    list.appendChild(p);
    return;
  }

  ids.forEach(function (id) {
    var group = collectionsData[id];
    var titles = groupTitles(id);

    var row = document.createElement('div');
    row.className = 'brand-row';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brand-item' + (id === currentGroupId ? ' active' : '');

    var brand = getBrands().filter(function (b) { return String(b.brandid) === id; })[0];
    if (brand && brand.logoPic) {
      var img = document.createElement('img');
      img.className = 'logo';
      img.src = brand.logoPic;
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
    nm.textContent = group.sellerName || '(unnamed seller)';
    var meta = document.createElement('span');
    meta.className = 'id';
    meta.textContent = 'id: ' + id + ' · ' + titles.length + ' collections';
    box.appendChild(nm);
    box.appendChild(document.createElement('br'));
    box.appendChild(meta);
    btn.appendChild(box);

    btn.addEventListener('click', function () { showGroup(id); });

    row.appendChild(btn);
    list.appendChild(row);

    // The open group also lists its collections, as a way to jump to one.
    if (id === currentGroupId) {
      var sub = document.createElement('div');
      sub.className = 'sub-list';

      if (!titles.length) {
        var none = document.createElement('p');
        none.className = 'empty-note';
        none.style.margin = '4px 0 4px 8px';
        none.textContent = 'No collections yet.';
        sub.appendChild(none);
      }

      titles.forEach(function (c, i) {
        var s = document.createElement('button');
        s.type = 'button';
        s.className = 'sub-item';
        s.textContent = (c.title || '(untitled)') + ' ';
        var cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = '(' + c.count + ' skus)';
        s.appendChild(cnt);
        s.addEventListener('click', function () { focusCard(i); });
        sub.appendChild(s);
      });

      list.appendChild(sub);
    }
  });
}

function focusCard(index) {
  var card = $('collectionRows').querySelectorAll('.collection-card')[index];
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(function () { card.classList.remove('flash'); }, 1200);
}

function onSearch(e) {
  collectionFilter = e.target.value;
  renderCollectionList();
}

// ----- right panel -----
function fillSellerNameSelect(value) {
  var sel = $('sellerNameSelect');
  var v = value === undefined || value === null ? '' : String(value);
  sel.innerHTML = '';
  sel.appendChild(new Option('— select a seller name —', ''));

  var seen = {};
  getBrands().forEach(function (b) {
    if (!b.brandName || seen[b.brandName]) return;
    seen[b.brandName] = true;
    sel.appendChild(new Option(b.brandName, b.brandName));
  });

  // A stored name that is no longer in the seller list would be silently
  // dropped by the select, so keep it as an option rather than lose it.
  if (v && !seen[v]) sel.appendChild(new Option(v + ' (not in seller list)', v));
  sel.value = v;
}

function renderBanner(url) {
  var img = $('bannerImage');
  var note = $('bannerNote');

  if (!url) {
    img.hidden = true;
    note.hidden = false;
    note.textContent = 'No banner url set.';
    return;
  }

  note.hidden = false;
  note.textContent = 'Loading banner…';
  img.onload = function () { img.hidden = false; note.hidden = true; };
  img.onerror = function () { img.hidden = true; note.hidden = false; note.textContent = 'Banner could not be loaded from that URL.'; };
  img.src = url;
}

// collectionBannerImgUrl is not editable — it always mirrors the seller
// banner, so every card just shows what will be written.
function syncBannerMirrors() {
  var url = $('sellerBannerImgUrl').value.trim();
  Array.prototype.forEach.call($('collectionRows').querySelectorAll('[data-mirror]'), function (el) {
    el.textContent = url || '(same as sellerBannerImgUrl — not set)';
    el.classList.toggle('muted', !url);
  });
}

function onBannerInput(e) {
  syncBannerMirrors();
  renderBanner(e.target.value.trim());
}

function updateRowCount() {
  $('collectionRowCount').textContent =
    '(' + $('collectionRows').querySelectorAll('.collection-card').length + ')';
}

// ----- SKU chips -----
function chipSkus(card) {
  return Array.prototype.map.call(card.querySelectorAll('.chip'), function (c) {
    return c.getAttribute('data-sku');
  });
}

function addChip(chips, sku) {
  sku = String(sku || '').trim();
  if (!sku) return false;

  var dup = Array.prototype.some.call(chips.querySelectorAll('.chip'), function (c) {
    return c.getAttribute('data-sku') === sku;
  });
  if (dup) return false;

  var chip = document.createElement('span');
  chip.className = 'chip';
  chip.setAttribute('data-sku', sku);

  var label = document.createElement('span');
  label.textContent = sku;
  chip.appendChild(label);

  var x = document.createElement('button');
  x.type = 'button';
  x.textContent = '×';
  x.title = 'Remove ' + sku;
  x.setAttribute('aria-label', 'Remove ' + sku);
  x.addEventListener('click', function () {
    chip.remove();
    renderCollectionList();
  });
  chip.appendChild(x);

  chips.insertBefore(chip, chips.querySelector('.chip-input'));
  paintChip(chip);
  return true;
}

// Flags a SKU that products.json does not know about — it is still saved,
// since collectionOutputData.json already holds SKUs the cache has never seen.
function paintChip(chip) {
  var sku = chip.getAttribute('data-sku');
  var known = Object.prototype.hasOwnProperty.call(skuIndex, sku) ? skuIndex[sku] : null;
  chip.classList.toggle('unknown', skusLoaded && !known);
  chip.title = known
    ? (known.name || sku) + ' · seller ' + known.sellerId
    : (skusLoaded ? sku + ' is not in products.json' : sku);
}

function refreshChipStates() {
  Array.prototype.forEach.call($('collectionRows').querySelectorAll('.chip'), paintChip);
}

// How many matches the menu draws at once — the note underneath says when
// there are more, so a broad query does not build 400 buttons.
var SKU_MENU_LIMIT = 60;

function buildChips(productIds) {
  var field = document.createElement('div');
  field.className = 'sku-field';

  var chips = document.createElement('div');
  chips.className = 'chips';

  var input = document.createElement('input');
  input.className = 'chip-input';
  input.placeholder = 'Search SKU or product name…';
  input.setAttribute('autocomplete', 'off');
  chips.appendChild(input);
  field.appendChild(chips);

  var menu = document.createElement('div');
  menu.className = 'sku-menu';
  menu.hidden = true;
  field.appendChild(menu);

  var matches = [];
  var active = -1;

  function attach(sku) {
    if (addChip(chips, sku)) renderCollectionList();
    input.value = '';
    openMenu();
  }

  function paintActive() {
    Array.prototype.forEach.call(menu.querySelectorAll('.sku-option'), function (el, i) {
      el.classList.toggle('active', i === active);
      if (i === active) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function openMenu() {
    var taken = Array.prototype.map.call(chips.querySelectorAll('.chip'), function (c) {
      return c.getAttribute('data-sku');
    });
    matches = filterSkus(input.value, taken);
    active = matches.length ? 0 : -1;
    menu.innerHTML = '';

    if (!skusLoaded) {
      menu.innerHTML = '<p class="note" style="border:0">Loading products…</p>';
      menu.hidden = false;
      return;
    }
    if (!matches.length) {
      menu.innerHTML = '<p class="note" style="border:0">No product matches that. Press Enter to attach it as a SKU anyway.</p>';
      menu.hidden = false;
      return;
    }

    matches.slice(0, SKU_MENU_LIMIT).forEach(function (sku, i) {
      var entry = skuIndex[sku];
      var opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'sku-option' + (i === active ? ' active' : '');

      var s = document.createElement('span');
      s.className = 'sku';
      s.textContent = sku;
      opt.appendChild(s);

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = ' · ' + (entry.name || 'unnamed');
      opt.appendChild(nm);

      if (entry.sellerId === String(currentGroupId)) {
        var own = document.createElement('span');
        own.className = 'own';
        own.textContent = ' · this seller';
        opt.appendChild(own);
      }

      // mousedown, not click: the input must not lose focus first, or the
      // blur handler would close the menu before the pick registers.
      opt.addEventListener('mousedown', function (e) {
        e.preventDefault();
        attach(sku);
      });
      opt.addEventListener('mousemove', function () {
        active = i;
        paintActive();
      });

      menu.appendChild(opt);
    });

    if (matches.length > SKU_MENU_LIMIT) {
      var note = document.createElement('p');
      note.className = 'note';
      note.textContent = 'Showing ' + SKU_MENU_LIMIT + ' of ' + matches.length + ' — keep typing to narrow it down.';
      menu.appendChild(note);
    }

    menu.hidden = false;
  }

  function closeMenu() {
    menu.hidden = true;
    active = -1;
  }

  input.addEventListener('focus', openMenu);
  input.addEventListener('input', openMenu);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (menu.hidden) { openMenu(); return; }
      var shown = Math.min(matches.length, SKU_MENU_LIMIT);
      if (!shown) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : shown - 1)) % shown;
      paintActive();
      return;
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      // A highlighted suggestion wins; otherwise take the text as typed, so a
      // SKU that products.json has never seen can still be attached.
      if (!menu.hidden && active !== -1 && matches[active]) {
        attach(matches[active]);
        return;
      }
      var added = input.value.split(',').map(function (s) {
        return addChip(chips, s);
      }).some(Boolean);
      input.value = '';
      if (added) renderCollectionList();
      openMenu();
      return;
    }

    if (e.key === 'Escape') {
      closeMenu();
      return;
    }

    // Backspace on an empty input peels off the last chip.
    if (e.key === 'Backspace' && !input.value) {
      var last = chips.querySelectorAll('.chip');
      if (last.length) {
        last[last.length - 1].remove();
        renderCollectionList();
        openMenu();
      }
    }
  });

  // Leaving the field only keeps text that is unambiguously a SKU — a search
  // like "ring" would otherwise be attached as a chip on the way out.
  input.addEventListener('blur', function () {
    var typed = input.value.trim();
    if (typed && Object.prototype.hasOwnProperty.call(skuIndex, typed)) {
      if (addChip(chips, typed)) renderCollectionList();
    }
    input.value = '';
    closeMenu();
  });

  // Clicking the padding around the chips is a shortcut into the search box.
  chips.addEventListener('click', function (e) {
    if (e.target === chips) input.focus();
  });

  (productIds || []).forEach(function (sku) { addChip(chips, sku); });
  return field;
}

function buildCollectionCard(collection) {
  var c = collection || {};
  var card = document.createElement('div');
  card.className = 'row collection-card';

  var remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '×';
  remove.title = 'Remove this collection';
  remove.addEventListener('click', function () {
    card.remove();
    updateRowCount();
    renderCollectionList();
  });
  card.appendChild(remove);

  var title = document.createElement('div');
  title.innerHTML = '<label>title *</label>';
  var titleInput = document.createElement('input');
  titleInput.setAttribute('data-key', 'title');
  titleInput.value = c.title || '';
  titleInput.addEventListener('input', renderCollectionList);
  title.appendChild(titleInput);
  card.appendChild(title);

  var desc = document.createElement('div');
  desc.style.marginTop = '10px';
  desc.innerHTML = '<label>description</label>';
  var descInput = document.createElement('textarea');
  descInput.setAttribute('data-key', 'description');
  descInput.value = c.description || '';
  desc.appendChild(descInput);
  card.appendChild(desc);

  var skus = document.createElement('div');
  skus.style.marginTop = '10px';
  skus.innerHTML = '<label>productSkus</label>';
  skus.appendChild(buildChips(c.productIds));
  var skuHint = document.createElement('div');
  skuHint.className = 'hint';
  skuHint.textContent = 'Type to filter by SKU or product name · ↑↓ and Enter to attach · Enter also attaches a SKU that is not in the list.';
  skus.appendChild(skuHint);
  card.appendChild(skus);

  var banner = document.createElement('div');
  banner.style.marginTop = '10px';
  banner.innerHTML = '<label>collectionBannerImgUrl (mirrors sellerBannerImgUrl)</label>';
  var mirror = document.createElement('div');
  mirror.className = 'value-line';
  mirror.setAttribute('data-mirror', '');
  banner.appendChild(mirror);
  card.appendChild(banner);

  return card;
}

function renderCards(collections) {
  var rows = $('collectionRows');
  rows.innerHTML = '';
  (collections || []).forEach(function (c) { rows.appendChild(buildCollectionCard(c)); });
  updateRowCount();
  syncBannerMirrors();
}

function showGroup(sellerId) {
  var group = collectionsData[sellerId];
  if (!group) return;

  currentGroupId = sellerId;
  $('collectionError').hidden = true;
  $('collectionSuccess').hidden = true;
  $('collectionPlaceholder').hidden = true;
  $('collectionDetail').hidden = false;

  $('newSellerField').hidden = true;
  $('collectionSellerId').textContent = 'sellerId ' + sellerId;
  $('collectionSellerId').hidden = false;
  $('collectionSaveBtn').textContent = 'Save collections';

  $('sellerBannerImgUrl').value = group.sellerBannerImgUrl || '';
  fillSellerNameSelect(group.sellerName);
  renderBanner(group.sellerBannerImgUrl || '');
  renderCards(group.collections);
  renderCollectionList();
}

// The + above the list starts a group for a seller that has none yet.
function onAddGroup() {
  ensureBrands().then(function () {
    var free = getBrands().filter(function (b) {
      return !Object.prototype.hasOwnProperty.call(collectionsData, String(b.brandid));
    });

    $('collectionError').hidden = true;
    $('collectionSuccess').hidden = true;

    if (!free.length) {
      $('collectionError').textContent = 'Every seller already has a collections group — pick one from the left to edit it.';
      $('collectionError').hidden = false;
      return;
    }

    currentGroupId = null;
    $('collectionPlaceholder').hidden = true;
    $('collectionDetail').hidden = false;
    $('collectionSellerId').textContent = 'new';
    $('collectionSaveBtn').textContent = 'Create collections';

    var sel = $('newSellerSelect');
    sel.innerHTML = '';
    free.forEach(function (b) {
      sel.appendChild(new Option((b.brandName || '(unnamed)') + ' — id ' + b.brandid, String(b.brandid)));
    });
    // The seller a group is created for also names it.
    sel.onchange = function () {
      var picked = free.filter(function (b) { return String(b.brandid) === sel.value; })[0];
      fillSellerNameSelect(picked ? picked.brandName : '');
    };
    $('newSellerField').hidden = false;

    $('sellerBannerImgUrl').value = '';
    fillSellerNameSelect(free[0].brandName || '');
    renderBanner('');
    renderCards([{}]);
    renderCollectionList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function onAddCollection() {
  var card = buildCollectionCard({});
  $('collectionRows').appendChild(card);
  updateRowCount();
  syncBannerMirrors();
  renderCollectionList();
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.querySelector('[data-key="title"]').focus();
}

function onRevert() {
  $('collectionError').hidden = true;
  $('collectionSuccess').hidden = true;
  if (currentGroupId) {
    showGroup(currentGroupId);
  } else {
    $('collectionDetail').hidden = true;
    $('collectionPlaceholder').hidden = false;
    renderCollectionList();
  }
}

function buildCollectionsPayload() {
  return {
    sellerBannerImgUrl: $('sellerBannerImgUrl').value.trim(),
    sellerName: $('sellerNameSelect').value,
    collections: Array.prototype.map.call($('collectionRows').querySelectorAll('.collection-card'), function (card) {
      return {
        title: card.querySelector('[data-key="title"]').value.trim(),
        description: card.querySelector('[data-key="description"]').value.trim(),
        productIds: chipSkus(card)
      };
    })
  };
}

function onSave() {
  var btn = $('collectionSaveBtn');
  var errBox = $('collectionError');
  var okBox = $('collectionSuccess');
  errBox.hidden = true;
  okBox.hidden = true;

  var payload = buildCollectionsPayload();
  var isNew = !currentGroupId;
  var sellerId = isNew ? $('newSellerSelect').value : currentGroupId;

  var problems = [];
  if (!payload.sellerBannerImgUrl) problems.push('sellerBannerImgUrl cannot be empty.');
  if (!payload.sellerName) problems.push('Pick a sellerName.');
  payload.collections.forEach(function (c, i) {
    if (!c.title) problems.push('Collection ' + (i + 1) + ' needs a title.');
  });
  if (problems.length) {
    errBox.textContent = problems.join('\n');
    errBox.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (isNew) payload.sellerId = sellerId;

  btn.disabled = true;
  $('collectionSaveStatus').textContent = isNew ? 'Creating…' : 'Saving…';

  sendJson(
    isNew ? '/collections' : '/collections/' + encodeURIComponent(sellerId),
    isNew ? 'POST' : 'PUT',
    payload
  )
    .then(function (r) {
      if (!r.ok) {
        errBox.textContent = formatApiError(r.status, r.body);
        errBox.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Re-render from what the API stored, so the mirrored banners and the
      // de-duplicated SKUs on screen are what is actually on disk.
      collectionsData[sellerId] = (r.body && r.body.data) || payload;
      showGroup(sellerId);

      okBox.textContent = (r.body && r.body.message) ||
        ('Collections for seller ' + sellerId + ' saved') ;
      okBox.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
    .catch(function (e) {
      errBox.textContent = 'Request failed: ' + e.message;
      errBox.hidden = false;
    })
    .finally(function () {
      btn.disabled = false;
      $('collectionSaveStatus').textContent = '';
    });
}

// ---------- Wiring ----------
export function initCollections() {
  $('collectionSearch').addEventListener('input', onSearch);
  $('sellerBannerImgUrl').addEventListener('input', onBannerInput);
  // The + above the list starts a group for a seller that has none yet.
  $('addGroupBtn').addEventListener('click', onAddGroup);
  $('addCollectionBtn').addEventListener('click', onAddCollection);
  $('collectionRevertBtn').addEventListener('click', onRevert);
  $('collectionSaveBtn').addEventListener('click', onSave);
}
