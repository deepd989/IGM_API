const fs = require('fs');
const path = require('path');
const { HEADERS, BASE_URL } = require('./config'); // Clean destructuring
const express = require('express');
const router = express.Router();

const CACHE_FILE = path.join(__dirname, 'resolvedSeller.json');

/**
 * FILE I/O HELPERS
 */
function readLocalCache() {
    if (!fs.existsSync(CACHE_FILE)) return null;
    try {
        const rawData = fs.readFileSync(CACHE_FILE, 'utf8');
        return JSON.parse(rawData);
    } catch (e) {
        return null;
    }
}

function writeLocalCache(data) {
    const payload = {
        fetchedAt: Date.now(),
        data: data
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2));
}

/**
 * MAIN ENTRY POINT
 * Always serves from resolvedSeller.json — never hits the API.
 * Use writeSellerDataToJson() to refresh the file.
 */
function getAllResolvedSellers() {
    const localCache = readLocalCache();
    if (!localCache || !localCache.data) {
        console.warn("⚠️ No local resolvedSeller.json found. Run writeSellerDataToJson() to populate it.");
        return [];
    }

    console.log("📦 Returning sellers from local resolvedSeller.json (Cache hit)");
    return localCache.data;
}

/**
 * Fetches every seller from the API and formats them.
 * Does not touch the cache file.
 */
async function refreshSellerData() {
    console.log("🌐 Fetching sellers from API...");
    const url = `${BASE_URL}/V1/mpapi/sellers?searchCriteria=%22%22`;

    const response = await fetch(url, {
        method: 'GET',
        headers: HEADERS
    });

    if (!response.ok) {
        throw new Error(`External API error couldnt fetch brands (status ${response.status})`);
    }

    const data = await response.json();

    const formattedSellers = (data.items || [])
        .map(item => {
            const seller = item.seller_data || {};
            return {
                brandid: seller.seller_id,
                brandName: seller.shop_title,
                logoPic: seller.logo_pic ? `https://www.experapps.xyz/media/avatar/${seller.logo_pic}` : null,
                description: seller.company_description,
                tagline: seller.shipping_policy
            };
        })
        .filter(seller => {
            return !(
                seller.brandName === null &&
                seller.logoPic === null &&
                seller.description === null &&
                seller.tagline === null
            );
        });

    console.log(`✅ Seller Pipeline Complete. Processed ${formattedSellers.length} sellers.`);
    return formattedSellers;
}

/**
 * Refreshes resolvedSeller.json with a freshly fetched seller list.
 * Throws on failure so the caller can report it — the existing cache file is
 * left untouched, since the write only happens after a successful fetch.
 */
async function writeSellerDataToJson() {
    const formattedSellers = await refreshSellerData();
    writeLocalCache(formattedSellers);
    console.log(`💾 resolvedSeller.json updated with ${formattedSellers.length} sellers.`);
    return formattedSellers;
}

router.get('/getSellers', async (req, res) => {
    console.log("getting sellers")
    try {
        res.json(getAllResolvedSellers());
    } catch (error) {
        res.status(500).json({ error: 'Server error while fetching brands', details: error.message });
    }
});

module.exports = { router, getAllResolvedSellers, refreshSellerData, writeSellerDataToJson };
