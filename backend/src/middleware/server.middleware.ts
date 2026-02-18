import { Application } from "express";
import express from "express";

async function serverMiddleware(app:Application){
    app.use(express.json())
    app.use(express.urlencoded({extended:true}))
    //app.use(cors(corsconfig as CorsOptions))

}

export default serverMiddleware
