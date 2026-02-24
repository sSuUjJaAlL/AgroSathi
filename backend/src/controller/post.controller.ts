import { NextFunction, Request, Response } from "express";
import postlogger from "../libs/logger.libs";
import getAPIHelperInstance from "../helper/api.helper";
import { uploadfileService } from "../service/user.services";

async function postController(
    req:Request,
    res:Response,
    next:NextFunction
){
    try{
        const apiInstance= getAPIHelperInstance()
        const baseurl= req.originalUrl
        const filepath= req.file?.path
    const apiresponse= await uploadfileService(filepath as string)
    const{ data ,message }= apiresponse
    apiInstance.sendSuccessResponse(res,baseurl,data,message)
    }
    catch(err){
        postlogger.error(`Error while posting image`)
    }
    

}
// async function postControllerOfImage(
//     req:Request,
//     res:Response,
//     next:NextFunction
// ){
//     try{
//         const filepath= req.file?.path
//     const apiresponse= await uploadfileServiceAndAnalyze(filepath as string)
//     const{ data ,message }= apiresponse
//     sendSuccessResponse(res,data,message)
//     }
//     catch(err){
//         postlogger.error(`Error while posting image`)
//     }
    
// }
export {
    postController,
    //postControllerOfImage
}