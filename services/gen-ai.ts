import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from "@google/generative-ai";
import env from "../utils/env-vars";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  systemInstruction: `Please process this slip. Categorize each line item individually based on the line item description. You should also provide a category for the entire slip based on the highest spent category in the line items. If there are no line items, use the name of the merchant to try and determine the category. Provide a very short memo which summarises what products were purchased. Output the transaction date in the format: 'YYYY-MM-DD'. If the slip doesn't have the full date, use the current date, which is ${new Date().toDateString()}, to try determine the full date`,
});

const getGeneratingConfig = (availableEnvelopes: string[]): GenerationConfig => ({
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      storeName: {
        type: SchemaType.STRING,
      },
      transactionDate: {
        type: SchemaType.STRING,
      },
      memo: {
        type: SchemaType.STRING,
      },
      totalAmount: {
        type: SchemaType.NUMBER,
      },
      lineItems: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            productName: {
              type: SchemaType.STRING,
            },
            quantity: {
              type: SchemaType.NUMBER,
            },
            lineItemTotalAmount: {
              type: SchemaType.NUMBER,
            },
            category: {
              type: SchemaType.STRING,
              enum: availableEnvelopes,
            },
          },
          required: ["productName", "category", "lineItemTotalAmount"],
        },
      },
      category: {
        type: SchemaType.STRING,
        enum: availableEnvelopes,
      },
    },
    required: ["storeName", "totalAmount", "transactionDate", "category", "memo"],
  },
});

export type Slip = {
  storeName: string;
  category: string;
  transactionDate: string;
  memo: string;
  totalAmount: number;
  lineItems?: {
    productName: string;
    quantity?: number;
    lineItemTotalAmount: number;
    category: string;
  }[];
};

export const parseSlip = async (
  image: Buffer,
  mimeType: string,
  availableEnvelopes: string[]
): Promise<Slip | null> => {
  const chatSession = model.startChat({
    generationConfig: getGeneratingConfig(availableEnvelopes),
    history: [],
  });

  const result = await chatSession.sendMessage([
    {
      text: "Process this slip",
    },
    {
      inlineData: {
        data: image.toString("base64"),
        mimeType,
      },
    },
  ]);

  return JSON.parse(result.response.text());
};
