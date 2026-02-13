const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-image" 
});

const upload = multer({ storage: multer.memoryStorage() });

// Create a directory for images if it doesn't exist
const IMAGE_DIR = path.join(__dirname, 'images');
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}



const formatFileForGemini = (file) => ({
    inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype
    }
});

const getStoredUserFace = (userId) => {
    const fileName = `dp_${userId}.png`;
    const filePath = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;

    const buffer = fs.readFileSync(filePath);
    return {
        inlineData: {
            data: buffer.toString('base64'),
            mimeType: 'image/png'
        }
    };
};


const buildPromptText = (outfitType, outfitColor, files) => {
    let outfitStr = outfitType 
        ? `The person in the first image (userFace) should be wearing a ${outfitColor ? outfitColor + ' ' : ''}${outfitType} outfit.`
        : `Choose an elegant outfit and color that perfectly matches and complements the jewelry provided in the images.`;

    let text = `Create a professional high-quality fashion photograph. ${outfitStr} 
                It is extremely important to clearly show and prominently feature all the jewelry items provided. 
                The jewelry should be rendered with high detail and be clearly visible.`;

    // Map jewelry types to specific prompt instructions
    const instructions = {
        earring: " Incorporate the earrings. Ensure they are clearly visible, possibly in a close-up angle.",
        necklace: " The person should be wearing the necklace prominently.",
        pendant: " The person should be wearing the pendant.",
        ring: " Include the ring on the person's hand. Make sure the hand is visible.",
        bracelet: " The person should be wearing the bracelet. Ensure the wrist is visible.",
        bangle: " The person should be wearing the bangle. Ensure the wrist is visible."
    };

    Object.keys(instructions).forEach(key => {
        if (files[key]) text += instructions[key];
    });

    text += " Ensure the person's facial features remain consistent with the first image. Lighting should be studio-quality. Dont show extra jewllery other than what is provided.";
    return text;
};

const callGeminiImageGenerator = async (promptParts) => {
    console.log("Calling Gemini model with prompt parts:", promptParts);
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: promptParts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });
    
    const response = await result.response;
    return response.candidates[0].content.parts.find(p => p.inlineData);
};



const fetchImageFromUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      headers: {
        // Helps Google Drive return the actual file
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/*'
      }
    });

    const mimeType =
      response.headers['content-type']?.includes('image')
        ? response.headers['content-type']
        : 'image/jpeg'; // fallback

    const base64Data = Buffer.from(response.data).toString('base64');

    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };
  } catch (error) {
    throw new Error(`Failed to fetch image from URL: ${url}`);
  }
};


const saveImageToDisk = (buffer, filename) => {
    const filePath = path.join(IMAGE_DIR, `${filename}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
};

const validateUserIdProductId = (req) => {
    if (!req.body.userId || !req.body.productId) {
        return { valid: false, message: "userId and productId are required." };
    }
    return { valid: true };
};

// --- 3. Controller / Route ---

app.post('/uploadDp', upload.single('userFace'), (req, res) => {
    try {
        const { userId } = req.body;
        const file = req.file;

        if (!userId || !file) {
            return res.status(400).json({ error: "userId and userFace image are required." });
        }

        const fileName = `dp_${userId}.png`;
        const filePath = path.join(IMAGE_DIR, fileName);

        fs.writeFileSync(filePath, file.buffer);

        res.status(200).json({ 
            message: "Profile picture uploaded successfully.",
            fileName: fileName 
        });
    } catch (error) {
        console.error("DP Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});


app.get('/health', (req, res) => {
    res.send('Image Generation Service is running.');
});


app.post('/generateImageByUrl',upload.none(), async (req, res) => {
    try {
        console.log("Received generateImageByUrl request with body:", req.body);
        const userId = req.body.userId;
        const productId = req.body.productId;
        const outfitType = req.body.outfitType || 'suit';
        const outfitColor = req.body.outfitColor || 'black';
        const { jewelleryUrls } = req.body; 

        const urls = JSON.parse(jewelleryUrls || "{}");
        const validation = validateUserIdProductId(req);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }

        const fileName = `${productId}_${userId}_${outfitType}_${outfitColor}`;
        const filePath = path.join(IMAGE_DIR, `${fileName}.png`);
        if (fs.existsSync(filePath)) {
            console.log("Image found in cache, returning existing file.");
            const cachedImg = fs.readFileSync(filePath);
            res.set('Content-Type', 'image/png');
            return res.send(cachedImg);
        }

        const userFace = getStoredUserFace(userId);
        if (!userFace) {
            console.log("user face not found for userId:", userId);
            return res.status(200).json({ error: "User profile picture not found. Please upload DP first." });
        }

        // 1. Build Text Instruction (passing keys from URLs object)
        const promptText = buildPromptText(outfitType, outfitColor, urls);

        // 2. Prepare Multimodal Parts
        const promptParts = [{ text: promptText }];

        promptParts.push(userFace);
        
        // Add jewelry images (from URLs)
        const urlKeys = Object.keys(urls);
        const imageFetchPromises = urlKeys.map(key => fetchImageFromUrl(urls[key]));
        const remoteImages = await Promise.all(imageFetchPromises);
        
        promptParts.push(...remoteImages);

        // 3. Request Generation
        const imagePart = await callGeminiImageGenerator(promptParts);

        if (!imagePart) {
            throw new Error("Model failed to generate an image.");
        }

        // 4. Send Response
        const imgBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
        saveImageToDisk(imgBuffer, fileName);
        res.set('Content-Type', imagePart.inlineData.mimeType);
        res.send(imgBuffer);

    } catch (error) {
        console.error("URL Generation Error:", error);
        res.status(500).json({ error: error.message });
    }});

    app.get('/getImage/:id', (req, res) => {
     
        const fileName = req.params.id; // e.g., "productId_userId"
        console.log("Fetching image for ID:", fileName);
        const filePath = path.join(IMAGE_DIR, `${fileName}.png`);
        console.log("Resolved file path:", filePath);
        // Check if the file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Image not found." });
        }
    
        try {
            // Read the file into a buffer
            const imgBuffer = fs.readFileSync(filePath);
    
            // Set the header to match the generateImage response format
            res.set('Content-Type', 'image/png');
            
            // Send the buffer directly
            res.send(imgBuffer);
        } catch (error) {
            res.status(500).json({ error: "Error reading image from disk." });
        }

    
});

app.listen(port, () => {
    console.log(`Service running at http://localhost:${port}`);
});