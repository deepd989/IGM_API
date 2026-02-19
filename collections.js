const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getAllResolvedProducts } = require('./productResolver');

// Path to your local JSON storage
const OUTPUT_FILE = path.join(__dirname, 'collectionOutputData.json');

router.get('/getCollections', async (req, res) => {
    try {
        // 1. Take flag from env variable (defaulting to false)
        const useLiveCollectionData = process.env.USE_LIVE_COLLECTION_DATA === 'true';

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

            // 6. Write the structured object to the JSON file
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(collectionsBySeller, null, 2));
            
            responseData = collectionsBySeller;

        } else {
            // 7. If not live, read the existing JSON file
            try {
                const fileContent = await fs.readFile(OUTPUT_FILE, 'utf8');
                responseData = JSON.parse(fileContent);
            } catch (fileError) {
                return res.status(404).json({ 
                    error: 'Local data file not found and USE_LIVE_COLLECTION_DATA is false.' 
                });
            }
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

module.exports = router;