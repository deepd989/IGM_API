const SYSTEM_PROMPT = `
🚨 PRIMARY INSTRUCTION: You MUST extract price information when users mention amounts like "above 100000", "under 50K", etc. This is your FIRST priority. 🚨

You are a sophisticated AI jewelry shopping assistant. Your goal is to either:
1) Answer jewelry-related questions, OR
2) Collect structured information to build a product search query.

⚠️ CRITICAL REQUIREMENT: When users mention ANY price, budget, or amount (like "above 100000", "under 50K", etc.), you MUST extract it into priceRange. This is mandatory even when mentioned alongside product details.

PRICE EXTRACTION EXAMPLES (MEMORIZE THESE):
- "ring above 100000" → productType="Ring" + priceRange={"min":100000,"max":null}
- "necklace under 50000" → productType="Necklace" + priceRange={"min":null,"max":50000}
- "earrings between 25000 and 75000" → productType="Earring" + priceRange={"min":25000,"max":75000}

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

---------------------------------- 
PRICE / BUDGET EXTRACTION - CRITICAL
----------------------------------
⚠️ MANDATORY: When the user mentions ANY price, budget, amount, or cost, you MUST extract it and populate "priceRange".

CONVERSION RULES:
- All values must be in absolute Indian Rupees (INR)
- K/k = thousand (×1000)
- L/l/lakh/lakhs = ×100000
- cr/crore/crores = ×10000000

EXTRACTION PATTERNS (EXAMPLE INPUTS → OUTPUT):
  • "under 50K" → { "min": null, "max": 50000 }
  • "below 25000" → { "min": null, "max": 25000 }
  • "above 100000" → { "min": 100000, "max": null }
  • "above 1 lakh" → { "min": 100000, "max": null }
  • "over 75K" → { "min": 75000, "max": null }
  • "more than 50000" → { "min": 50000, "max": null }
  • "between 20K and 50K" → { "min": 20000, "max": 50000 }
  • "₹30000 to ₹80000" → { "min": 30000, "max": 80000 }
  • "around 30 thousand" → { "min": 25000, "max": 35000 }
  • "budget is 15K" → { "min": 10000, "max": 20000 }
  • "not more than 25000" → { "min": null, "max": 25000 }
  • "within 1 lakh" → { "min": null, "max": 100000 }
  • "up to 2 lakhs" → { "min": null, "max": 200000 }

RANGE LOGIC:
- "under/below/less than/up to/within X" → { "min": null, "max": X }
- "above/over/more than X" → { "min": X, "max": null }
- "around/approximately X" → { "min": X × 0.8, "max": X × 1.2 }
- "X to Y" or "between X and Y" → { "min": X, "max": Y }

⚠️ CRITICAL: Even if price is mentioned with other product details (like "necklace above 100000"), you MUST extract the price range. Price counts as a filter toward the 3-filter threshold.

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

        // PRE-PROCESS: Extract price patterns before sending to Gemini
        const pricePatterns = extractPriceFromMessage(userMessage);
        console.log("Pre-extracted price patterns:", pricePatterns);

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: searchSchema, // Enforces exact enums and structure
                temperature: 0.1 // Low temperature for consistent results
            }
        });

        const chatContext = previousMessages
            .map((msg) => {
                const role = msg.sender === "ai" ? "Assistant" : "User";
                return `${role}: ${msg.text}`;
            })
            .join("\n");

        const prompt = `
Extract jewelry search filters from: "${userMessage}"

FILTERS TO EXTRACT:
- productType: Ring, Necklace, Earring, Bracelet, Pendant, Bangle, Anklet, Mangalsutra, Chain
- whoFor: sibling, partner, father, mother, sister, brother, male, female  
- metalType: Gold, Silver, Platinum, Rose Gold
- occasion: Birthday, Anniversary, Wedding, Graduation, Diwali, Daily Wear, Party Wear
- gemstone: Natural Diamond, Gemstone
- brand: Roma Designs, Belrosa Atelier, AstraBelle, Zaiwarya, Virasat Jewels, Nakshatra Mandir, Ethnika House, Boho Banjara, Rang Auraa, Kaamya Jewels

${pricePatterns ? `PRICE DETECTED: Use this priceRange: ${JSON.stringify(pricePatterns)}` : 'No price mentioned.'}

If 3+ filters → isReply: false, otherwise → isReply: true
        `;

        console.log("Explicit pattern matching for:", userMessage);
        console.log("Full prompt length:", prompt.length);
        console.log("Prompt preview:", prompt.substring(0, 500) + "...");

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log("Raw response from Gemini:", responseText);
        
        const parsedResponse = JSON.parse(responseText);
        
        // POST-PROCESS: Ensure price is included if we pre-extracted it
        if (pricePatterns && parsedResponse.searchQuery) {
            parsedResponse.searchQuery.priceRange = pricePatterns;
            console.log("Force-added price range to response");
        }
        
        console.log("Final response:", parsedResponse);
        res.status(200).json(parsedResponse);
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Helper function to extract price patterns from text
function extractPriceFromMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    // Pattern matching for price extraction
    const aboveMatch = lowerMessage.match(/above\s+(\d+)/);
    const underMatch = lowerMessage.match(/under\s+(\d+)/);
    const belowMatch = lowerMessage.match(/below\s+(\d+)/);
    const betweenMatch = lowerMessage.match(/between\s+(\d+)\s+and\s+(\d+)/);
    
    if (betweenMatch) {
        return {
            min: parseInt(betweenMatch[1]),
            max: parseInt(betweenMatch[2])
        };
    }
    
    if (aboveMatch) {
        return {
            min: parseInt(aboveMatch[1]),
            max: null
        };
    }
    
    if (underMatch || belowMatch) {
        const amount = underMatch ? parseInt(underMatch[1]) : parseInt(belowMatch[1]);
        return {
            min: null,
            max: amount
        };
    }
    
    return null;
}

module.exports = router;