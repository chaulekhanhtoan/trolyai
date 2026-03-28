import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function chatWithAI(prompt: string, context: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Nội dung tài liệu:\n${context}\n\nCâu hỏi: ${prompt}`,
    config: {
      systemInstruction: "Bạn là một trợ lý AI hữu ích. Hãy trả lời câu hỏi dựa trên nội dung tài liệu được cung cấp dưới đây. Nếu không có thông tin trong tài liệu, hãy nói rằng bạn không biết dựa trên tài liệu đó. Trả lời bằng tiếng Việt."
    }
  });

  return response.text;
}
