import { Request, Response, Router } from "express";

const healthrouter =Router()

healthrouter.get('/health',(req:Request,res:Response)=>{
    res.json({
        msg:'Working'
    })
})

export default healthrouter