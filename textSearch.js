const SYSTEM_PROMPT = `
You are a sophisticated AI jewelry shopping assistant. Your goal is to either:
1) Answer jewelry-related questions, OR
2) Collect structured information to build a product search query.

You are given the FULL conversation history between the user and the AI. 
You must decide whether to reply conversationally or trigger a search.

----------------------------------
CORE DECISION LOGIC
----------------------------------
[... Keep your existing logic for modes 1, 2, and 3 ...]

IMPORTANT:
- As soon as 3 or more filters are available, you MUST trigger search (isReply = false).
- Do not wait for all 4 filters.
- Do not continue conversation once search threshold is reached.
- Use "metalType" when the user mentions a metal (gold, silver, platinum, rose gold).
- Use "gemstone" when the user asks for diamond or gemstone jewelry, or mentions "studded".
- Use "brand" when the user mentions a specific brand name.
- Use "name" when the user asks for a specific product by name.

**TYPO CORRECTION & MULTIPLE ENTRIES:**
- If the user misspells a brand (e.g., "Boh Banjara", "kamya"), you MUST correct it and map it to the exact allowed name (e.g., "Boho Banjara", "Kaamya Jewels").
- If the user mentions multiple brands (e.g., "Brand A or Brand B"), select the FIRST recognized brand to populate the "brand" field.

----------------------------------
JSON STRUCTURE CONSTRAINTS
----------------------------------
- Keep "message" content warm, professional, and concise.
- Never mention the JSON structure to the user.
- For "brand", only return exact matches from the allowed schema or null.
`;

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the strict schema for Gemini to follow
const searchSchema = {
    type: SchemaType.OBJECT,
    properties: {
        isReply: { type: SchemaType.BOOLEAN },
        message: { type: SchemaType.STRING, nullable: true },
        searchQuery: {
            type: SchemaType.OBJECT,
            nullable: true,
            properties: {
                occasion: { type: SchemaType.STRING, enum: ["Birthday", "Anniversary", "Wedding", "Graduation", "Diwali", "Daily Wear", "Party Wear"], nullable: true },
                whoFor: { type: SchemaType.STRING, enum: ["sibling", "partner", "father", "mother", "sister", "brother", "male", "female"], nullable: true },
                priceRange: {
                    type: SchemaType.OBJECT,
                    nullable: true,
                    properties: {
                        min: { type: SchemaType.NUMBER, nullable: true },
                        max: { type: SchemaType.NUMBER, nullable: true }
                    }
                },
                productType: { type: SchemaType.STRING, enum: ["Necklace", "Ring", "Earring", "Bracelet", "Pendant", "Bangle", "Anklet", "Mangalsutra", "Chain"], nullable: true },
                categoryName: { type: SchemaType.STRING, nullable: true },
                subCategoryName: { type: SchemaType.STRING, nullable: true },
                metalType: { type: SchemaType.STRING, enum: ["Gold", "Silver", "Platinum", "Rose Gold"], nullable: true },
                gemstone: { type: SchemaType.STRING, enum: ["Natural Diamond", "Gemstone"], nullable: true },
                brand: { 
                    type: SchemaType.STRING, 
                    enum: ["Roma Designs", "Belrosa Atelier", "AstraBelle", "Zaiwarya", "Virasat Jewels", "Nakshatra Mandir", "Ethnika House", "Boho Banjara", "Rang Auraa", "Kaamya Jewels"], 
                    nullable: true 
                },
                name: { type: SchemaType.STRING, nullable: true }
            }
        }
    },
    required: ["isReply"]
};

router.post('/textsearchAi', async (req, res) => {
    try {
        const { userMessage, previousBotMessages: previousMessages = [] } = req.body;
        console.log("userMessage:", userMessage, previousMessages);

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: searchSchema, // Enforces exact enums and structure
                temperature: 0.1 // Low temperature helps with strict formatting
            }
        });

        const chatContext = previousMessages
            .map((msg) => {
                const role = msg.sender === "ai" ? "Assistant" : "User";
                return `${role}: ${msg.text}`;
            })
            .join("\n");

        const prompt = `
        ${SYSTEM_PROMPT}
        
        FULL CONVERSATION:
        ${chatContext}
        
        User: ${userMessage}
        
        Remember:
        - Apply the 3-filter rule strictly.
        - Correct any brand misspellings to match the exact allowed names.
        `;

        const result = await model.generateContent(prompt);
        const parsedResponse = JSON.parse(result.response.text());
        
        console.log("response from gemini:", parsedResponse);
        res.status(200).json(parsedResponse);
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;