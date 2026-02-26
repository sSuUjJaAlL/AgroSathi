import cors, { CorsOptions } from "cors"


const corsconfig={
    origin:"*",
    methods:["GET","DELETE","POST","PUT","PATCH"],
    credential:true,
} as CorsOptions

export default corsconfig