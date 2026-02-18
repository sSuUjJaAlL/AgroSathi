import crypto from "node:crypto";

 const algorithm = "aes-256-cbc";
 
function createCiphertext(key: Buffer, iv: Buffer): crypto.Cipheriv {
    return crypto.createCipheriv(algorithm, key, iv);
}
function createDeCiphertext(key: Buffer, iv: Buffer): crypto.Decipheriv {
    return crypto.createDecipheriv(algorithm, key, iv);
}

function encryptKeys(text: string) {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const cipher =createCiphertext(key, iv);
    let encryptkeys = cipher.update(text, "utf-8", "hex");
    encryptkeys += cipher.final("hex");

    return {
      text: encryptkeys,
      key: key.toString("hex"),
      iv: iv.toString("hex"),
    };
}
function decryptKeys(text: string, keyhex: String, ivHex: string) {
    const key = Buffer.from(keyhex, "hex");
    const iv = Buffer.from(ivHex, "hex");

    const decipher = createDeCiphertext(key, iv);
    let decryptkeys = decipher.update(text, "hex", "utf-8");
    decryptkeys += decipher.final("utf-8");

    return decryptkeys;
}


export {
encryptKeys,
decryptKeys

} 