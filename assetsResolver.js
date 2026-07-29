const express = require('express');
const router = express.Router();

const assetManifest = require('./assetManifest.json');

// Served when a key is missing so <img src> never breaks. Not read from the
// manifest on purpose: placeholder.product still points at via.placeholder.com,
// which is dead.
const FALLBACK_ASSET_URL = "https://http.cat/404";

router.get('/getAsset/:key', (req, res) => {
    const key = req.params.key;
    const assetUrl = Object.prototype.hasOwnProperty.call(assetManifest, key)
        ? assetManifest[key]
        : null;

    if (!assetUrl) {
        console.warn(`Asset key not found in manifest: ${key}`);
        res.set('X-Asset-Fallback', 'true');
        return res.redirect(302, FALLBACK_ASSET_URL);
    }

    res.redirect(302, assetUrl);
});

module.exports = router;
