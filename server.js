require('dotenv').config();
const express = require('express');
const evm = require('./controllers/evmController');
const tron = require('./controllers/tronController');
const cors = require('cors');
const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors(
  {
    origin: "*"
  }
));

app.get('/evm/walletCreate', evm.createWallet);      //to create bep20 wallet 
app.post('/evm/walletBalance', evm.getTokenBalance); //to get bep20 wallet balance 
app.post('/evm/walletTransactions',evm.getTransactions);  //to get the bep20 wallet transactions 
app.post('/evm/transfer',evm.transfer);  //to get the bep20 wallet transactions 

 
app.post('/evm/walletBalanceBnp', evm.getBNBBalance);
app.use('/',function(req,res){
  console.log(
    `request ip ${req.ip}`
  )
})
app.listen(process.env.PORT || 3001, () => console.log('node service listening on', process.env.PORT || 3001));
