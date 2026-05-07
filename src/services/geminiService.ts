import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getPopularDestinations(existingCities: string[]) {
  const prompt = `Basé sur ces villes déjà présentes dans notre réseau de transport au Burkina Faso: ${existingCities.join(', ')}. 
  Suggère 3 à 5 autres destinations populaires ou stratégiques pour le voyage interurbain au Burkina Faso qui pourraient intéresser les passagers. 
  Donne pour chaque ville une courte raison (max 10 mots) expliquant son attrait (tourisme, commerce, carrefour).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              city: { type: Type.STRING, description: "Le nom de la ville au Burkina Faso" },
              reason: { type: Type.STRING, description: "La raison de la suggestion" },
              icon: { type: Type.STRING, description: "Un mot-clé d'icône simple (nature, trade, crossroads, history)" }
            },
            required: ["city", "reason", "icon"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
}
