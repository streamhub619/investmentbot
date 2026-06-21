const CryptoJS = require("crypto-js");

function encryptKey(text) {
  return CryptoJS.AES.encrypt(text, process.env.EXCHANGE_ENCRYPTION_KEY).toString();
}

function decryptKey(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, process.env.EXCHANGE_ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encryptKey, decryptKey };