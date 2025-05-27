import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI("");

// Configure the model (using Gemini for text analysis)
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
    },
});

interface SentimentResult {
    sentiment: string; // positive, negative, or neutral
    confidence: number; // Confidence score between 0 and 1
}

/**
 * Analyzes the sentiment of the given text using Google Generative AI.
 * @param text The text to analyze.
 * @returns A promise resolving to the sentiment result.
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
    try {
        const prompt = `Classify the sentiment of the following text as positive, negative, or neutral, and provide a confidence score between 0 and 1:\n\nText: """${text}"""\n\nReturn the result in the format: Sentiment: <sentiment>, Confidence: <confidence>`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse the response
        const sentimentMatch = responseText.match(/Sentiment: (positive|negative|neutral)/i);
        const confidenceMatch = responseText.match(/Confidence: ([\d.]+)/);

        if (!sentimentMatch || !confidenceMatch) {
            throw new Error("Failed to parse sentiment analysis response");
        }

        const sentiment = sentimentMatch[1].toLowerCase();
        const confidence = parseFloat(confidenceMatch[1]);

        return {
            sentiment,
            confidence: Math.min(Math.max(confidence, 0), 1), // Clamp confidence between 0 and 1
        };
    } catch (error) {
        console.error("Sentiment analysis error:", error);
        return {
            sentiment: "neutral",
            confidence: 0,
        };
    }
}