import { NextFunction, Request, Response } from "express";

import { StatusCodes } from "http-status-codes";
import { checkAndAssign } from "../utils/common.utils";

import { UnauthorizedException, ValidationException } from "../exceptions";
import { verifyAccessToken } from "../helper/jsonwebtoken.helper";
declare global {
  namespace Express {
    interface Request {
      correlationId: any;
      user: any;
      token: any;
    }
  }
}
async function verifyAuthToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    let token = req.headers["authorization"] ?? req.headers.authorization;

    if (!token) {
      throw new UnauthorizedException(
        StatusCodes.UNAUTHORIZED,
        `No token present on headers`
      );
    }

    const hasBearer = token.startsWith("Bearer");
    if (hasBearer) {
      token = token.split(" ")[1] as string;
    }

    const decodepayload = await verifyAccessToken(token);

    const checkEmpty = Object.entries(decodepayload).length > 0;

    if (!checkEmpty) {
      throw new ValidationException(StatusCodes.BAD_REQUEST, `Empty Payload`);
    }
    const correlationId = req.headers["x-correlation-id"];

    if (!correlationId) {
      throw new UnauthorizedException(
        StatusCodes.UNAUTHORIZED,
        `No x-corelation-id present on headers`
      );
    }
    checkAndAssign(req, [
      {
        key: "correlationId",
        value: correlationId,
      },
      {
        key: "token",
        value: token,
      },
      {
        key: "user",
        value: decodepayload as any,
      },
    ]);

    next();
  } catch (err) {
    next(err);
  }
}
export { verifyAuthToken };
