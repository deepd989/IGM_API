const express = require('express');
const { z } = require('zod');
const { listAssets, getAsset, updateAsset } = require('./assetStore');
const router = express.Router();

// Served when a key is missing so <img src> never breaks. Not read from the
// store on purpose: placeholder.product still points at via.placeholder.com,
// which is dead.
const FALLBACK_ASSET_URL = "https://http.cat/404";

// Whole manifest, for the admin Assets page.
router.get('/assets', async (req, res) => {
    try {
        res.status(200).json(await listAssets());
    } catch (error) {
        console.error('Failed to load assets:', error);
        res.status(500).json({ error: 'Failed to load assets', details: error.message });
    }
});

// Only url and description are editable from the admin page; aspectRatio is
// carried through untouched.
const assetUpdateSchema = z.object({
    url: z.string({ error: "url is required" }).trim().min(1, "url cannot be empty"),
    description: z.string({ error: "description is required" }).trim()
});

router.put('/assets/:key', async (req, res) => {
    const { key } = req.params;

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

    try {
        // Null means no such key: the update touches nothing rather than
        // creating an asset the manifest never defined.
        const asset = await updateAsset(key, result.data);
        if (!asset) {
            return res.status(404).json({ error: `Asset key '${key}' not found` });
        }

        console.log(`🖼️ Asset '${key}' updated`);
        return res.status(200).json({ message: `Asset '${key}' updated`, data: asset });
    } catch (error) {
        console.error(`Failed to update asset '${key}':`, error);
        return res.status(500).json({ error: 'Failed to update asset', details: error.message });
    }
});

router.get('/getAsset/:key', async (req, res) => {
    const key = req.params.key;

    let asset = null;
    try {
        asset = await getAsset(key);
    } catch (error) {
        // A lookup failure still redirects: this route sits behind <img src>,
        // where a 500 renders as a broken image on every page using it.
        console.error(`Failed to look up asset '${key}':`, error);
    }

    if (!asset || !asset.url) {
        console.warn(`Asset key not found: ${key}`);
        res.set('X-Asset-Fallback', 'true');
        return res.redirect(302, FALLBACK_ASSET_URL);
    }

    res.redirect(302, asset.url);
});

module.exports = router;
