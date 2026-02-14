const { HEADERS, BASE_URL } = require('./config'); // Clean destructuring
const express = require('express');
const router = express.Router();

router.get('/getSellers', async (req, res) => {
    const url = `${BASE_URL}/V1/mpapi/sellers?searchCriteria=%22%22`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: HEADERS
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'External API error couldnt fetch brands' });
        }

        const data = await response.json();

        const formattedSellers = (data.items || [])
            .map(item => {
            const seller = item.seller_data || {}; 
                    return {
                        brandid: seller.seller_id,
                        brandName: seller.shop_title,
                        logoPic: seller.logo_pic? `https://www.experapps.xyz/media/avatar/${seller.logo_pic}` : null,
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
    res.json(formattedSellers);

    } catch (error) {
        res.status(500).json({ error: 'Server error while fetching brands', details: error.message });
    }
});

module.exports = router;