import { Application } from "express";
import healthrouter from "./health.router";
import authrouter from "./auth.router";


async function serverRouter(app:Application){
    app.use('/api/v1',[healthrouter,authrouter])
}
export default serverRouter