import { GoogleGenAI } from "@google/genai";
import { getenvvar } from "../utils/env.utils";
import agrologger from "../libs/logger.libs";

const ai = new GoogleGenAI({
  apiKey: getenvvar("GEMINI_API_KEY"),
});

const mmodel = ai.models



export{
  ai,
  mmodel
}