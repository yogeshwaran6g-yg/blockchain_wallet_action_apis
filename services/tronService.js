const TronWeb = require('tronweb');
const axios = require('axios');
require("dotenv").config();
const tron = new TronWeb({ fullHost: 'https://api.trongrid.io'});
const {querySql}=require("../db");

module.exports=
{
    createTronAccount: async function () {
        try {
            const account = await TronWeb.createAccount();
            console.log('Private Key:', account.privateKey); // base58 address
            console.log('Address (base58):', account.address.base58); // hex address (optional)
            console.log('Address (hex):', account.address.hex);
            const resultData = {
                privateKey: account.privateKey,
                accountAddressBase58: account.address.base58,
                addressHex: account.address.hex
            };
            console.log("resultData ", resultData);
            return resultData;
        } catch (err) {
            console.error("error on creating tron account ", err.message);
            return {};
        }
    },
    
    
    storeAccountData:async function(accountData){
        try{
            const sqlQuery="INSERT INTO tron_wallets (address_base58,address_hex,private_key) VALUES (?,?,?)";
            const params=[accountData.accountAddressBase58,accountData.addressHex,accountData.privateKey];
            const dbResult=await querySql(sqlQuery,params);
            return { success: true, data: dbResult };
        }catch(err){
            console.error("error on storing tron account data ",err.message);
            return { success: false, error: err.message };
        }
    }


}    