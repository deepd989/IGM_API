const { HEADERS, BASE_URL } = require('./config'); // Clean destructuring
const express = require('express');
const router = express.Router();
const {getAllResolvedProducts} = require('./productResolver')


const useCollectionCache = false;

router.get('/getCollections', async (req, res) => {
    try {
        let products
        if (!useCollectionCache) {
            let data = await getAllResolvedProducts();
            products = data.map(item => {return {...item.updated, sellerId: item.sellerId}});
        } else {
            products = []; 
        }

        const collectionsBySeller = {};

        products.forEach(product => {
            const attributes = product.custom_attributes || [];

            // 1. Extract values from custom_attributes array
            const rawCollectionId = attributes.find(attr => attr.attribute_code === 'collection_id')?.value || "";
            const sellerId = product.sellerId; // Assuming sellerId is directly available on the product object

            if (!sellerId) return; // Skip if no seller associated

            // 2. Get the first word from the comma-separated collection string
            const firstCollection = rawCollectionId.split(',')[0].trim();
            if (!firstCollection) return; // Skip if collection is empty

            // 3. Initialize seller entry if it doesn't exist
            if (!collectionsBySeller[sellerId]) {
                collectionsBySeller[sellerId] = [];
            }

            // 4. Find or create the collection entry for this seller
            let collectionEntry = collectionsBySeller[sellerId].find(c => c.collectionName === firstCollection);

            if (!collectionEntry) {
                collectionEntry = {
                    collectionName: firstCollection,
                    productSkus: []
                };
                collectionsBySeller[sellerId].push(collectionEntry);
            }

            // 5. Add product SKU to the list
            if (product.sku) {
                collectionEntry.productSkus.push(product.sku);
            }
        });

        res.json(collectionsBySeller);

    } catch (error) {
        res.status(500).json({ error: 'Failed to process collections', details: error.message });
    }
});


module.exports = router;