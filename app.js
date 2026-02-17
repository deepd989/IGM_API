require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRoutes = require('./imageRoutes');
const { getAllResolvedProducts } = require('./productResolver')
const userRoutes = require('./user');
const sellerRoutes = require('./sellerResolver');
const reviewsRoutes = require('./reviewsResolver');
const collectionsRoutes = require('./collections');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.listen(port, '0.0.0.0', () => {
    console.log(`Service running at http://0.0.0.0:${port}`);
});