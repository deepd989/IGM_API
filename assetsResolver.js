const express = require('express');
const router = express.Router();

const assetMap = {
   "homeGiftCard":"https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Gifting%20Banner%2FGifting_banner-05.webp?alt=media&token=5b1e9a31-d5c7-47ee-bf47-8abcca8b5475"
};


router.get('/getAsset/:key', (req, res) => {
    const key = req.params.key;
    const assetValue = assetMap[key];

    if (assetValue) {
        // Return the value associated with the key
        res.redirect(302, assetValue);
    } else {
        // Handle cases where the key doesn't exist
        res.redirect(302, "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Pop%20Up%20Try%20On%20Buttons%2Fmagic%20search-11.webp?alt=media&token=87f0543b-2c86-456d-a1b5-ddb2127e15ca");
    }
});

module.exports = router;

