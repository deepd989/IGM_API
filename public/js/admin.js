// Entry point for the admin page. Module scripts are deferred, so the DOM is
// already parsed by the time this runs and every init() can bind straight away.
import { initAuth } from './auth.js';
import { initTabs } from './tabs.js';
import { initMicrosite } from './microsite.js';
import { initAssets } from './assets.js';
import { initCollections } from './collections.js';
import { initRefresh } from './refresh.js';

initAuth();
initTabs();
initMicrosite();
initAssets();
initCollections();
initRefresh();
