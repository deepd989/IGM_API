const express = require('express');
const imageRoutes = require('./imageRoutes');
const {getAllResolvedProducts} = require('./productResolver')
const userRoutes = require('./user');
const sellerRoutes = require('./sellerResolver');
const reviewsRoutes = require('./reviewsResolver');
const collectionsRoutes = require('./collections');
const {getDbClient}=require('./dbConnection');
const { get } = require('http');
const textSearchRoutes = require('./textSearch');

const app = express();
const port = 3000;
const cors = require('cors');

const corsOptions = {
    origin: '*', // Allow only your client's address
    optionsSuccessStatus: 200 
  };
  
  // Apply the middleware
  app.use(cors(corsOptions));


getDbClient().then(client => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1); // Exit if DB connection fails
});

// Health check (kept in main app)
app.get('/health', (req, res) => res.send('Image Generation Service is running.'));

app.use(express.json());
// Mount all image-related routes
app.use('/', imageRoutes);

app.use('/', userRoutes);

app.use('/', sellerRoutes);

app.use('/', reviewsRoutes);

app.use('/', collectionsRoutes);

app.use('/', textSearchRoutes);

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