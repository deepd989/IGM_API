// Data access for seller collection groups. MongoDB is the source of truth;
// collectionOutputData.json is only the seed snapshot used to populate an empty
// collection on a fresh environment (see seedFromJson.js), so a redeploy can no
// longer roll admin edits back to whatever was committed.
//
// One document per seller, mirroring the old file's top-level keying:
//   { sellerId, sellerBannerImgUrl, sellerName, collections: [...] }
const { getCollection } = require('./dbConnection');

const COLLECTION_NAME = 'seller_collections';

let indexPromise;

async function groupsCollection() {
    const collection = await getCollection(COLLECTION_NAME);

    // Built once per process. A failure is not cached, so the next call retries
    // instead of leaving POST /collections racing without its uniqueness guard.
    if (!indexPromise) {
        indexPromise = collection
            .createIndex({ sellerId: 1 }, { unique: true })
            .catch(error => { indexPromise = undefined; throw error; });
    }
    await indexPromise;

    return collection;
}

// The group shape callers see. sellerId is stripped because it was the map key
// in collectionOutputData.json, never a field inside the group — the admin page
// still reads it that way.
function toGroupBody(doc) {
    if (!doc) return null;
    return {
        sellerBannerImgUrl: doc.sellerBannerImgUrl,
        sellerName: doc.sellerName,
        collections: doc.collections || []
    };
}

/**
 * Every group, keyed by sellerId — the exact shape GET /getCollections has
 * always returned.
 */
async function getAllGroupsBySellerId() {
    const collection = await groupsCollection();
    const docs = await collection.find({}).sort({ sellerId: 1 }).toArray();

    return docs.reduce((acc, doc) => {
        acc[doc.sellerId] = toGroupBody(doc);
        return acc;
    }, {});
}

async function getGroup(sellerId) {
    const collection = await groupsCollection();
    return toGroupBody(await collection.findOne({ sellerId: String(sellerId) }));
}

async function groupExists(sellerId) {
    const collection = await groupsCollection();
    return (await collection.countDocuments({ sellerId: String(sellerId) }, { limit: 1 })) > 0;
}

/**
 * Replaces one seller's whole group.
 * Returns the stored group, or null when that seller has none yet.
 */
async function replaceGroup(sellerId, group) {
    const collection = await groupsCollection();
    const doc = await collection.findOneAndUpdate(
        { sellerId: String(sellerId) },
        { $set: { ...group, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toGroupBody(doc);
}

/**
 * Creates a group for a seller that has none.
 * Returns null when one already exists, so a lost race surfaces as a 409
 * rather than overwriting the winner.
 */
async function createGroup(sellerId, group) {
    const collection = await groupsCollection();
    const now = new Date();

    try {
        await collection.insertOne({
            sellerId: String(sellerId),
            ...group,
            createdAt: now,
            updatedAt: now
        });
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }

    return toGroupBody(group);
}

async function countGroups() {
    const collection = await groupsCollection();
    return collection.countDocuments();
}

// { sellerId: { sellerBannerImgUrl, sellerName, collections } } -> documents.
function toDocuments(groupsBySellerId) {
    return Object.keys(groupsBySellerId).map(sellerId => ({
        sellerId: String(sellerId),
        ...toGroupBody(groupsBySellerId[sellerId])
    }));
}

/**
 * Inserts groups into an empty collection. Duplicate sellerIds are ignored so
 * two instances booting at once cannot fail each other's seed.
 * Seeding only — never call this on a populated collection.
 */
async function insertGroups(groupsBySellerId) {
    const collection = await groupsCollection();
    const docs = toDocuments(groupsBySellerId);
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
 * Upserts every supplied group, leaving sellers that are absent untouched.
 * Used by the live-rebuild path in GET /getCollections.
 */
async function upsertGroups(groupsBySellerId) {
    const collection = await groupsCollection();
    const docs = toDocuments(groupsBySellerId);
    if (!docs.length) return 0;

    const now = new Date();
    const result = await collection.bulkWrite(
        docs.map(({ sellerId, ...group }) => ({
            updateOne: {
                filter: { sellerId },
                update: { $set: { ...group, updatedAt: now }, $setOnInsert: { sellerId, createdAt: now } },
                upsert: true
            }
        })),
        { ordered: false }
    );

    return result.upsertedCount + result.modifiedCount;
}

/**
 * Drops every group and re-inserts the supplied ones. Destructive — this is the
 * `--force` path of the seed script, not something a request should reach.
 */
async function replaceAllGroups(groupsBySellerId) {
    const collection = await groupsCollection();
    await collection.deleteMany({});
    const docs = toDocuments(groupsBySellerId);
    if (!docs.length) return 0;

    const result = await collection.insertMany(docs, { ordered: false });
    return result.insertedCount;
}

module.exports = {
    COLLECTION_NAME,
    getAllGroupsBySellerId,
    getGroup,
    groupExists,
    replaceGroup,
    createGroup,
    countGroups,
    insertGroups,
    upsertGroups,
    replaceAllGroups
};
