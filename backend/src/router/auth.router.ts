import { Router } from "express";
import { loginController, logoutController, signupController } from "../controller/auth.controller";
import { verifyAuthToken } from "../middleware/auth.middleware";


const authrouter=Router()

authrouter.post('/signup', signupController);
authrouter.post('/login', loginController)
authrouter.post('/logout/', verifyAuthToken,logoutController);

export default authrouter