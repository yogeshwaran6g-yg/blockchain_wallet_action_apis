const TronWeb = require('tronweb');
require("dotenv").config();
const tron = new TronWeb({ fullHost: 'https://api.trongrid.io'});
const tronService = require('../services/tronService'); 


module.exports.createWallet = async (req,res) => {
  try{
 
    const createAccResult = await tronService.createTronAccount();          
    console.log(createAccResult);
    return res.status(200).json({createAccResult});      
  }catch(err){
    console.error('Error creating wallet:', err);
    return res.status(500).send('internal server error');
  }
}

