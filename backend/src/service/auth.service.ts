import { StatusCodes } from "http-status-codes";

import { BadRequestException, DatabaseException } from "../exceptions";
import reminderservice from "../libs/logger.libs";
import { decryptKeys, encryptKeys } from "../helper/crypto.helper";


import { ILogin, ISignup } from "../interface/auth.interface";
import { IAPIResponse } from "../interface/api.response";

import { excludeObjectKey } from "../utils/common.utils";
import searchInstance from "../database/operations/select";
import createInstance from "../database/operations/create";
import userModel from "../database/models/user.model";
import { createAccessToken, createRefreshToken } from "../helper/jsonwebtoken.helper";
import tokenModel from "../database/models/tokenmodel";

async function signupService(payload: Partial<ISignup>): Promise<IAPIResponse> {
  const searchquery = searchInstance();
  const createquery = createInstance();
  const { username, email, password } = payload;

  const findusername = await searchquery.search(
    "username",
    username,
    userModel
  );

  if (findusername) {
    throw new DatabaseException(
      StatusCodes.BAD_REQUEST,
      `The username: ${username} you provided already exists on system ,please signup using a new username `
    );
  }

  const findemail = await searchquery.search("email", email, userModel);

  if (findemail) {
    throw new DatabaseException(
      StatusCodes.BAD_REQUEST,
      `The username: ${username} you provided already exists on system ,please signup using a new username `
    );
  }
  const hashPassword = encryptKeys(password as string);

  const { text, key, iv } = hashPassword;

  const dbPayload = {
    username,
    email,
    password: text,
    passHashKey: key,
    passIv: iv,
  };

  const savetoDatabase = await createquery.create(dbPayload, userModel);

  reminderservice.info(
    `Starting to save the User Profile for the Newly Create User`
  );

  const createUserId = savetoDatabase._id.toString("utf-8");

  const userProfilePayload = Object.preventExtensions({
    userProfileName: username as string,
    primaryEmail: email as string,
    userId: createUserId,
  } as Record<string, string>);

  const saveUserProfileDatabase = await createquery.create(
    userProfilePayload,
    userModel
  );

  reminderservice.info(
    `The UserProfile Has been Created on the Database For the Newly Crreated User `
  );

 return {
    message: "Signup completed",
    data: excludeObjectKey(savetoDatabase._doc, [
      "password",
      "passHashKey",
      "passIv",
    ]),
  };
}
async function loginService(content: Required<ILogin>): Promise<IAPIResponse> {
  const searchquery = searchInstance();
  const createquery = createInstance();

  const { username, password } = content;

  const findusername = await searchquery.search(
    "username",
    username,
    userModel
  );

  if (!findusername) {
    throw new DatabaseException(
      StatusCodes.BAD_REQUEST,
      `The username: ${username} you provided does not  exists on system ,please signup using a username : ${username} `
    );
  }

  const databasePassowrd = findusername.password;
  const databaseHex = findusername.passHashKey;
  const databaseIv = findusername.passIv;

  const decryptedPassword = decryptKeys(
    databasePassowrd,
    databaseHex,
    databaseIv
  );

  const isValidPassword = password === decryptedPassword;


  if (!isValidPassword) {
    throw new DatabaseException(
      StatusCodes.BAD_REQUEST,
      `Password Does not Match For the User : ${username} `
    );
  }

  const jwtPayload = {
    username: findusername.username,
    userId: findusername._id,
    type: findusername.type,
    email:findusername.email
  };

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(jwtPayload),
    createRefreshToken(jwtPayload),
  ]);

  return {
    message: `The User ${username} Has Successfully Log In`,
    data: {
      accessToken,
      refreshToken,
    },
  };
}

async function logoutService(
  accessToken: string,
  userId: string,
  correlationid: string
) {
  const createModel = createInstance();
  const searchModel = searchInstance();

  const andQuery = {
    $and: [
      {
        accessToken: accessToken,
      },
      {
        userId: userId,
      },
    ],
  } as Record<string, any>;

  const searchResult = await searchModel.searchAnd(andQuery, tokenModel);

  if (Array.isArray(searchResult) && searchResult.length > 0) {
    throw new BadRequestException(
      StatusCodes.BAD_REQUEST,
      `The User Has Already been Logged Out, Please Refresh the Page to Clarify It`
    );
  }

  const tokenpayload = Object.preventExtensions({
    accessToken: accessToken,
    x_correlation_id: correlationid,
    userId: userId,
    logoutAt: new Date(),
  });

  const savetotokenmodel = await createModel.create(tokenpayload, tokenModel);

  if (!savetotokenmodel) {
    throw new DatabaseException(
      StatusCodes.CONFLICT,
      `Database Error Unable to Create the Token Payload`
    );
  }
  return {
    message: `The userId ${userId} is succesfully logged out`,
     data: excludeObjectKey(tokenpayload, ["accessToken"]),
  };
}

export{
    signupService,
    loginService,
    logoutService
}