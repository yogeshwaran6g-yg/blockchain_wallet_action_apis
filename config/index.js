require("dotenv").config();


const Env=process.env.NODE_ENV;

module.exports={
    config:{
        PORT: process.env.PORT || 4000,
        NODE_ENV: Env || "localhost",
        DB_HOST: process.env.DB_HOST || "localhost",
        DB_USERNAME: process.env.DB_USERNAME || "root",
        DB_PASSWORD: process.env.DB_PASSWORD || "",
        DB_NAME: process.env.DB_NAME || "crypto",
        DB_PORT: process.env.DB_PORT || "",

    }
}



// get /tron/walletCreate
// get /evm/walletCreate
// tron data format={privateKey: account.privateKey,accountAddressBase58: account.address.base58,addressHex: account.address.hex}
// evm data format ={ address: wallet.address, privateKey: wallet.privateKey };
