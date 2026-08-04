const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getAllResolvedProducts } = require('./productResolver');
const {
    getAllGroupsBySellerId,
    groupExists,
    replaceGroup,
    createGroup,
    upsertGroups
} = require('./collectionStore');

router.get('/getCollections', async (req, res) => {
    try {
        const useLiveCollectionData = false

        let responseData;

        if (useLiveCollectionData) {
            // 2. Fetch fresh data from the resolver
            const data = await getAllResolvedProducts();

            // Map items to include the sellerId alongside the product attributes
            const products = data.map(item => ({
                ...item.updated,
                sellerId: item.sellerId
            }));

            const collectionsBySeller = {};

            products.forEach(product => {
                const attributes = product.custom_attributes || [];

                // Extract collection ID and Seller Name from attributes
                const rawCollectionId = attributes.find(attr => attr.attribute_code === 'collection_id')?.value || "";
                const sellerId = product.sellerId;

                // Note: Ensure 'seller_id' is the correct attribute_code for the Name string
                const sellerName = attributes.find(attr => attr.attribute_code === 'seller_id')?.value || "dummy_seller_name";

                if (!sellerId) return;

                // Get the first word from comma-separated string
                const firstCollection = rawCollectionId.split(',')[0].trim();
                if (!firstCollection) return;

                // 3. Initialize seller as an OBJECT (to allow sellerName to be serialized)
                if (!collectionsBySeller[sellerId]) {
                    collectionsBySeller[sellerId] = {
                        sellerBannerImgUrl:"https://dummyimage.com", // Placeholder banner image URL
                        sellerName: sellerName,
                        collections: [] // Array to hold the unique collection entries
                    };
                }

                // 4. Find or create the specific collection entry within this seller
                let collectionEntry = collectionsBySeller[sellerId].collections.find(
                    c => c.collectionName === firstCollection
                );

                if (!collectionEntry) {
                    collectionEntry = {
                        collectionBannerImgUrl:"https://dummyimage.com",
                        title: firstCollection,
                        productIds: [],
                        description:"dummy description"
                    };
                    collectionsBySeller[sellerId].collections.push(collectionEntry);
                }

                // 5. Push SKU if it exists
                if (product.sku) {
                    collectionEntry.productIds.push(product.sku);
                }
            });

            // 6. Push the rebuilt groups into MongoDB. Upserted rather than
            // replaced, so a seller the resolver returns nothing for keeps the
            // group the admin portal curated.
            await upsertGroups(collectionsBySeller);

            responseData = collectionsBySeller;

        } else {
            // 7. Otherwise serve what is stored — an empty object simply means
            // no seller has collections yet.
            responseData = await getAllGroupsBySellerId();
        }

        // 8. Final Response
        res.json(responseData);

    } catch (error) {
        console.error("Error processing collections:", error);
        res.status(500).json({
            error: 'Failed to process collections',
            details: error.message
        });
    }
});


// Flat SKU list for the admin Collections page, so attaching a product does not
// mean shipping the whole 3 MB products.json to the browser.
router.get('/productSkus', async (req, res) => {
    try {
        const products = await getAllResolvedProducts();

        const skus = products
            .map(item => ({
                sku: item.updated?.sku,
                name: item.updated?.name || '',
                sellerId: item.sellerId === undefined || item.sellerId === null ? '' : String(item.sellerId)
            }))
            .filter(p => p.sku);

        res.status(200).json(skus);
    } catch (error) {
        console.error("Error building SKU list:", error);
        res.status(500).json({ error: 'Failed to build SKU list', details: error.message });
    }
});

// collectionBannerImgUrl is deliberately absent: it is always written as a copy
// of the group's sellerBannerImgUrl, so accepting it here would only let a
// caller send a value that gets thrown away.
const collectionSchema = z.object({
    title: z.string({ error: "title is required" }).trim().min(1, "title cannot be empty"),
    description: z.string({ error: "description is required" }).trim(),
    productIds: z.array(z.string().trim().min(1, "a productId cannot be empty"), { error: "productIds must be an array" })
});

const sellerCollectionsSchema = z.object({
    sellerBannerImgUrl: z.string({ error: "sellerBannerImgUrl is required" }).trim().min(1, "sellerBannerImgUrl cannot be empty"),
    sellerName: z.string({ error: "sellerName is required" }).trim().min(1, "sellerName cannot be empty"),
    collections: z.array(collectionSchema, { error: "collections must be an array" })
});

const newSellerCollectionsSchema = sellerCollectionsSchema.extend({
    sellerId: z.union([z.string(), z.number()], { error: "sellerId is required" })
        .transform(v => String(v).trim())
        .refine(v => v.length > 0, "sellerId cannot be empty")
});

function validationError(res, error, context) {
    const issues = Array.isArray(error?.issues) ? error.issues : [];
    console.error(`❌ Collection validation failed for ${context}:`, issues.length
        ? z.prettifyError(error)
        : JSON.stringify(error));

    return res.status(400).json({
        error: 'Validation Failed',
        details: issues.length
            ? issues.map(err => ({ field: err.path.join('.'), message: err.message }))
            : String(error)
    });
}

// Shapes one validated group into exactly what gets stored: duplicate SKUs
// dropped and every collection banner mirrored from the seller banner.
function toStoredGroup(data) {
    return {
        sellerBannerImgUrl: data.sellerBannerImgUrl,
        sellerName: data.sellerName,
        collections: data.collections.map(collection => ({
            collectionBannerImgUrl: data.sellerBannerImgUrl,
            title: collection.title,
            productIds: Array.from(new Set(collection.productIds)),
            description: collection.description
        }))
    };
}

// Replaces one seller's whole group — the admin page always sends the full
// collections array, so a removed collection is simply one that is not in it.
router.put('/collections/:sellerId', async (req, res) => {
    const sellerId = String(req.params.sellerId);

    const result = sellerCollectionsSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result.error, `seller '${sellerId}'`);

    try {
        // Null means the seller has no group yet — POST /collections creates
        // one; this route only ever replaces an existing group.
        const group = await replaceGroup(sellerId, toStoredGroup(result.data));

        if (!group) {
            return res.status(404).json({ error: `No collections found for seller '${sellerId}'` });
        }

        console.log(`📚 Collections for seller '${sellerId}' updated (${group.collections.length} collections)`);
        return res.status(200).json({ message: `Collections for seller '${sellerId}' updated`, data: group });
    } catch (error) {
        console.error(`Failed to update collections for seller '${sellerId}':`, error);
        return res.status(500).json({ error: 'Failed to update collections', details: error.message });
    }
});

router.post('/collections', async (req, res) => {
    const result = newSellerCollectionsSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result.error, 'a new seller group');

    const { sellerId } = result.data;

    try {
        // Checked up front for the clearer message; createGroup returns null if
        // a concurrent request wins the insert, so the 409 still holds.
        if (await groupExists(sellerId)) {
            return res.status(409).json({
                error: `Seller '${sellerId}' already has collections — update them instead.`
            });
        }

        const group = await createGroup(sellerId, toStoredGroup(result.data));

        if (!group) {
            return res.status(409).json({
                error: `Seller '${sellerId}' already has collections — update them instead.`
            });
        }

        console.log(`📚 Collections created for seller '${sellerId}' (${group.collections.length} collections)`);
        return res.status(201).json({ message: `Collections created for seller '${sellerId}'`, sellerId, data: group });
    } catch (error) {
        console.error(`Failed to create collections for seller '${sellerId}':`, error);
        return res.status(500).json({ error: 'Failed to create collections', details: error.message });
    }
});

module.exports = router;
