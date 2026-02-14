const { HEADERS, BASE_URL } = require('./config'); // Clean destructuring
const express = require('express');
const router = express.Router();

router.get('/getReviews/:sku', async (req, res) => {

    const url = `${BASE_URL}/V1/products/${req.params.sku}/reviews`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: HEADERS
        });
        if (!response.ok) {
            return res.status(response.status).json({ error: 'External API error couldnt fetch brands' });
        }

        const data = await response.json();
        const transformed = Array.isArray(data) ? data.map(r => ({
            title: r.title,
            description: r.detail,
            username: r.nickname,
            rating: Math.round((Math.random() * (5 - 3) + 3) * 10) / 10
        })) : [];

        return res.json(transformed);


    } catch (error) {
    res.status(500).json({ error: 'Server error while fetching reviews', details: error.message });
}

})

module.exports = router;