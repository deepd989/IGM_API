// One-way migration: assetManifest.json / collectionOutputData.json -> MongoDB.
//
// The JSON files used to be both the seed data and the live store, so every
// deploy shipped a snapshot that overwrote whatever the admin portal had edited
// since. They are now seed-only: the database is the source of truth, and this
// script fills it in only when it is still empty.
//
// Boot path : seedFromJson() from app.js — seeds an empty collection, skips a
//             populated one, never overwrites.
// Manual    : npm run seed          (same, safe, idempotent)
//             npm run seed:force    (DESTRUCTIVE — drops both collections and
//                                    re-imports the JSON snapshots)
require('dotenv').config();

const assetManifest = require('./assetManifest.json');
const collectionOutputData = require('./collectionOutputData.json');
const assetStore = require('./assetStore');
const collectionStore = require('./collectionStore');
const { closeDb } = require('./dbConnection');

// Seeds one collection from a JSON snapshot. `force` replaces what is already
// stored; without it a non-empty collection is left exactly as it is, which is
// what makes this safe to run on every boot.
async function seedOne({ label, snapshot, count, insert, replaceAll, force }) {
    const total = Object.keys(snapshot).length;

    if (force) {
        const replaced = await replaceAll(snapshot);
        console.log(`🌱 ${label}: force-replaced with ${replaced} document(s) from JSON`);
        return { status: 'replaced', count: replaced };
    }

    const existing = await count();
    if (existing > 0) {
        console.log(`✅ ${label}: ${existing} document(s) already in MongoDB — skipping seed`);
        return { status: 'skipped', count: existing };
    }

    const inserted = await insert(snapshot);
    console.log(`🌱 ${label}: seeded ${inserted}/${total} document(s) from JSON`);
    return { status: 'seeded', count: inserted };
}

async function seedFromJson({ force = false } = {}) {
    const assets = await seedOne({
        label: 'assets',
        snapshot: assetManifest,
        count: assetStore.countAssets,
        insert: assetStore.insertAssets,
        replaceAll: assetStore.replaceAllAssets,
        force
    });

    const collections = await seedOne({
        label: 'seller_collections',
        snapshot: collectionOutputData,
        count: collectionStore.countGroups,
        insert: collectionStore.insertGroups,
        replaceAll: collectionStore.replaceAllGroups,
        force
    });

    return { assets, collections };
}

if (require.main === module) {
    const force = process.argv.includes('--force');

    if (force) {
        console.warn('⚠️  --force: dropping the assets and seller_collections documents currently in MongoDB');
    }

    seedFromJson({ force })
        .then(result => {
            console.log('Done:', JSON.stringify(result));
            return closeDb();
        })
        .then(() => process.exit(0))
        .catch(async error => {
            console.error('Seed failed:', error);
            await closeDb().catch(() => {});
            process.exit(1);
        });
}

module.exports = { seedFromJson };
