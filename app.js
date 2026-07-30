require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const imageRoutes = require('./imageRoutes');
const { getAllResolvedProducts, updateCacheFile } = require('./productResolver')
const userRoutes = require('./user');
const { router: sellerRoutes, writeSellerDataToJson } = require('./sellerResolver');
const reviewsRoutes = require('./reviewsResolver');
const collectionsRoutes = require('./collections');
const {getDbClient}=require('./dbConnection');
const { get } = require('http');
const textSearchRoutes = require('./textSearch');
const multiBrandCollectionsRoutes = require('./multibrandCollection');
const assetsRoutes = require('./assetsResolver');
const brandMicrositeRoutes = require('./brandMicrositeRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

getDbClient().then(client => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1); // Exit if DB connection fails
});

// Health check (kept in main app)
app.get('/health', (req, res) => res.send('Image Generation Service is running. v3'));

// Admin UI (static). Mounted before the routers so /admin never falls through
// to a route handler.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use(express.json());
// Mount all image-related routes
app.use('/', imageRoutes);

app.use('/', multiBrandCollectionsRoutes);

app.use('/', userRoutes);

app.use('/', assetsRoutes);

app.use('/', sellerRoutes);

app.use('/', reviewsRoutes);

app.use('/', collectionsRoutes);

app.use('/', textSearchRoutes);

app.use('/', brandMicrositeRoutes);

app.get('/getAllProducts', async (req, res) => {
    try {
        const products = await getAllResolvedProducts();
        res.status(200).json(products); // send response to client
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Refreshes both JSON caches: sellers first, then products.
// Each stage is reported independently, so a partial failure stays visible
// instead of collapsing into a single boolean.
app.get('/refreshCache', async (req, res) => {
    console.log("♻️ Cache refresh requested");
    const result = { sellers: null, products: null, errors: [] };

    try {
        result.sellers = (await writeSellerDataToJson()).length;
    } catch (error) {
        console.error('Seller refresh failed:', error);
        result.errors.push(`sellers: ${error.message}`);
    }

    try {
        result.products = (await updateCacheFile()).length;
    } catch (error) {
        console.error('Product refresh failed:', error);
        result.errors.push(`products: ${error.message}`);
    }

    const success = result.errors.length === 0;
    return res.status(success ? 200 : 500).json({ success, ...result });
});

app.use(express.json());
app.use('/api/brand-microsite', brandMicrositeRoutes);

// app.get('/getProduct/:sku', async (req, res) => {
//     try {
//         console.log("Received request for product with SKU:", req.params.sku);
//         const { sku } = req.params;

//         const product = await getProductBySku(sku);

//         if (!product) {
//             return res.status(404).json({ message: `Product with SKU ${sku} not found` });
//         }

//         res.status(200).json(product);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: error.message });
//     }
// });

app.listen(port, '0.0.0.0', () => {
    console.log(`Service running at http://0.0.0.0:${port}`);
});