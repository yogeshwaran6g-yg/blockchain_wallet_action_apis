require('dotenv').config();
const express = require('express');
const apiRoutes = require('./routes/route');

const cors = require('cors');
const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors(
  {
    origin: "*"
  }
));

app.use("/api",apiRoutes);
app.use('/',function(req,res){
  console.log(
    `request ip ${req.ip}`
  )
})
app.listen(process.env.PORT || 3001, () => console.log('node service listening on', process.env.PORT || 3001));
