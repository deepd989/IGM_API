const HEADERS =require('./config').HEADERS;
const BASE_URL =require('./config').BASE_URL;


/**
 * CACHE STORE
 * In a production environment, you might replace these with Redis.
 */
const cache = {
    attributes: {},      // { attribute_code: { value: label } }
    categories: null,    // Full category tree
    sellers: null,       // List of all sellers
    products: {}         // { productId: resolvedProductObject }
};

/**
 * THE RESOLVERS OBJECT
 */
const resolvers = {
    async categoriesParser(key, idValue) {
        if (!idValue) return null;
        
        // 1. Cache Check
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
            return null;
        };
        return findNameById(cache.categories, idValue) || idValue;
    },

    async fetchLabelResolver(key, value) {
        if (!value) return value;
        
        // 2. Cache Check (Nested by attribute key)
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

    cleanHTML: (key, value) => (typeof value === 'string' ? value.replace(/<\/?[^>]+(>|$)/g, "") : value)
};

const resolverMap = {
    "category_ids": "categoriesParser",
    "sub_cat": "categoriesParser",
    "metal_type": "fetchLabelResolver",
    "ring_size_us": "fetchLabelResolver",
    "stone_type": "fetchLabelResolver",
    "short_description": "fetchLabelResolver",
    "long_description": "fetchLabelResolver",
    "default": "fetchLabelResolver"
};

/**
 * CORE LOGIC
 */
async function processProduct(product) {
    // 3. Product Cache Check (using entity_id or id)
    const media=product.media_gallery_entries || [];
    const mediaFiles=media.map((object)=>{
        const url=object.file ? `https://www.experapps.xyz/media/catalog/product${object.file}` : null;
        return {file:url,label:object.label};
    })
    const pId = product.entity_id || product.id;
    if (cache.products[pId]) return cache.products[pId];

    if (!product.custom_attributes) return product;

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

    const processedProduct = { ...product,media_gallery_entries:mediaFiles, custom_attributes: updatedAttributes };
    
    // Save to cache
    if (pId) cache.products[pId] = processedProduct;
    
    return processedProduct;
}

async function getAllResolvedProducts() {
    const allProcessedProducts = [];

    try {
        console.log("🚀 Starting Data Replacement Pipeline...");

        // 4. Seller Cache Check
        if (!cache.sellers) {
            const sellersRes = await fetch(`${BASE_URL}/V1/mpapi/sellers?searchCriteria=""`, { headers: HEADERS });
            const sellersData = await sellersRes.json();
            cache.sellers = sellersData.items || [];
        }

        for (const item of cache.sellers) {
            const sId = item.seller_data.seller_id;
            console.log(`Processing Seller: ${sId}`);

            const pRes = await fetch(`${BASE_URL}/V1/mpapi/admin/sellers/${sId}/product`, { headers: HEADERS });
            if (!pRes.ok) continue;

            let products = await pRes.json();
            products = Array.isArray(products) ? products : [products];

            for (const prod of products) {
                const updated = await processProduct(prod);

                allProcessedProducts.push({updated, sellerId: sId});
            }
        }
        console.log(`✅ Pipeline Complete. Processed ${allProcessedProducts.length} products.`);
        return allProcessedProducts;

    } catch (e) {
        console.error("❌ Pipeline Error:", e);
    }
}

module.exports = {
    getAllResolvedProducts,
    cache // Exported so you can clear it if needed
};