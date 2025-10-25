const { ethers } = require('ethers');
const axios = require('axios');


module.exports.createWallet = (req,res) => {
   try{
        const wallet = ethers.Wallet.createRandom();
        const data = { address: wallet.address, privateKey: wallet.privateKey };
        return res.status(200).json(data);
   }catch(err){
        console.log('Error creating wallet:', err);
        return res.status(500).send('internal server error');
   } 
   
};
