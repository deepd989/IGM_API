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
const IMAGE_DIR = path.join(__dirname, 'generated_images');
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

const formatFileForGemini = (file) => ({
    inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype
    }
});

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

const validateRequest = (req) => {
    if (!req.body.userId || !req.body.productId) {
        return { valid: false, message: "userId and productId are required." };
    }

    // Check if userFace exists in either .file (single) or .files (fields)
    const userFace = req.file || (req.files && req.files['userFace'] ? req.files['userFace'][0] : null);
    
    if (!userFace) {
        return { valid: false, message: "userFace image is required." };
    }

    return { valid: true };
};

// --- 3. Controller / Route ---

app.post('/generateImage', upload.fields([
    { name: 'userFace', maxCount: 1 },
    { name: 'earring', maxCount: 1 }, 
    { name: 'necklace', maxCount: 1 },
    { name: 'ring', maxCount: 1 },
    { name: 'pendant', maxCount: 1 },
    { name: 'bracelet', maxCount: 1 },
    { name: 'bangle', maxCount: 1 }
]), async (req, res) => {
    try {
        const userId = req.body.userId;
        const productId = req.body.productId;
        const outfitType = req.body.outfitType || 'suit';
        const outfitColor = req.body.outfitColor || 'black';

        // Validation
        const validation = validateRequest(req);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }
        



        // 1. Build Text Instruction
        const promptText = buildPromptText(outfitType, outfitColor, files);

        // 2. Prepare Multimodal Parts (Text + Images)
        const promptParts = [{ text: promptText }];
        
        // Add all uploaded images to the parts array
        Object.keys(files).forEach(key => {
            promptParts.push(formatFileForGemini(files[key][0]));
        });

        // 3. Request Generation
        const imagePart = await callGeminiImageGenerator(promptParts);

        if (!imagePart) {
            throw new Error("Model failed to generate an image.");
        }

        // 4. Send Response
        const imgBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
        const fileName = `${productId}_${userId}`;
        saveImageToDisk(imgBuffer, fileName);
        res.set('Content-Type', imagePart.inlineData.mimeType);
        res.send(imgBuffer);

    } catch (error) {
        console.error("Generation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/generateImageByUrl', upload.single('userFace'), async (req, res) => {
    try {
        const userId = req.body.userId;
        const productId = req.body.productId;
        const outfitType = req.body.outfitType || 'suit';
        const outfitColor = req.body.outfitColor || 'black';
        const { jewelleryUrls } = req.body; 

        const urls = JSON.parse(jewelleryUrls || "{}");
        const validation = validateRequest(req);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.message });
        }

        // 1. Build Text Instruction (passing keys from URLs object)
        const promptText = buildPromptText(outfitType, outfitColor, urls);

        // 2. Prepare Multimodal Parts
        const promptParts = [{ text: promptText }];
        
        // Add user face (from Multer)
        promptParts.push(formatFileForGemini(req.file));

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
        const fileName = `${productId}_${userId}`;
        saveImageToDisk(imgBuffer, fileName);
        res.set('Content-Type', imagePart.inlineData.mimeType);
        res.send(imgBuffer);

    } catch (error) {
        console.error("URL Generation Error:", error);
        res.status(500).json({ error: error.message });
    }});

    app.get('/getImage/:id', (req, res) => {
        const fileName = req.params.id; // e.g., "productId_userId"
        const filePath = path.join(IMAGE_DIR, `${fileName}.png`);
    
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