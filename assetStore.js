// Data access for the asset manifest. MongoDB is the source of truth;
// assetManifest.json is only the seed snapshot used to populate an empty
// collection on a fresh environment (see seedFromJson.js), so a redeploy can
// no longer roll admin edits back to whatever was committed.
const { getCollection } = require('./dbConnection');

const COLLECTION_NAME = 'assets';

// The shape the API exposes; `order`, `updatedAt` and `_id` stay internal.
const PUBLIC_PROJECTION = { _id: 0, key: 1, url: 1, description: 1, aspectRatio: 1 };

// `order` carries over the hand-grouped ordering assetManifest.json had (it was
// never alphabetical), so the admin list does not reshuffle now that rows come
// back from a query. `key` breaks ties for anything inserted later.
const SORT = { order: 1, key: 1 };

let indexPromise;

async function assetsCollection() {
    const collection = await getCollection(COLLECTION_NAME);

    // Built once per process. A failure is not cached, so the next call retries
    // instead of leaving every later write unprotected by the unique index.
    if (!indexPromise) {
        indexPromise = collection
            .createIndex({ key: 1 }, { unique: true })
            .catch(error => { indexPromise = undefined; throw error; });
    }
    await indexPromise;

    return collection;
}

async function listAssets() {
    const collection = await assetsCollection();
    return collection.find({}, { projection: PUBLIC_PROJECTION }).sort(SORT).toArray();
}

async function getAsset(key) {
    const collection = await assetsCollection();
    return collection.findOne({ key }, { projection: PUBLIC_PROJECTION });
}

/**
 * Updates the editable fields of one asset.
 * Returns the stored asset, or null when the key does not exist.
 */
async function updateAsset(key, { url, description }) {
    const collection = await assetsCollection();
    return collection.findOneAndUpdate(
        { key },
        { $set: { url, description, updatedAt: new Date() } },
        { returnDocument: 'after', projection: PUBLIC_PROJECTION }
    );
}

async function countAssets() {
    const collection = await assetsCollection();
    return collection.countDocuments();
}

// Manifest object ({ key: { url, description, aspectRatio } }) -> documents.
function toDocuments(manifest) {
    return Object.keys(manifest).map((key, index) => ({
        key,
        url: manifest[key].url,
        description: manifest[key].description,
        aspectRatio: manifest[key].aspectRatio,
        order: index
    }));
}

/**
 * Inserts a manifest into an empty collection. Duplicate keys are ignored so
 * two instances booting at once cannot fail each other's seed.
 * Seeding only — never call this on a populated collection.
 */
async function insertAssets(manifest) {
    const collection = await assetsCollection();
    const docs = toDocuments(manifest);
    if (!docs.length) return 0;

    try {
        const result = await collection.insertMany(docs, { ordered: false });
        return result.insertedCount;
    } catch (error) {
        if (error?.code === 11000 || error?.writeErrors?.every(e => e.err?.code === 11000)) {
            return error.result?.insertedCount ?? 0;
        }
        throw error;
    }
}

/**
 * Drops every asset and re-inserts the manifest. Destructive — this is the
 * `--force` path of the seed script, not something a request should reach.
 */
async function replaceAllAssets(manifest) {
    const collection = await assetsCollection();
    await collection.deleteMany({});
    const docs = toDocuments(manifest);
    if (!docs.length) return 0;

    const result = await collection.insertMany(docs, { ordered: false });
    return result.insertedCount;
}

module.exports = {
    COLLECTION_NAME,
    listAssets,
    getAsset,
    updateAsset,
    countAssets,
    insertAssets,
    replaceAllAssets
};
