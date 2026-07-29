const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getDbClient } = require('./dbConnection');
const { getAllResolvedSellers } = require('./sellerResolver');

// Database Helper
const COLLECTION_NAME = 'brand_microsites';
const getCollection = async () => {
    const client = await getDbClient();
    return client.db().collection(COLLECTION_NAME);
};

// ==========================================
// ZOD VALIDATION SCHEMA
// ==========================================
const brandReviewSchema = z.object({
    name: z.string({ required_error: "Reviewer name is required" }),
    dpUrl: z.string({ required_error: "dpUrl is required" }),
    description: z.string({ required_error: "Review description is required" }),
    stars: z.string({ required_error: "Stars is required" })
});

const milestoneSchema = z.object({
    year: z.string({ required_error: "Milestone year is required" }),
    header: z.string({ required_error: "Milestone header is required" }),
    description: z.string({ required_error: "Milestone description is required" })
});

const valueSchema = z.object({
    iconTag: z.string({ required_error: "iconTag is required" }),
    header: z.string({ required_error: "Value header is required" }),
    description: z.string({ required_error: "Value description is required" })
});

const brandMicrositeSchema = z.object({
    brandId: z.string({ required_error: "brandId (seller ID) is required" }),
    brandName: z.string({ required_error: "brandName is required" }),
    specialProductIds: z.array(z.string(), { required_error: "specialProductIds must be an array of strings" }),
    mapLocationLink: z.string({ required_error: "mapLocationLink is required" }),
    brandInfoAttributes: z.object({
        establishedDate: z.string({ required_error: "establishedDate is required" }),
        numberOfStores: z.number({ required_error: "numberOfStores must be a number" }),
        numberOfCustomers: z.number({ required_error: "numberOfCustomers must be a number" }),
        rank: z.string({ required_error: "rank is required" })
    }),
    brandDescription: z.object({
        title: z.string({ required_error: "Brand description title is required" }),
        description: z.string({ required_error: "Brand description is required" })
    }),
    colorCode: z.object({
        primaryColor: z.string({ required_error: "primaryColor is required" }),
        secondaryColor: z.string({ required_error: "secondaryColor is required" })
    }),
    ourStory: z.object({
        wallpaperUrl: z.string({ required_error: "wallpaperUrl is required" }),
        milestones: z.array(milestoneSchema),
        values: z.array(valueSchema),
        tryBeforeBuyImgUrl: z.string({ required_error: "tryBeforeBuyImgUrl is required" }),
        brandReviews: z.array(brandReviewSchema)
    })
});

// Middleware for validation
const validateBrandMicrosite = (req, res, next) => {
    const result = brandMicrositeSchema.safeParse(req.body);
    if (!result.success) {
        const errorMessages = result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
        }));
        return res.status(400).json({
            error: 'Validation Failed',
            details: errorMessages
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
        const collection = await getCollection();
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
        const collection = await getCollection();
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
        const collection = await getCollection();
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
        console.error('Error creating brand microsite:', error);
        return res.status(500).json({ error: 'Failed to create brand microsite', details: error.message });
    }
});

// 4. PUT - Update existing Brand Microsite by brandId
router.put('/brand-microsite/:id', validateBrandMicrosite, validateSellerExists, async (req, res) => {
    try {
        const { id } = req.params;
        const collection = await getCollection();

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