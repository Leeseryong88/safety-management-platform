import { GoogleGenAI, GenerateContentResponse, Part, Content } from "@google/genai";
import { GeminiRawPhotoAnalysis, GeminiRawHazardItem, PhotoAnalysisResultItem } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API Key not found. Please set process.env.API_KEY.");
  // alert("Gemini API Key is not configured. Some features may not work.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY" });
const TEXT_MODEL = 'gemini-2.5-flash-preview-04-17';

function parseJsonFromText(text: string): any {
  const originalText = text; // For logging
  let jsonStr = text.trim();

  // Attempt 1: Try parsing directly, in case it's already a clean JSON string
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    // Not a clean JSON string, proceed to try cleaning
    // console.debug("Direct JSON.parse failed, attempting to clean:", e1);
  }

  // Attempt 2: Try to remove markdown fences
  // Regex to match ```json ... ``` or ``` ... ```
  // It captures the content inside the fences.
  const fenceRegex = /^```(?:json)?\s*(.*?)\s*```$/s;
  const match = jsonStr.match(fenceRegex);

  if (match && match[1]) {
    jsonStr = match[1].trim(); // Use the captured content
    try {
      return JSON.parse(jsonStr);
    } catch (e2) {
      // Still failed after removing fences, log and proceed to next attempt or throw
      console.warn("Failed to parse JSON after removing fences. Content inside fences:", jsonStr.substring(0, 500), "Error:", e2);
    }
  }

  // Attempt 3: Fallback to extracting content between the first '{' or '[' and last '}' or ']'
  // This is a less robust method but can help with some malformations.
  let potentialJson = "";
  const firstCurly = originalText.indexOf('{');
  const lastCurly = originalText.lastIndexOf('}');
  const firstSquare = originalText.indexOf('[');
  const lastSquare = originalText.lastIndexOf(']');

  if (firstCurly !== -1 && lastCurly > firstCurly && (firstSquare === -1 || firstCurly < firstSquare) ) { // Check if JSON object is likely
    potentialJson = originalText.substring(firstCurly, lastCurly + 1).trim();
  } else if (firstSquare !== -1 && lastSquare > firstSquare) { // Check if JSON array is likely
    potentialJson = originalText.substring(firstSquare, lastSquare + 1).trim();
  }
  
  if (potentialJson) {
    try {
      return JSON.parse(potentialJson);
    } catch (e3) {
      console.error("Failed to parse JSON response after all attempts:", e3, "Original text:", originalText.substring(0,1000), "Attempted with substring:", potentialJson.substring(0,1000));
      throw new Error(`Failed to parse AI response as JSON. Raw: ${originalText.substring(0,200)}, Substring attempt: ${potentialJson.substring(0,200)}`);
    }
  }


  // If all attempts fail
  console.error("Failed to parse JSON response, no valid JSON structure found:", "Original text:", originalText.substring(0,1000));
  throw new Error(`Failed to parse AI response as JSON. No valid structure found in: ${originalText.substring(0,200)}`);
}

export const analyzePhotoForHazards = async (base64ImageData: string, mimeType: string, imageDesc?: string): Promise<PhotoAnalysisResultItem> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");
  try {
    const imagePart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: base64ImageData,
      },
    };
    
    const descriptionLine = imageDesc ? `Image description (optional): ${imageDesc}` : 'Image description (optional): N/A';

    const textPart: Part = {
        text: `IMPORTANT: You MUST respond with a single, valid JSON object. The entire response MUST be ONLY the JSON object. Do NOT use markdown (e.g., \\\`\\\`\\\`json).
Analyze the provided image of a work site. 
The response language MUST be Korean for all textual content INSIDE the JSON (e.g., string values). 
Do NOT include any characters or text from other languages (e.g., English, Japanese) within the JSON values or structure.
The JSON object MUST strictly adhere to the following schema. Use these exact key names:
{
  "hazards": ["list of DETAILED AND SPECIFIC hazard descriptions, strictly in Korean. For example, instead of just '추락 위험' (Fall risk), be more specific like '안전 난간 미설치로 인한 추락 위험' (Fall risk due to uninstalled safety railing) or '고정 불량 비계에서 작업 중 추락 위험' (Fall risk while working on poorly fixed scaffolding). Each hazard description should clearly state the dangerous condition and the potential consequence."],
  "engineeringSolutions": ["list of engineering improvement suggestions, strictly in Korean"],
  "managementSolutions": ["list of management improvement suggestions, strictly in Korean"],
  "relatedRegulations": ["list of relevant laws or regulation strings, strictly in Korean"]
}
All string content within these arrays MUST be in Korean and must not contain any extraneous non-JSON characters or text from other languages.
For the 'hazards' array, provide detailed and specific descriptions as exemplified above. For 'engineeringSolutions', 'managementSolutions', and 'relatedRegulations', ensure each array contains concise, actionable items.
If no specific items are found for a category, you MUST return an empty array for that category (e.g., "hazards": []).
Do not add any text or characters whatsoever before or after the JSON object. The response MUST start with '{' and end with '}'.
${descriptionLine}`
    };

    const contents: Content[] = [{ role: "user", parts: [imagePart, textPart] }];

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: contents,
      config: { 
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text;
    if (typeof responseText !== 'string' || responseText.trim() === "") {
        console.warn("Could not extract valid text from Gemini JSON response for analyzePhotoForHazards. Full response object:", JSON.stringify(response, null, 2).substring(0, 1000));
        throw new Error("AI 응답에서 유효한 텍스트를 추출할 수 없습니다. 응답이 비어있거나 텍스트 형식이 아닙니다.");
    }
    
    const parsedResult = parseJsonFromText(responseText) as GeminiRawPhotoAnalysis;

    if (!parsedResult || typeof parsedResult !== 'object') {
        throw new Error("Invalid JSON structure received from AI for photo analysis.");
    }
    return {
        hazards: Array.isArray(parsedResult.hazards) ? parsedResult.hazards : [],
        engineeringSolutions: Array.isArray(parsedResult.engineeringSolutions) ? parsedResult.engineeringSolutions : [],
        managementSolutions: Array.isArray(parsedResult.managementSolutions) ? parsedResult.managementSolutions : [],
        relatedRegulations: Array.isArray(parsedResult.relatedRegulations) ? parsedResult.relatedRegulations : [],
    };

  } catch (error) {
    console.error("Error analyzing photo with Gemini:", error);
    throw error;
  }
};

const mapToHazardItem = (item: any): GeminiRawHazardItem => ({
  description: typeof item.description === 'string' ? item.description : "해당 없음",
  severity: typeof item.severity === 'number' && item.severity >= 1 && item.severity <= 5 ? item.severity : 3,
  likelihood: typeof item.likelihood === 'number' && item.likelihood >= 1 && item.likelihood <= 5 ? item.likelihood : 3,
  countermeasures: typeof item.countermeasures === 'string' ? item.countermeasures : "해당 없음",
});

export const generateRiskAssessment = async (base64ImageData: string, mimeType: string, processName: string, imageDesc?: string): Promise<GeminiRawHazardItem[]> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");
  try {
    const imagePart: Part = {
      inlineData: {
        mimeType: mimeType,
        data: base64ImageData,
      },
    };
    const descriptionLine = imageDesc ? `Image description (optional): ${imageDesc}` : 'Image description (optional): N/A';

    const textPart: Part = {
        text: `Based on the provided image and process/equipment name ("${processName}"), generate a risk assessment. 
The response language MUST be Korean for all textual content INSIDE the JSON (e.g. string values). 
Do NOT include any characters or text from other languages (e.g., English, Japanese) within the JSON values or structure.
The output MUST be a JSON array of objects. The entire response MUST be ONLY this JSON array. Do NOT use markdown (e.g., \\\`\\\`\\\`json).
Each object represents a hazard and MUST adhere to this schema:
{
  "description": "string detailing the hazard (strictly in Korean)",
  "severity": "number representing severity (scale 1-5, 5 is highest)",
  "likelihood": "number representing likelihood (scale 1-5, 5 is highest)",
  "countermeasures": "string detailing recommended countermeasures (strictly in Korean)"
}
Provide concise and actionable information. Severity and likelihood must be numbers. 
All textual content (description, countermeasures) MUST be in Korean and must not contain any extraneous non-JSON characters or text from other languages.
If no hazards are identified, return an empty JSON array (e.g., []).
Do not add any text or characters whatsoever before or after the JSON array. The response MUST start with '[' and end with ']'.
${descriptionLine}`
    };

    const contents: Content[] = [{ role: "user", parts: [imagePart, textPart] }];

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: contents,
      config: { 
        responseMimeType: "application/json",
      }
    });
    
    const responseText = response.text;
    if (typeof responseText !== 'string' || responseText.trim() === "") {
        console.warn("Could not extract valid text from Gemini JSON response for generateRiskAssessment. Full response object:", JSON.stringify(response, null, 2).substring(0, 1000));
        throw new Error("AI 응답에서 유효한 텍스트를 추출할 수 없습니다. 응답이 비어있거나 텍스트 형식이 아닙니다.");
    }

    const parsedResult = parseJsonFromText(responseText);
    if (Array.isArray(parsedResult)) {
      return parsedResult.map(mapToHazardItem);
    }
    
    if (typeof parsedResult === 'object' && parsedResult !== null) {
      if (parsedResult.description && typeof parsedResult.severity === 'number' && typeof parsedResult.likelihood === 'number') {
        return [mapToHazardItem(parsedResult)];
      }
      const keys = Object.keys(parsedResult);
      if (keys.length === 1 && Array.isArray(parsedResult[keys[0]])) {
        return (parsedResult[keys[0]] as any[]).map(mapToHazardItem);
      }
    }
    throw new Error("Invalid JSON structure: Expected an array for risk assessment, or a single hazard object, or an object with one key containing an array of hazards.");

  } catch (error) {
    console.error("Error generating risk assessment with Gemini:", error);
    throw error;
  }
};

export const generateAdditionalHazards = async (processName: string, existingHazardDescriptions: string[]): Promise<GeminiRawHazardItem[]> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");
  try {
    const existingHazardsString = existingHazardDescriptions.length > 0 
      ? `The following hazards have already been identified, so please provide *only new and distinct* ones:\n${existingHazardDescriptions.map(d => `- "${d}"`).join('\n')}`
      : "No hazards have been identified yet. Please identify initial hazards.";

    const promptText = `IMPORTANT: You MUST respond with a single, valid JSON array of objects. The entire response MUST be ONLY this JSON array. Do NOT use markdown (e.g., \\\`\\\`\\\`json).
For the process/equipment named "${processName}", identify potential hazards.
${existingHazardsString}

The response language MUST be Korean for all textual content INSIDE the JSON (e.g., string values).
Do NOT include any characters or text from other languages (e.g., English, Japanese) within the JSON values or structure.
Each object in the JSON array represents a hazard and MUST adhere to this schema:
{
  "description": "string detailing the new hazard (strictly in Korean)",
  "severity": "number representing severity (scale 1-5, 5 is highest)",
  "likelihood": "number representing likelihood (scale 1-5, 5 is highest)",
  "countermeasures": "string detailing recommended countermeasures for the new hazard (strictly in Korean)"
}
Provide concise and actionable information. Severity and likelihood must be numbers.
All textual content (description, countermeasures) MUST be in Korean and must not contain any extraneous non-JSON characters or text from other languages.
If no *new and distinct* hazards are identified (or no hazards at all if the existing list was empty), you MUST return an empty JSON array (i.e., []).
Do not add any text or characters whatsoever before or after the JSON array. The response MUST start with '[' and end with ']'.`;

    const contents: Content[] = [{ role: "user", parts: [{ text: promptText }] }];

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = response.text;
    if (typeof responseText !== 'string' || responseText.trim() === "") {
      console.warn("Could not extract valid text from Gemini JSON response for generateAdditionalHazards. Full response object:", JSON.stringify(response, null, 2).substring(0, 1000));
      throw new Error("AI 응답에서 유효한 텍스트를 추출할 수 없습니다. 응답이 비어있거나 텍스트 형식이 아닙니다.");
    }

    const parsedResult = parseJsonFromText(responseText);
    if (Array.isArray(parsedResult)) {
      return parsedResult.map(mapToHazardItem);
    }
    
    if (typeof parsedResult === 'object' && parsedResult !== null && parsedResult.description) {
        return [mapToHazardItem(parsedResult)];
    }
    
    console.warn("Unexpected JSON structure for additional hazards. Expected array or single hazard object, got:", parsedResult);
    return []; 

  } catch (error) {
    console.error("Error generating additional hazards with Gemini:", error);
    throw error;
  }
};


export const answerSafetyQuestion = async (
  question: string, 
  conversationHistory?: {text: string, sender: 'user' | 'ai'}[],
  imageData?: {base64: string, mimeType: string}
): Promise<string> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");
  try {
    const contents: Content[] = [];
    
    // 시스템 프롬프트 추가 (이미지 포함 여부에 따라 다르게)
    const systemPrompt = imageData 
      ? `You are an AI assistant specializing in industrial safety and health. Your primary language for responses is Korean. 
Answer questions based on general knowledge, safety practices, regulations, and image analysis when provided. The answer MUST be in Korean.
When an image is provided, analyze it for safety hazards, potential risks, and provide relevant safety recommendations.
Keep responses concise and informative. If the question is outside your expertise, state that clearly (also in Korean).
If there is previous conversation context, consider it to provide more relevant and contextual answers.`
      : `You are an AI assistant specializing in industrial safety and health. Your primary language for responses is Korean. 
Answer questions based on general knowledge, and common safety practices and regulations. The answer MUST be in Korean.
Keep responses concise and informative. If the question is outside your expertise, state that clearly (also in Korean).
If there is previous conversation context, consider it to provide more relevant and contextual answers.`;
    
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
    
    // 이전 대화 히스토리 추가 (최근 8개만)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-8);
      for (const historyItem of recentHistory) {
        contents.push({
          role: historyItem.sender === 'user' ? 'user' : 'model',
          parts: [{ text: historyItem.text }]
        });
      }
    }
    
    // 현재 질문과 이미지 추가
    const currentParts: Part[] = [{ text: question }];
    
    if (imageData) {
      currentParts.unshift({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64,
        }
      });
    }
    
    contents.push({ role: "user", parts: currentParts });

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: contents,
    });

    const responseText = response.text;
    if (typeof responseText === 'string' && responseText.trim() !== '') {
      return responseText;
    }
    console.warn("Could not extract text from Gemini response for answerSafetyQuestion. Full response object:", JSON.stringify(response, null, 2).substring(0, 1000));
    return "AI 응답에서 텍스트를 추출할 수 없습니다. 응답 형식을 확인해주세요.";

  } catch (error) {
    console.error("Error getting answer from Gemini:", error);
    throw error;
  }
};

// Helper to convert File to base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      //Remove "data:mime/type;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};
