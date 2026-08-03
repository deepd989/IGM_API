// The repeatable sections of the brand microsite form — specialProducts,
// milestones, values and brandReviews are all the same "list of objects" shape,
// so one row builder covers them from a per-section field spec.
import { $ } from './dom.js';
import { ICON_TAGS, paintIcon } from './icons.js';

export var SECTIONS = ['specialProducts', 'milestones', 'values', 'brandReviews'];

var ROW_SPECS = {
  specialProducts: [
    { key: 'productId', label: 'productId' },
    { key: 'productImageUrl', label: 'productImageUrl', placeholder: 'https://…' }
  ],
  milestones: [
    { key: 'year', label: 'year', placeholder: '2014' },
    { key: 'header', label: 'header' },
    { key: 'description', label: 'description', type: 'textarea' }
  ],
  values: [
    { key: 'iconTag', label: 'iconTag (lucide icon)', type: 'select', options: ICON_TAGS, icon: true },
    { key: 'header', label: 'header' },
    { key: 'description', label: 'description', type: 'textarea' }
  ],
  brandReviews: [
    { key: 'name', label: 'name' },
    { key: 'dpUrl', label: 'dpUrl', placeholder: 'https://…' },
    { key: 'stars', label: 'stars (string)', placeholder: '4.5' },
    { key: 'description', label: 'description', type: 'textarea' }
  ]
};

export function addRow(section) {
  var container = $(section);
  var row = document.createElement('div');
  row.className = 'row';

  var remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '×';
  remove.title = 'Remove';
  remove.addEventListener('click', function () { row.remove(); });
  row.appendChild(remove);

  var grid = document.createElement('div');
  grid.className = 'grid2';

  ROW_SPECS[section].forEach(function (f) {
    var wrap = document.createElement('div');
    var lab = document.createElement('label');
    lab.textContent = f.label;
    wrap.appendChild(lab);

    var input;
    if (f.type === 'select') {
      input = document.createElement('select');
      input.appendChild(new Option('— none —', ''));
      (f.options || []).forEach(function (opt) { input.appendChild(new Option(opt, opt)); });
    } else {
      input = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.placeholder) input.placeholder = f.placeholder;
    }
    input.setAttribute('data-key', f.key);

    if (f.icon) {
      // Preview sits beside the select and repaints whenever the pick changes,
      // including the change event setField() fires when loading saved data.
      var pick = document.createElement('div');
      pick.className = 'icon-pick';
      var box = document.createElement('span');
      box.className = 'icon-preview';
      input.addEventListener('change', function () { paintIcon(box, input.value); });
      paintIcon(box, input.value);
      pick.appendChild(input);
      pick.appendChild(box);
      wrap.appendChild(pick);
    } else {
      wrap.appendChild(input);
    }

    grid.appendChild(wrap);
  });

  row.appendChild(grid);
  container.appendChild(row);
}

export function initRowButtons() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (btn) {
    btn.addEventListener('click', function () { addRow(btn.getAttribute('data-add')); });
  });
}

export function collectRows(section) {
  return Array.prototype.map.call($(section).querySelectorAll('.row'), function (row) {
    var obj = {};
    Array.prototype.forEach.call(row.querySelectorAll('[data-key]'), function (input) {
      obj[input.getAttribute('data-key')] = input.value.trim();
    });
    return obj;
  }).filter(function (obj) {
    // Drop rows the user left completely blank instead of failing validation on them.
    return Object.keys(obj).some(function (k) { return obj[k] !== ''; });
  });
}

// Clears every repeatable section back to a single empty row.
export function resetRows() {
  SECTIONS.forEach(function (s) {
    $(s).innerHTML = '';
    addRow(s);
  });
}
