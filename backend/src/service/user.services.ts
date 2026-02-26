
import { model } from "mongoose";
import { languageprompt } from "../constants/prompt.constant";
import imageModel from "../database/models/image.model";
import createInstance from "../database/operations/create";
import { ai, mmodel } from "../helper/gemini.helper";

import agrologger from "../libs/logger.libs";
import givebase from "../utils/base64.utils"
import modelResponseMapper from "../mapper/prompt.mapper";

async function uploadfileService(filepath: string) {
  try {
    const file = await givebase(filepath);
    
// async function listModels() {
//   const models = await ai.models.list();
//   console.log(models);
// }

// listModels();
const result = await mmodel.generateContent({
  model: "models/gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [
        { text: languageprompt },
        {
          inlineData: {
            data: file as string,
            mimeType: "image/jpeg"
          }
        }
      ]
    }
  ]
});

const text = result.text;

if (!text) {
  throw new Error("AI returned empty response");
}

//agrologger.info(text);
const appropriate_response= modelResponseMapper(text)
return {
  message: "Generation successful",
  data: appropriate_response,
  
};

  } catch (error: any) {
    agrologger.error(error.message);
    throw new Error("Image processing failed");
  }
}
 
export{
    uploadfileService,
    
}