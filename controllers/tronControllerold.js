const TronWeb = require('tronweb');
const axios = require('axios');
require("dotenv").config();
const tron = new TronWeb({ fullHost: 'https://api.trongrid.io'});
const tronService = require('../services/tronService'); 
// module.exports.createWallet = () => {
//   return tron.createAccount().then(a => ({ address: a.base58, privateKey: a.privateKey }));
// };


module.exports.createWallet = async (req,res) => {
  try{

      const createAccResult = await tronService.createTronAccount();
      if(createAccResult.length<1){        
        return res.status(500).send('error on creating tron account');
      }      
            
      return res.status(200).json({ createAccResult });
  }catch(err){
    console.error('Error creating wallet:', err);
    return res.status(500).send('internal server error');
  }
}









module.exports.getTokenBalance = async (tokenContract, address) => {
  const contract = await tron.contract().at(tokenContract);
  const raw = await contract.balanceOf(address).call();
  let decimals = 18;
  try { decimals = await contract.decimals().call(); } catch(e){}
  const balance = (BigInt(raw) / BigInt(10 ** decimals)).toString();
  return { raw: raw.toString(), decimals: Number(decimals), balance };
};

module.exports.forwardToken = async (fromPrivateKey, tokenContract, toAddress) => {
  tron.setPrivateKey(fromPrivateKey);
  const contract = await tron.contract().at(tokenContract);
  const fromAddress = tron.address.fromPrivateKey(fromPrivateKey);
  const rawBal = await contract.balanceOf(fromAddress).call();
  if (BigInt(rawBal) === BigInt(0)) throw new Error('zero token balance');

  const balanceTRX = await tron.trx.getBalance(fromAddress);
  if (balanceTRX < 1) throw new Error('insufficient TRX for fee');

  const tx = await contract.transfer(toAddress, rawBal).send();
  let receipt = null;
  for (let i=0;i<20;i++){
    try {
      receipt = await tron.trx.getTransactionInfo(tx);
      if (receipt && receipt.receipt && receipt.receipt.result === 'SUCCESS') break;
    } catch(e){}
    await new Promise(r=>setTimeout(r,3000));
  }
  try { await axios.post(process.env.LARAVEL_WEBHOOK_BASE + '/forwarded', { chain: 'tron', txId: tx, receipt }); } catch(e){ console.error('webhook', e.message) }
  return { txId: tx, receipt };
};
