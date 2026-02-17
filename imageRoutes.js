const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- AI Setup & Constants ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
const IMAGE_DIR = path.join(__dirname, 'images');

if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

// --- Helper Functions ---
const getStoredUserFace = (userId) => {
    const filePath = path.join(IMAGE_DIR, `dp_${userId}.png`);
    if (!fs.existsSync(filePath)) return null;
    return {
        inlineData: { data: fs.readFileSync(filePath).toString('base64'), mimeType: 'image/png' }
    };
};

const buildPromptText = (outfitType, outfitColor, files) => {
    let outfitStr = outfitType 
        ? `The person in the first image (userFace) should be wearing a ${outfitColor ? outfitColor + ' ' : ''}${outfitType} outfit.`
        : `Choose an elegant outfit and color that perfectly matches and complements the jewelry provided in the images.`;

    let text = `Create a professional high-quality fashion photograph. ${outfitStr} 
                It is extremely important to clearly show and prominently feature all the jewelry items provided.`;

    const instructions = {
        earring: " Incorporate the earrings.",
        necklace: " The person should be wearing the necklace prominently.",
        pendant: " The person should be wearing the pendant.",
        ring: " Include the ring on the person's hand.",
        bracelet: " The person should be wearing the bracelet.",
        bangle: " The person should be wearing the bangle."
    };

    Object.keys(instructions).forEach(key => { if (files[key]) text += instructions[key]; });
    text += " Ensure the person's facial features remain consistent with the first image. Lighting should be studio-quality.";
    return text;
};

const callGeminiImageGenerator = async (promptParts) => {
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: promptParts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const response = await result.response;
    return response.candidates[0].content.parts.find(p => p.inlineData);
};

const fetchImageFromUrl = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return { inlineData: { data: Buffer.from(response.data).toString('base64'), mimeType: response.headers['content-type'] || 'image/jpeg' } };
};

// --- Endpoints ---

router.post('/uploadDp', upload.single('userFace'), (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId || !req.file) return res.status(400).json({ error: "userId and userFace required." });
        fs.writeFileSync(path.join(IMAGE_DIR, `dp_${userId}.png`), req.file.buffer);
        res.status(200).json({ message: "Profile picture uploaded." });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/generateImageByUrl', upload.none(), async (req, res) => {
    try {
        const { userId, productId, outfitType = 'any outfit that goes with the jewellery', outfitColor = 'any color', jewelleryUrls } = req.body;
        const urls = JSON.parse(jewelleryUrls || "{}");
        if (!userId || !productId) return res.status(400).json({ error: "userId and productId are required." });

        const fileName = `${productId}_${userId}`;
        const filePath = path.join(IMAGE_DIR, `${fileName}.png`);

        if (fs.existsSync(filePath)) {
            res.set('Content-Type', 'image/png');
            return res.send(fs.readFileSync(filePath));
        }

        const userFace = getStoredUserFace(userId);
        console.log("User face retrieved:", !!userFace);
        if (!userFace) return res.status(404).json({ error: "User profile picture not found." });

        const promptText = buildPromptText(outfitType, outfitColor, urls);
        const remoteImages = await Promise.all(Object.keys(urls).map(key => fetchImageFromUrl(urls[key])));
        
        const imagePart = await callGeminiImageGenerator([{ text: promptText }, userFace, ...remoteImages]);
        const imgBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
        
        fs.writeFileSync(filePath, imgBuffer);
        res.set('Content-Type', imagePart.inlineData.mimeType);
        res.send(imgBuffer);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/getImage/:id', (req, res) => {
    const filePath = path.join(IMAGE_DIR, `${req.params.id}.png`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Image not found." });
    res.set('Content-Type', 'image/png');
    res.send(fs.readFileSync(filePath));
});

module.exports = router;