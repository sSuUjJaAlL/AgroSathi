import jwt, { Jwt, JwtPayload } from "jsonwebtoken";
import { getenvvar } from "../utils/env.utils";


   async function createAccessToken(payload: Record<string, any>) {
    return new Promise((resolve, reject) => {
      const options = {
        issuer: "Notes-reminder",
        expiresIn: "1h",
      } as jwt.SignOptions;
      const secretKey = getenvvar("ACCESS_TOKEN");
      const token = jwt.sign(payload, secretKey as string, options);
      if (token) {
        resolve(token);
      } else {
        resolve(null);
      }
    });
  }

   async function createRefreshToken(payload: Record<string, any>) {
    return new Promise((resolve, reject) => {
      const options = {
        issuer: "ShadowAI-Refresh",
        expiresIn: "1d",
      } as jwt.SignOptions;
      const secretKey = getenvvar("REFRESH_TOKEN");
      const token = jwt.sign(payload, secretKey as string, options);
      if (token) {
        resolve(token);
      } else {
        resolve(null);
      }
    });
  }
   async function verifyAccessToken(token: string): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      try {
        const payload = jwt.verify(
          token,
          getenvvar("ACCESS_TOKEN") as string
        );
        resolve(payload as JwtPayload);
      } catch (err) {
        reject(err);
      }
    });
  }




export {
  createAccessToken,createRefreshToken,verifyAccessToken
}
