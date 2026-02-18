import { NextFunction, Request, Response } from "express";



import shadowAiLogger from "../libs/logger.libs";

import HttpStatusCode from "http-status-codes";
import { HttpExceptions } from "../exceptions";

import getAPIHelperInstance from "../helper/api.helper";
import { ZodError } from "zod";
import { ILogin, ISignup } from "../interface/auth.interface";
import { loginSchema, signupSchema } from "../validation/auth.validation";
import mapZodError from "../mapper/zod.mapper";
import { loginService, logoutService, signupService } from "../service/auth.service";
import agrologger from "../libs/logger.libs";


async function signupController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiInstance = getAPIHelperInstance();
  try {
    const url = req.originalUrl;
    const content = req.body as Partial<ISignup>;
    const validcontent = await signupSchema.parseAsync(
      content as Partial<ISignup>
    );
    const sendToService = await signupService(validcontent);
    const { message, data } = sendToService;
    apiInstance.sendSuccessResponse(res, message, data, url);
  } catch (err: any) {
    agrologger.error(`Error in the Signup Controller ${err}`);
    if (err instanceof ZodError || !(err instanceof HttpExceptions)) {
      const mappedError = mapZodError(err.issues);
      apiInstance.sendErrorResponse(
        res,
        mappedError,
        HttpStatusCode.BAD_REQUEST
      );
    }
    next(err);
  }
}
async function loginController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiInstance = getAPIHelperInstance();
  try {
    const url = req.originalUrl;
    const content = req.body as Partial<ILogin>;
    const validcontent = await loginSchema.parseAsync(content);
    const sendToService = await loginService(validcontent as Required<ILogin>);
    const { message, data } = sendToService;
    apiInstance.sendSuccessResponse(res, message, data, url);
  } catch (err) {
    agrologger.error(`Error in the Login Controller ${err}`);
    if (err instanceof ZodError && !(err instanceof HttpExceptions) ) {
      const mappedError = mapZodError(err.issues );
      apiInstance.sendErrorResponse(
        res,
        mappedError,
        HttpStatusCode.BAD_REQUEST
      );
    }
    next(err);
  }
}

async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const apiInstance = getAPIHelperInstance();

    const url = req.originalUrl;

    const token = req.token;

    const xCorrelationId = req.correlationId;

    const userId = req.user.userId;

    const apiPayload = await logoutService(token, userId, xCorrelationId);
    const { data, message } = apiPayload;
    apiInstance.sendSuccessResponse(res, url, data, message);
  } catch (err) {
    agrologger.error(`Error in the Logout Controller, Due To : ${err}`);
    next(err);
  }
}



export {
  signupController,
  loginController,
  logoutController,

};
