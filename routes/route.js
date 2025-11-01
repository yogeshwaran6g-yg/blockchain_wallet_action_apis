const express = require("express");
const router = express.Router()
const polygon =require('../controllers/polygonConroller');
const Bep20 =  require('../controllers/Bep20Controller');

//Bep20
router.get('/Bep20/createWallet', Bep20.createWallet);      //to create bep20 wallet 
router.post('/Bep20/getTokenBalance', Bep20.getBalance); //to get bep20 wallet balance 
router.post('/Bep20/getAllTransactions',Bep20.getAllTransactions);  //to get the bep20 wallet transactions 
router.post('/Bep20/transfer',Bep20.transfer);  //to transfer token
router.post('/Bep20/transferWithGasSupport',Bep20.transferBEP20WithGasSupport);  //

//polygon
router.get('/polygon/createWallet', polygon.createWallet);      //to create polygon wallet 
router.post('/polygon/getTokenBalance', polygon.getBalance); //to get polygon wallet balance 
router.post('/polygon/getAllTransactions',polygon.getAllTransactions);  //to get the polygon wallet transactions 
router.post('/polygon/transfer',polygon.transfer);  // to transfer token
router.post('/polygon/transferWithGasSupport',polygon.transferTokenWithGasSupport);  //


module.exports=router
