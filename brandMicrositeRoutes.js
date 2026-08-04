const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getCollection } = require('./dbConnection');
const { getAllResolvedSellers } = require('./sellerResolver');

// Database Helper
const COLLECTION_NAME = 'brand_microsites';

let indexPromise;

// Explicitly the MONGO_DB_NAME database. This used to be client.db() with no
// argument, and since the connection string carries no database in its path the
// driver silently resolved it to "test" — see migrateBrandMicrosites.js for the
// cutover that moved the documents written there.
const getBrandCollection = async () => {
    const collection = await getCollection(COLLECTION_NAME);

    // Built once per process. A failure is not cached, so the next call retries
    // instead of leaving POST /brand-microsite racing without its unique guard.
    if (!indexPromise) {
        indexPromise = collection
            .createIndex({ brandId: 1 }, { unique: true })
            .catch(error => { indexPromise = undefined; throw error; });
    }
    await indexPromise;

    return collection;
};

// ==========================================
// ZOD VALIDATION SCHEMA
// ==========================================
const brandReviewSchema = z.object({
    name: z.string({ error: "Reviewer name is required" }),
    dpUrl: z.string({ error: "dpUrl is required" }),
    description: z.string({ error: "Review description is required" }),
    stars: z.string({ error: "Stars is required" })
});

const milestoneSchema = z.object({
    year: z.string({ error: "Milestone year is required" }),
    header: z.string({ error: "Milestone header is required" }),
    description: z.string({ error: "Milestone description is required" })
});

const valueSchema = z.object({
    iconTag: z.string({ error: "iconTag is required" }),
    header: z.string({ error: "Value header is required" }),
    description: z.string({ error: "Value description is required" })
});

const specialProductSchema = z.object({
    productId: z.string({ error: "productId is required" }),
    productImageUrl: z.string({ error: "productImageUrl is required" })
});

const brandMicrositeSchema = z.object({
    brandId: z.string({ error: "brandId (seller ID) is required" }),
    brandName: z.string({ error: "brandName is required" }),
    brandMicrositeCoverPhotoUrl: z.string({ error: "brandMicrositeCoverPhotoUrl is required" }),
    specialProducts: z.array(specialProductSchema, { error: "specialProducts must be an array of { productId, productImageUrl }" }),
    mapLocationLink: z.string({ error: "mapLocationLink is required" }),
    brandInfoAttributes: z.object({
        establishedDate: z.string({ error: "establishedDate is required" }),
        numberOfStores: z.number({ error: "numberOfStores must be a number" }),
        numberOfCustomers: z.number({ error: "numberOfCustomers must be a number" }),
        rank: z.string({ error: "rank is required" })
    }),
    brandDescription: z.object({
        title: z.string({ error: "Brand description title is required" }),
        description: z.string({ error: "Brand description is required" })
    }),
    colorCode: z.object({
        primaryColor: z.string({ error: "primaryColor is required" }),
        secondaryColor: z.string({ error: "secondaryColor is required" })
    }),
    ourStory: z.object({
        wallpaperUrl: z.string({ error: "wallpaperUrl is required" }),
        milestones: z.array(milestoneSchema),
        values: z.array(valueSchema),
        tryBeforeBuyImgUrl: z.string({ error: "tryBeforeBuyImgUrl is required" }),
        brandReviews: z.array(brandReviewSchema)
    })
});

// Middleware for validation
const validateBrandMicrosite = (req, res, next) => {
    const result = brandMicrositeSchema.safeParse(req.body);
    if (!result.success) {
        // Zod v4 exposes .issues (.errors was removed in v3 -> v4).
        // Guarded so an unexpected error shape returns 400 instead of throwing a 500.
        const issues = Array.isArray(result.error?.issues) ? result.error.issues : [];

        // Log the full error so a bad payload is always diagnosable. prettifyError
        // itself needs a well-formed .issues, hence the fallback to raw JSON.
        console.error('❌ Brand microsite validation failed:\n', issues.length
            ? z.prettifyError(result.error)
            : JSON.stringify(result.error));

        const errorMessages = issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
        }));

        return res.status(400).json({
            error: 'Validation Failed',
            details: errorMessages.length ? errorMessages : String(result.error)
        });
    }
    req.body = result.data; // Enforce parsed and sanitized data
    next();
};

// Middleware ensuring the brandId maps to a real Magento seller.
// Sellers are keyed as `brandid` (from seller_id, a number) in resolvedSeller.json,
// while brandId here is a string — hence the String() coercion on both sides.
const validateSellerExists = (req, res, next) => {
    const { brandId } = req.body;
    const sellers = getAllResolvedSellers();
    const isRegistered = sellers.some(seller => String(seller.brandid) === String(brandId));

    if (!isRegistered) {
        return res.status(400).json({
            error: `error seller with id '${brandId}' is not registered on magento`
        });
    }

    next();
};

// ==========================================
// ROUTES
// ==========================================

// 1. GET ALL Brand Microsites
router.get('/brand-microsite', async (req, res) => {
    try {
        const collection = await getBrandCollection();
        const brands = await collection.find({}).toArray();
        return res.status(200).json(brands);
    } catch (error) {
        console.error('Error fetching brand microsites:', error);
        return res.status(500).json({ error: 'Failed to fetch brand microsites', details: error.message });
    }
});

// 2. GET ONE Brand Microsite by brandId
router.get('/brand-microsite/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const collection = await getBrandCollection();
        const brand = await collection.findOne({ brandId: id });

        if (!brand) {
            return res.status(404).json({ error: `Brand microsite with id '${id}' not found` });
        }

        return res.status(200).json(brand);
    } catch (error) {
        console.error('Error fetching brand microsite:', error);
        return res.status(500).json({ error: 'Failed to fetch brand microsite', details: error.message });
    }
});

// 3. POST - Create new Brand Microsite
router.post('/brand-microsite', validateBrandMicrosite, validateSellerExists, async (req, res) => {
    try {
        const collection = await getBrandCollection();
        const { brandId } = req.body;

        // Check if brandId already exists
        const existingBrand = await collection.findOne({ brandId });
        if (existingBrand) {
            return res.status(409).json({ error: `Brand microsite with brandId '${brandId}' already exists.` });
        }

        const newBrandData = {
            ...req.body,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await collection.insertOne(newBrandData);
        return res.status(201).json({ message: 'Brand microsite created successfully', data: newBrandData });
    } catch (error) {
        // The unique index on brandId catches the request that loses the race
        // between the findOne above and this insert; it deserves the same 409.
        if (error?.code === 11000) {
            return res.status(409).json({ error: `Brand microsite with brandId '${req.body.brandId}' already exists.` });
        }

        console.error('Error creating brand microsite:', error);
        return res.status(500).json({ error: 'Failed to create brand microsite', details: error.message });
    }
});

// 4. PUT - Update existing Brand Microsite by brandId
router.put('/brand-microsite/:id', validateBrandMicrosite, validateSellerExists, async (req, res) => {
    try {
        const { id } = req.params;
        const collection = await getBrandCollection();

        // Check if path param id matches payload brandId
        if (req.body.brandId !== id) {
            return res.status(400).json({
                error: 'Mismatched ID',
                message: `URL parameter ID '${id}' does not match body brandId '${req.body.brandId}'`
            });
        }

        const updateData = {
            ...req.body,
            updatedAt: new Date()
        };

        const result = await collection.findOneAndUpdate(
            { brandId: id },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!result) {
            return res.status(404).json({ error: `Brand microsite with id '${id}' not found.` });
        }

        return res.status(200).json({ message: 'Brand microsite updated successfully', data: result });
    } catch (error) {
        console.error('Error updating brand microsite:', error);
        return res.status(500).json({ error: 'Failed to update brand microsite', details: error.message });
    }
});

module.exports = router;