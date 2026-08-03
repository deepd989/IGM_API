const express = require('express');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const router = express.Router();

const MANIFEST_PATH = path.join(__dirname, 'assetManifest.json');
const assetManifest = require('./assetManifest.json');

// Served when a key is missing so <img src> never breaks. Not read from the
// manifest on purpose: placeholder.product still points at via.placeholder.com,
// which is dead.
const FALLBACK_ASSET_URL = "https://http.cat/404";

const toAsset = (key) => ({
    key,
    url: assetManifest[key].url,
    description: assetManifest[key].description,
    aspectRatio: assetManifest[key].aspectRatio
});

// Whole manifest, for the admin Assets page. The JSON file sits outside the
// static dir, so it needs an explicit route.
router.get('/assets', (req, res) => {
    res.status(200).json(Object.keys(assetManifest).map(toAsset));
});

// Only url and description are editable from the admin page; aspectRatio is
// carried through untouched.
const assetUpdateSchema = z.object({
    url: z.string({ error: "url is required" }).trim().min(1, "url cannot be empty"),
    description: z.string({ error: "description is required" }).trim()
});

// Written via a temp file + rename so a crash mid-write can never leave a
// truncated manifest behind — this file is require()d at boot.
function persistManifest() {
    const tmpPath = `${MANIFEST_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(assetManifest, null, 2));
    fs.renameSync(tmpPath, MANIFEST_PATH);
}

router.put('/assets/:key', (req, res) => {
    const { key } = req.params;

    if (!Object.prototype.hasOwnProperty.call(assetManifest, key)) {
        return res.status(404).json({ error: `Asset key '${key}' not found in manifest` });
    }

    const result = assetUpdateSchema.safeParse(req.body);
    if (!result.success) {
        const issues = Array.isArray(result.error?.issues) ? result.error.issues : [];
        console.error(`❌ Asset update validation failed for '${key}':`, issues.length
            ? z.prettifyError(result.error)
            : JSON.stringify(result.error));

        return res.status(400).json({
            error: 'Validation Failed',
            details: issues.length
                ? issues.map(err => ({ field: err.path.join('.'), message: err.message }))
                : String(result.error)
        });
    }

    // Mutating the require()d object in place means every module already
    // holding this reference picks the change up without a restart.
    const previous = { ...assetManifest[key] };
    assetManifest[key] = { ...previous, url: result.data.url, description: result.data.description };

    try {
        persistManifest();
    } catch (error) {
        assetManifest[key] = previous; // keep memory in step with what is on disk
        console.error(`Failed to write assetManifest.json for key '${key}':`, error);
        return res.status(500).json({ error: 'Failed to update assetManifest.json', details: error.message });
    }

    console.log(`🖼️ Asset '${key}' updated`);
    return res.status(200).json({ message: `Asset '${key}' updated`, data: toAsset(key) });
});

router.get('/getAsset/:key', (req, res) => {
    const key = req.params.key;
    const asset = Object.prototype.hasOwnProperty.call(assetManifest, key)
        ? assetManifest[key]
        : null;

    if (!asset || !asset.url) {
        console.warn(`Asset key not found in manifest: ${key}`);
        res.set('X-Asset-Fallback', 'true');
        return res.redirect(302, FALLBACK_ASSET_URL);
    }

    res.redirect(302, asset.url);
});

module.exports = router;
