// Sign-in gate for the admin pages. The check is client-side only — it keeps
// the panel out of the way, it is not a security boundary.
import { $ } from './dom.js';
import { loadBrandPanel } from './microsite.js';
import { showPage } from './tabs.js';
import { hideTooltip } from './refresh.js';

var ADMIN_ID = 'igmAdmin10';
var ADMIN_PASS = 'pass10';

export function initAuth() {
  $('loginForm').addEventListener('submit', onLogin);
  $('logoutBtn').addEventListener('click', onLogout);
}

function onLogin(e) {
  e.preventDefault();
  var id = $('loginId').value.trim();
  var pass = $('loginPass').value;
  var err = $('loginError');

  if (id !== ADMIN_ID) {
    err.textContent = 'Access denied — the ID is wrong.';
    err.hidden = false;
    return;
  }
  if (pass !== ADMIN_PASS) {
    err.textContent = 'Access denied — the password is wrong.';
    err.hidden = false;
    $('loginPass').value = '';
    return;
  }

  err.hidden = true;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('whoami').textContent = 'signed in as ' + id;
  loadBrandPanel();
}

function onLogout() {
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('loginPass').value = '';
  $('loginId').value = '';
  hideTooltip();
  // Next sign-in starts on the microsite page again.
  showPage('micrositePage');
}
