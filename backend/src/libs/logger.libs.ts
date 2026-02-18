import kleur from "kleur"
import winston from "winston"

const { combine , printf }=winston.format

const formatSTring=printf(({ level,message,service })=>{
    let jsonSTring=`{ "message":"${
        level==='error'
        ?kleur.red(message as string)
        :kleur.grey(message as string)
    }"`
    jsonSTring+=`,"level":"${level}","service":"${kleur.cyan(service as string)} "}`;
    return jsonSTring
})    

function loggercreate(service:string):winston.Logger{
    return winston.createLogger({
        levels:winston.config.syslog.levels,
        defaultMeta:{service},
        format:combine(formatSTring),
        transports:[new winston.transports.Console()]
    })

}
const agrologger= loggercreate("Agriculture-Advisory-System")
export default agrologger