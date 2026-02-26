import fs from "node:fs"
async function givebase(filepath:string){
    const chunks:Buffer[]=[]
    const stream =fs.createReadStream(filepath)

    return new Promise((resolve,reject)=>{
        stream.on('data',(chunk:any)=>{
            chunks.push(chunk)
        })
        stream.on('end',()=>{
            const buffer= Buffer.concat(chunks)
            const base64 = buffer.toString('base64')
            resolve(base64)
        })
        stream.on('error',(err)=>{
            reject(err)})
        })
    
    
}  
export default givebase