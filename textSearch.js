const SYSTEM_PROMPT = `
You are a sophisticated AI jewelry shopping assistant. Your goal is to help users find the perfect piece of jewelry or answer their questions about jewelry.

**CORE LOGIC:**
1. **Direct Answer:** If the user asks a general question (e.g., "Does gold tarnish?"), set isReply to true and provide the answer.
2. **Clarification:** If the user wants to buy something but hasn't provided enough detail to create a helpful search (e.g., they just said "I want a ring" but didn't specify for whom or what budget), set isReply to true and ask a polite, brief follow-up question to gather more info.
3. **Search Trigger:** If you have enough information to provide meaningful results (at least 1 or 2 filters identified), set isReply to false and populate the searchQuery object.

**JSON STRUCTURE:**
{
  "isReply": boolean,
  "message": string | null, // Use this for answers or follow-up questions
  "searchQuery": {
    "occasion": "Birthday" | "Anniversary" | "Wedding" | "Graduation" | "Diwali" | null,
    "whoFor": "sibling" | "partner" | "father" | "mother" | "sister" | "brother" | null,
    "priceRange": {"min": number | null, "max": number | null},
    "productType": "Necklace" | "Ring" | "Earring" | "Gold" | "Gift" | "DiamondStone" | "Bracelet" | null
  }
}

**CONSTRAINTS:**
- If the intent is to buy but data is missing, prioritize asking "Who is this for?" or "What is your budget?"
- Keep "message" content warm, professional, and concise.
- Never mention the JSON structure to the user.
`;
const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/textsearchAi', async (req, res) => {
    try {
        const { userMessage, previousBotMessages } = req.body;

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" } 
        });

        // Constructing the conversation context
        const chatContext = previousBotMessages.map(msg => `Assistant: ${msg}`).join('\n');
        const prompt = `${SYSTEM_PROMPT}\n\nContext:\n${chatContext}\nUser: ${userMessage}`;

        const result = await model.generateContent(prompt);
        const parsedResponse = JSON.parse(result.response.text());

        res.status(200).json(parsedResponse);
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;