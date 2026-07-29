const fs = require('fs');
const path = require('path');
const { HEADERS, BASE_URL } = require('./config');
const { getVideoUrlByName } = require('./ImmersiveVideoFetcher');

const CACHE_FILE = path.join(__dirname, 'products.json');

const cache = {
    attributes: {},
    categories: null,
    sellers: null,
    products: {}
};

/**
 * Wipes the in-process memo cache so the next resolve is a genuine refetch.
 * Without this, a second resolve in the same process would short-circuit on
 * cache.products / cache.sellers and re-emit the previous run's data.
 */
function clearMemoryCache() {
    cache.attributes = {};
    cache.categories = null;
    cache.sellers = null;
    cache.products = {};
}

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
 * THE RESOLVERS OBJECT
 */
const resolvers = {
    async categoriesParser(key, idValue) {
        if (!idValue) return null;
        if (!cache.categories) {
            try {
                const response = await fetch(`${BASE_URL}/default/V1/categories`, { headers: HEADERS });
                cache.categories = await response.json();
            } catch (err) {
                return idValue;
            }
        }

        const findNameById = (node, targetId) => {
            if (node.id.toString() === targetId.toString()) return node.name;
            if (node.children_data) {
                for (let child of node.children_data) {
                    const foundName = findNameById(child, targetId);
                    if (foundName) return foundName;
                }
            }
            
        };
        return findNameById(cache.categories, idValue) || idValue;
    },

    async fetchLabelResolver(key, value) {
        if (!value) return value;
        if (!cache.attributes[key]) {
            try {
                const response = await fetch(`${BASE_URL}/V1/products/attributes/${key}/options`, { headers: HEADERS });
                const options = await response.json();
                const map = {};
                options.forEach(opt => { if (opt.value) map[opt.value] = opt.label; });
                cache.attributes[key] = map;
            } catch (err) {
                cache.attributes[key] = {};
                return value;
            }
        }
        return cache.attributes[key][value] || value;
    },
    async fetchLabelResolverStringToArray(key, value) {
        if (!value) return value;
        const values = Array.isArray(value) ? value : value.split(',').map(v => v.trim());
        const resolvedValues = await Promise.all(values.map(val => resolvers.fetchLabelResolver(key, val)
        ));
        return resolvedValues.join(', ');
    },

    cleanHTML: (key, value) => (typeof value === 'string' ? value.replace(/<\/?[^>]+(>|$)/g, "") : value)
};

const resolverMap = {
    "category_ids": "categoriesParser",
    "sub_cat": "categoriesParser",
    "metal_type": "fetchLabelResolver",
    "ring_size_us": "fetchLabelResolver",
    "stone_type": "fetchLabelResolver",
    "short_description": "cleanHTML",
    "long_description": "cleanHTML",
    "default": "fetchLabelResolver",
    "occasion_tags": "fetchLabelResolverStringToArray",
};

async function processProduct(product) {
    const media = product.media_gallery_entries || [];
    const mediaFiles = media.map((object) => {
        const url = object.file ? `https://www.experapps.xyz/media/catalog/product${object.file}` : null;
        return { file: url, label: object.label };
    });
    
    const pId = product.entity_id || product.id;
    if (cache.products[pId]) return cache.products[pId];

    if (!product.custom_attributes) return { ...product, media_gallery_entries: mediaFiles };

    const updatedAttributes = await Promise.all(
        product.custom_attributes.map(async (attr) => {
            const key = attr.attribute_code;
            const val = attr.value;
            const functionName = resolverMap[key] || resolverMap["default"];

            let resolvedValue;
            if (Array.isArray(val)) {
                resolvedValue = await Promise.all(val.map(item => resolvers[functionName](key, item)));
            } else {
                resolvedValue = await resolvers[functionName](key, val);
            }

            return { attribute_code: key, value: resolvedValue };
        })
    );

    let immersiveVideoUrl=null
    const vendor_sku=product.custom_attributes.find((attr) => attr.attribute_code === "vendor_sku")?.value;
    if(vendor_sku){
        immersiveVideoUrl = getVideoUrlByName(`${vendor_sku}.mp4`);

    }

    const processedProduct = { ...product, media_gallery_entries: mediaFiles, custom_attributes: updatedAttributes, immersiveVideoUrl };
    if (pId) cache.products[pId] = processedProduct;
    return processedProduct;
}

/**
 * MAIN ENTRY POINT
 * Always serves from the local products.json cache — never hits the API.
 * Use updateCacheFile() to refresh the cache.
 */
async function getAllResolvedProducts() {
    const localCache = readLocalCache();
    if (!localCache || !localCache.data) {
        console.warn("⚠️ No local products.json cache found. Run updateCacheFile() to populate it.");
        return [];
    }

    console.log("📦 Returning data from local products.json (Cache hit)");
    return localCache.data;
}

/**
 * Fetches sellers + their products from the API and resolves every attribute.
 * Does not touch the cache file.
 */
async function resolveProducts() {
    console.log("🌐 Fetching from API...");
    clearMemoryCache();
    const allProcessedProducts = [];

    if (!cache.sellers) {
        const sellersRes = await fetch(`${BASE_URL}/V1/mpapi/sellers?searchCriteria=""`, { headers: HEADERS });
        const sellersData = await sellersRes.json();
        cache.sellers = sellersData.items || [];
    }

    for (const item of cache.sellers) {
        const sId = item.seller_data.seller_id;
        const pRes = await fetch(`${BASE_URL}/V1/mpapi/admin/sellers/${sId}/product`, { headers: HEADERS });
        if (!pRes.ok) continue;

        let products = await pRes.json();
        products = Array.isArray(products) ? products : [products];

        for (const prod of products) {
            const updated = await processProduct(prod);
            allProcessedProducts.push({ updated, sellerId: sId });
        }
    }

    console.log(`✅ Pipeline Complete. Processed ${allProcessedProducts.length} products.`);
    return allProcessedProducts;
}

/**
 * Refreshes products.json with a freshly resolved product list.
 * Throws on failure so the caller can report it — the existing cache file is
 * left untouched, since the write only happens after a successful resolve.
 */
async function updateCacheFile() {
    const allProcessedProducts = await resolveProducts();
    writeLocalCache(allProcessedProducts);
    console.log(`💾 Cache file updated with ${allProcessedProducts.length} products.`);
    return allProcessedProducts;
}

module.exports = { getAllResolvedProducts, resolveProducts, updateCacheFile };