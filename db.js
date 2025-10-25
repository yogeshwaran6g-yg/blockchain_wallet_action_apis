const mysql = require('mysql2/promise');
const {config}=require("./config/index")

const db=mysql.createPool({
    host:config.DB_HOST,
    user:config.DB_USERNAME,
    password:config.DB_PASSWORD,
    database:config.DB_NAME,
    port:config.DB_PORT

});



module.exports={
    querySql:async function(sqlQuery,params=[]){
        try{
            const conn=await db.getConnection();
            const [result,f] = await conn.query(sqlQuery,params);
            return result.length>0 ? result : null
        }catch(error){
            console.error("query sql error ",error.message);
        }
    }
}