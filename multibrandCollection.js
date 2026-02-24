const express = require('express');
const router = express.Router();

// Your hardcoded data object
const data = [
      {
        "id": 66,
        "name": "Celora",
        "collectionBannerUrl": "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FCelora%201.webp?alt=media&token=90bdced5-d637-460c-8e7c-8148def591a3"
      },
      {
        "id": 67,
        "name": "Aurelia",
        "collectionBannerUrl": "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FAurelia.webp?alt=media&token=f894ceea-1cd0-4586-95c8-e6f7809adfb5"
      },
      {
        "id": 68,
        "name": "Parampara",
        "collectionBannerUrl": "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FParampara.webp?alt=media&token=cdf2ea54-aaa1-4053-a408-cbf83b04c248"
      },
      {
        "id": 69,
        "name": "Rajwada",
        "collectionBannerUrl": "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FRajwada.webp?alt=media&token=c8e2f08e-3cf3-4a8b-acc8-de0fe60c1312"
      },
      {
        "id": 70,
        "name": "Vanika",
        "collectionBannerUrl": "https://firebasestorage.googleapis.com/v0/b/igmjewellery.firebasestorage.app/o/Collections%2FVanika.webp?alt=media&token=768be314-5c93-4316-8819-42c4788312d7"
      }
    ]


// Simplified Route
router.get('/multibrandCollections', (req, res) => {
    console.log("Serving multibrand collections from memory");
    
    // Express automatically sets the Content-Type to application/json
    res.status(200).json(data);
});

module.exports = router;