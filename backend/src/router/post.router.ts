import { Router } from "express";
import upload from "../config/multer.config";
import { postController } from "../controller/post.controller";

const postRouter=Router()

postRouter.post('/post',
    upload.single('image'),
    postController     
)


export default postRouter