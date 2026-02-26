import { Application } from "express";
import healthrouter from "./health.router";
import authrouter from "./auth.router";
import postRouter from "./post.router";


async function serverRouter(app:Application){
    app.use('/api/v1',[healthrouter,authrouter,postRouter])
}
export default serverRouter