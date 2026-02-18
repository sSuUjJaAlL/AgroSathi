import StatusCode from "http-status-codes";
import { Response } from "express";
import { excludeObjectKey } from "../utils/common.utils";
import agroservice from "../libs/logger.libs";
import agrologger from "../libs/logger.libs";

class APIHelper {
  public async sendSuccessResponse<T>(
    res: Response,
    baseUrl: string,
    data: T,
    message: string,
    statusCode = StatusCode.ACCEPTED
  ) {
    agrologger.info(
      `Sending the Success Resposne to the API Endpoints: ${baseUrl} with the StatusCode: ${statusCode}`
    );
    if (typeof data === "object" && data && "x-correlation-id" in data) {
      return res.status(statusCode).json({
        message,
        [`x-correlation-id`]: data["x-correlation-id"],
        data: excludeObjectKey(data, ["x-correlation-id", "_id"]),
        statusCode,
        error: false,
      });
    } else {
      return res.status(statusCode).json({
        message,
        data,
        statusCode,
        error: false,
      });
    }
  }

  public async sendErrorResponse(
    res: Response,
    errorPayload: Record<string, any>,
    statusCode: number
  ) {
    return res.status(statusCode).json({
      statusCode: statusCode,
      error: true,
      message: errorPayload,
    });
  }
}

const getAPIHelperInstance = (): APIHelper => {
  return new APIHelper();
};

export default getAPIHelperInstance;
