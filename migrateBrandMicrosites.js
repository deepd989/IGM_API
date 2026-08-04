// One-off cutover: test.brand_microsites -> <MONGO_DB_NAME>.brand_microsites
//
// brandMicrositeRoutes.js used to call client.db() with no argument. The
// connection string carries no database in its path, so the driver fell back to
// "test" — brand microsites ended up in a different database from everything
// else the service writes. The routes now go through getCollection(), which is
// explicitly MONGO_DB_NAME; this script moves the documents that were already
// written to the old home.
//
//   npm run migrate:microsites                    -> copy anything missing, verify
//   npm run migrate:microsites -- --prefer-source -> also overwrite with test's copy
//   npm run migrate:microsites -- --drop-source   -> also drop test.brand_microsites
//
// Copying is additive and keyed on _id, so re-running is safe: a document that
// already exists in the target is left exactly as it is, never overwritten by
// the older copy in test.
//
// --prefer-source inverts that, and exists for one moment only. Until the new
// code is deployed, the running service is still writing microsite edits to
// test, so those edits never reach the target. Run it immediately BEFORE
// deploying to sweep them across; running it after the new code is live would
// overwrite real edits with whatever test last saw.
require('dotenv').config();

const { getDb, closeDb } = require('./dbConnection');

const SOURCE_DB = 'test';
const COLLECTION_NAME = 'brand_microsites';

const targetDbName = process.env.MONGO_DB_NAME;

// Field-by-field comparison of what was copied, so the script only reports
// success on documents that genuinely round-tripped.
function sameDocument(a, b) {
    return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
}

async function migrateBrandMicrosites({ dropSource = false, preferSource = false } = {}) {
    if (SOURCE_DB === targetDbName) {
        console.log(`✅ MONGO_DB_NAME is already "${SOURCE_DB}" — nothing to move`);
        return { copied: 0, alreadyPresent: 0, present: 0, editedSinceLastRun: 0 };
    }

    const sourceDb = await getDb(SOURCE_DB);
    const targetDb = await getDb(targetDbName);
    const source = sourceDb.collection(COLLECTION_NAME);
    const target = targetDb.collection(COLLECTION_NAME);

    const sourceDocs = await source.find({}).toArray();
    console.log(`📦 ${SOURCE_DB}.${COLLECTION_NAME}: ${sourceDocs.length} document(s)`);

    if (!sourceDocs.length) {
        console.log('Nothing to migrate.');
        return { copied: 0, alreadyPresent: 0, present: 0, editedSinceLastRun: 0 };
    }

    // Only documents the target does not already hold. An _id that is already
    // there means a previous run copied it — or the service has been writing to
    // the new home since — and either way that copy wins.
    const existingIds = new Set(
        (await target.find({ _id: { $in: sourceDocs.map(d => d._id) } }, { projection: { _id: 1 } }).toArray())
            .map(d => String(d._id))
    );

    const toCopy = preferSource ? sourceDocs : sourceDocs.filter(d => !existingIds.has(String(d._id)));

    if (preferSource) {
        await target.bulkWrite(
            sourceDocs.map(doc => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })),
            { ordered: false }
        );
        console.log(`➡️  Overwrote ${targetDbName}.${COLLECTION_NAME} with ${sourceDocs.length} document(s) from ${SOURCE_DB}`);
    } else {
        if (toCopy.length) {
            await target.insertMany(toCopy, { ordered: false });
            console.log(`➡️  Copied ${toCopy.length} document(s) into ${targetDbName}.${COLLECTION_NAME}`);
        }
        if (existingIds.size) {
            console.log(`⏭️  ${existingIds.size} document(s) already present in ${targetDbName} — left untouched`);
        }
    }

    // The old collection had no index beyond _id, so a racing POST could create
    // a second microsite for the same brand. The new home enforces it.
    await target.createIndex({ brandId: 1 }, { unique: true });
    console.log(`🔒 Unique index on ${COLLECTION_NAME}.brandId ensured`);

    // Every source document must be readable from the target. Content is only
    // required to match for the ones this run copied: a document that was
    // already there and has since been edited through the API is *supposed* to
    // differ from the stale copy in test, so that is reported, not failed on.
    const copiedIds = new Set(toCopy.map(d => String(d._id)));
    const missing = [];
    const drifted = [];
    let verified = 0;

    for (const doc of sourceDocs) {
        const copy = await target.findOne({ _id: doc._id });

        if (!copy) {
            missing.push({ _id: String(doc._id), brandId: doc.brandId });
        } else if (sameDocument(doc, copy)) {
            verified++;
        } else if (copiedIds.has(String(doc._id))) {
            missing.push({ _id: String(doc._id), brandId: doc.brandId, reason: 'copied but differs' });
        } else {
            drifted.push({ _id: String(doc._id), brandId: doc.brandId });
        }
    }

    console.log(`🔎 ${verified + drifted.length}/${sourceDocs.length} source document(s) present in ${targetDbName}.${COLLECTION_NAME}`);
    if (drifted.length) {
        console.log(`ℹ️  ${drifted.length} of them have been edited since an earlier run — the ${targetDbName} copy is the newer one:`, drifted);
    }
    if (missing.length) {
        console.error('❌ Not every document made it across — source left untouched:', missing);
        throw new Error(`${missing.length} document(s) failed verification`);
    }

    if (dropSource) {
        await source.drop();
        console.log(`🗑️  Dropped ${SOURCE_DB}.${COLLECTION_NAME}`);
    } else {
        console.log(`ℹ️  ${SOURCE_DB}.${COLLECTION_NAME} kept as a rollback copy — ` +
            're-run with --drop-source once the app is confirmed reading the new home');
    }

    return {
        copied: toCopy.length,
        alreadyPresent: preferSource ? 0 : existingIds.size,
        overwrote: preferSource,
        present: verified + drifted.length,
        editedSinceLastRun: drifted.length,
        droppedSource: dropSource
    };
}

if (require.main === module) {
    const dropSource = process.argv.includes('--drop-source');
    const preferSource = process.argv.includes('--prefer-source');

    if (preferSource) {
        console.warn(`⚠️  --prefer-source: ${targetDbName}.${COLLECTION_NAME} will be overwritten with ` +
            `${SOURCE_DB}'s copy. Only correct while the deployed code still writes to ${SOURCE_DB}.`);
    }

    migrateBrandMicrosites({ dropSource, preferSource })
        .then(result => {
            console.log('Done:', JSON.stringify(result));
            return closeDb();
        })
        .then(() => process.exit(0))
        .catch(async error => {
            console.error('Migration failed:', error);
            await closeDb().catch(() => {});
            process.exit(1);
        });
}

module.exports = { migrateBrandMicrosites };
