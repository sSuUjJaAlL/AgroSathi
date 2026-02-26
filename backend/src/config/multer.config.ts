import multer from "multer";
import path from "node:path"
import fs from "node:fs"
import agrologger from "../libs/logger.libs";


const newlocation= path.join( process.cwd(),'newfile')
 
if(!fs.existsSync(newlocation)){
    agrologger.info(`Creating new directpry`)
    fs.mkdirSync(newlocation,{
        recursive:true
    })
}

const storagelocation = multer.diskStorage({
    destination:newlocation,
    filename:(req,file,cb)=>{
        cb(
            null,
            `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
        )

    }
})

const upload= multer({
    storage:storagelocation,
    limits:{
        fileSize:5*1024*1024
    }
})

export default upload