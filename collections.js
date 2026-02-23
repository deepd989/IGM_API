const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getAllResolvedProducts } = require('./productResolver');

// Path to your local JSON storage
const OUTPUT_FILE = path.join(__dirname, 'collectionOutputData.json');

const imageUrls = [
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%201.webp?alt=media&token=9df35246-e19d-4758-aceb-79bc28796b68",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%202.webp?alt=media&token=8dded7d7-3586-45d2-b81b-9e415d744901",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%203.webp?alt=media&token=846f9647-9a8a-48fb-8568-5e3fb610ecee",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%204.webp?alt=media&token=4f82cb08-91cd-4e2a-9b4b-9ecd22c5d526",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%205.webp?alt=media&token=95c50eed-2913-4f56-9250-b33c51adb520",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%206.webp?alt=media&token=16c29c4d-969c-4dd5-bb8d-1b5f3ada66e7",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%207.webp?alt=media&token=b69117dd-5bdc-4a5e-8b9d-1b9a06ad8d9a",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%208.webp?alt=media&token=fcc085d2-d4ae-4f89-ae58-ddb7f77216cf",
    "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FArtboard%209.webp?alt=media&token=22fc4508-67fe-4762-afc8-937bcba33e1c"
  ];
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