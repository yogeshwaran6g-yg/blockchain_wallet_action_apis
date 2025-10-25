require('dotenv').config();
const express = require('express');
const evm = require('./controllers/evmController');
const tron = require('./controllers/tronController');
const cors = require('cors');
const app = express();



app.use(cors(
  {
    origin: "*"
  }
));

app.get('/tron/walletCreate', tron.createWallet);
app.get('/evm/walletCreate', evm.createWallet);



app.get('/token/balance', async (req, res) => {
  try {
    const { chain, tokenContract, address } = req.query;
    if (chain === 'bsc') {
      const bal = await evm.getTokenBalance(tokenContract, address);
      return res.json(bal);
    } else if (chain === 'tron') {
      const bal = await tron.getTokenBalance(tokenContract, address);
      return res.json(bal);
    }
    res.status(400).send('unknown chain');
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.post('/forward', async (req, res) => {
  try {
    const { chain, tokenContract, fromPrivateKey, fromAddress, toAddress } = req.body;
    if (chain === 'bsc') {
      const tx = await evm.forwardToken(fromPrivateKey, tokenContract, toAddress);
      return res.json(tx);
    } else if (chain === 'tron') {
      const tx = await tron.forwardToken(fromPrivateKey, tokenContract, toAddress);
      return res.json(tx);
    }
    res.status(400).send('unknown chain');
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

(async function startPollers() {
  const pollInterval = parseInt(process.env.POLL_INTERVAL_MS || '15000');
  setInterval(async () => {
    try {
      // Load watched addresses from DB or config (not implemented in scaffold)
    } catch (e) { console.error('poller', e); }
  }, pollInterval);
})();

app.listen(process.env.PORT || 3001, () => console.log('node service listening on', process.env.PORT || 3001));
