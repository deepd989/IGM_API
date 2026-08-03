// Top-bar page switching. Each tab carries the id of the page it shows.
import { $ } from './dom.js';
import { loadAssets } from './assets.js';
import { loadCollections } from './collections.js';

// Pages that pull their own data the first time they are opened.
var PAGE_LOADERS = { assetsPage: loadAssets, collectionsPage: loadCollections };

export function showPage(page) {
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    var p = t.getAttribute('data-page');
    t.classList.toggle('active', p === page);
    $(p).hidden = p !== page;
  });
  if (PAGE_LOADERS[page]) PAGE_LOADERS[page]();
}

export function initTabs() {
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () { showPage(tab.getAttribute('data-page')); });
  });
}
