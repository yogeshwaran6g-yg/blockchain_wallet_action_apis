const { ethers } = require('ethers');
const axios = require('axios');

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BSC);
const ADMIN_PRIV = process.env.ADMIN_BSC_PRIVATE_KEY;
const ADMIN_ADDR = process.env.ADMIN_BSC_ADDRESS;

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 value) returns (bool)'
];

module.exports.createWallet = () => {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
};

module.exports.getTokenBalance = async (tokenContract, address) => {
  const contract = new ethers.Contract(tokenContract, ERC20_ABI, provider);
  const raw = await contract.balanceOf(address);
  let decimals = 18;
  try { decimals = await contract.decimals(); } catch(e){}
  const balance = ethers.formatUnits(raw, decimals);
  return { raw: raw.toString(), decimals: Number(decimals), balance };
};

module.exports.forwardToken = async (fromPrivateKey, tokenContract, toAddress) => {
  const wallet = new ethers.Wallet(fromPrivateKey, provider);
  const token = new ethers.Contract(tokenContract, ERC20_ABI, wallet);
  const rawBal = await token.balanceOf(wallet.address);
  if (rawBal.isZero()) throw new Error('zero token balance');

  const gasPrice = await provider.getGasPrice();
  const gasEstimate = await token.estimateGas.transfer(toAddress, rawBal);
  const nativeNeeded = gasEstimate.mul(gasPrice);
  const nativeBal = await provider.getBalance(wallet.address);
  if (nativeBal.lt(nativeNeeded)) {
    throw new Error('insufficient native balance for gas');
  }

  const tx = await token.transfer(toAddress, rawBal, { gasLimit: gasEstimate });
  const receipt = await tx.wait(3);
  try {
    await axios.post(process.env.LARAVEL_WEBHOOK_BASE + '/forwarded', { chain: 'bsc', txHash: tx.hash, receipt });
  } catch (e) { console.error('webhook forward failed', e.message); }
  return { txHash: tx.hash, receipt };
};
