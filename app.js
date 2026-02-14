const express = require('express');
const imageRoutes = require('./imageRoutes');
const {getAllResolvedProducts} = require('./productResolver')
const userRoutes = require('./user');
const sellerRoutes = require('./sellerResolver');
const reviewsRoutes = require('./reviewsResolver');
const collectionsRoutes = require('./collections');

const app = express();
const port = 3000;

// Health check (kept in main app)
app.get('/health', (req, res) => res.send('Image Generation Service is running.'));

// Mount all image-related routes
app.use('/', imageRoutes);

app.use('/', userRoutes);

app.use('/', sellerRoutes);

app.use('/', reviewsRoutes);

app.use('/', collectionsRoutes);

app.get('/getAllProducts', async (req, res) => {
    try {
        const products = await getAllResolvedProducts();
        res.status(200).json(products); // send response to client
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Service running at http://localhost:${port}`);
});