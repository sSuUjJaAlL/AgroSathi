import dotenv from "dotenv"
dotenv.config()


export function getenvvar(key:string,fallback?:string){
    if(Object.prototype.hasOwnProperty.call(process.env,key)){
        const value= process.env[key]
        if(value!==undefined && value!==''){
            return value
        }
        if(fallback!==undefined)
            return fallback
        }
        throw new Error(`No Environment variable for ${key}key the process }`)
}
