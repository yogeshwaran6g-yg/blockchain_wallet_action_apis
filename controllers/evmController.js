const { ethers } = require("ethers");
const axios = require("axios");
const USDT_ABI = [
 "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];
const provider = new ethers.JsonRpcProvider(`${process.env.provider}`);
// inrt

//create wallet
module.exports.createWallet = async function (req, res) {
  try {
    const wallet = ethers.Wallet.createRandom();
    const data = { address: wallet.address, privateKey: wallet.privateKey };
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.log("Error creating wallet:", err);
    return res
      .status(500)
      .json({ success: false, error: "internal server error" });
  }
};

//get wallet balance
module.exports.getTokenBalance = async function (req, res) {
  try {
    const { tokenContract, address } = req.body;

    if (!tokenContract || !address) {
      return res
        .status(400)
        .json({
          success: false,
          error: "tokenContract and address are required",
        });
    }

    // Normalize addresses
    const normalizedTokenContract = ethers.getAddress(tokenContract);
    const normalizedAddress = ethers.getAddress(address);

    const contract = new ethers.Contract(
      normalizedTokenContract,
      USDT_ABI,
      provider
    );

    // Get data in parallel for better performance
    const [rawBalance, decimals, symbol] = await Promise.all([
      contract.balanceOf(normalizedAddress),
      contract.decimals().catch(() => 18), // Default 18
      contract.symbol?.().catch(() => "UNKNOWN"), // Optional symbol
    ]);

    const formattedBalance = ethers.formatUnits(rawBalance, decimals);

    return res.status(200).json({
      success: true,
      token: {
        contract: normalizedTokenContract,
        symbol: symbol,
      },
      wallet: normalizedAddress,
      rawBalance: rawBalance.toString(),
      decimals: Number(decimals),
      balance: formattedBalance,
      formattedBalance: parseFloat(formattedBalance).toString(),
    });
  } catch (err) {
    console.log("Get token balance error:", err);

    // More specific error handling
    if (err.code === "CALL_EXCEPTION") {
      return res.status(400).json({
        success: false,
        error: "Contract call failed - check contract address",
      });
    }

    if (err.code === "NETWORK_ERROR") {
      return res.status(500).json({
        success: false,
        error: "Network error - cannot connect to BSC",
      });
    }

    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
};

//get wallet transactions
module.exports.getTransactions = async function (req, res) {
  try {
    const { address } = req.body;
    const apiKey = process.env.ETHERSCAN_API_KEY;

    if (!address) {
      return res
        .status(400)
        .json({ success: false, message: "Address is required" });
    }

    // The new unified API uses the "chainid" param to specify network
    // BSC Mainnet = 56
    const url = `https://api.etherscan.io/v2/api
      ?chainid=56
      &module=account
      &action=tokentx
      &address=${address}
      &sort=desc
      &apikey=${apiKey}`.replace(/\s+/g, "");

    const { data } = await axios.get(url);

    if (data.status !== "1" || !data.result?.length) {
      return res
        .status(404)
        .json({ success: false, message: "No BEP20 transactions found" });
    }

    return res.status(200).json({
      success: true,
      total: data.result.length,
      data: data.result.map((tx) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        tokenName: tx.tokenName,
        tokenSymbol: tx.tokenSymbol,
        value: (parseFloat(tx.value) / Math.pow(10, tx.tokenDecimal)).toFixed(
          4
        ),
        blockNumber: tx.blockNumber,
        timeStamp: new Date(tx.timeStamp * 1000),
      })),
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message,
      });
  }
};

//transfer bep20 (optional bnp )
module.exports.transfer = async function (req, res) {
  if (req.body?.mode === "BNP") {
    try {
      const { fromPrivateKey, toAddress, amount } = req.body;

      if (!fromPrivateKey || !toAddress || !amount) {
        return res.status(400).json({ success:false,error: "Missing required fields" });
      }

      // Create wallet signer
      const wallet = new ethers.Wallet(fromPrivateKey, provider);

      console.log("=== BNB TRANSFER DEBUG ===");
      console.log("From Address:", wallet.address);
      console.log("To Address:", toAddress);
      console.log("Amount to send:", amount, "BNB");

      // Check BNB balance
      const balance = await provider.getBalance(wallet.address);
      const bnbBalance = ethers.formatEther(balance);

      console.log(`Current BNB Balance: ${bnbBalance} BNB`);

      // Check if sufficient BNB balance
      if (Number(bnbBalance) < Number(amount)) {
        return res.status(400).json({
          success:false,
          error: {
               message:"Insufficient BNB balance",
               currentBalance: bnbBalance,
               requiredAmount: amount
               }
          });
      }

      // Convert amount to wei
      const amountInWei = ethers.parseEther(amount.toString());

      // Estimate gas
      const gasPrice = await provider.getFeeData();
      const estimatedGas = await provider.estimateGas({
        from: wallet.address,
        to: toAddress,
        value: amountInWei,
      });

      const estimatedGasCost = estimatedGas * gasPrice.gasPrice;
      const totalCost = amountInWei + estimatedGasCost;

      console.log("Estimated Gas:", estimatedGas.toString());
      console.log(
        "Gas Price:",
        ethers.formatUnits(gasPrice.gasPrice, "gwei"),
        "Gwei"
      );
      console.log(
        "Estimated Gas Cost:",
        ethers.formatEther(estimatedGasCost),
        "BNB"
      );
      console.log(
        "Total Cost (amount + gas):",
        ethers.formatEther(totalCost),
        "BNB"
      );

      // Check if balance covers amount + gas
      if (balance < totalCost) {
        return res.status(400).json({
          success:false,
          error: {message:"Insufficient BNB for amount + gas fees",
                 available: bnbBalance,
                  required: ethers.formatEther(totalCost)}
        });
      }

      // Send BNB transaction 
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountInWei,
        gasPrice: gasPrice.gasPrice,
      });

      console.log("Transaction Hash:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log("=== TRANSACTION SUCCESS ===");
      console.log("Block:", receipt.blockNumber);
      console.log("Status:", receipt.status === 1 ? "Success" : "Failed");

      return res.json({
        success: true,
        data:{

             from: wallet.address,
             to: toAddress,
             amount: amount,
             txHash: tx.hash,
             blockNumber: receipt.blockNumber,
          }
      });
    } catch (error) {
      console.error("BNB Transfer Error:", error);
      return res.status(500).json({success:false, error: error.message });
    }
  } else {
 
  try {
    const { fromPrivateKey, tokenContract, toAddress, amount } = req.body;

    if (!fromPrivateKey || !tokenContract || !toAddress || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 🧠 Create signer wallet
    const wallet = new ethers.Wallet(fromPrivateKey, provider);

    console.log("\n=== DEBUG INFO ===");
    console.log("From:", wallet.address);
    console.log("Token Contract:", tokenContract);
    console.log("To:", toAddress);
    console.log("Amount:", amount);

    // 🧩 Connect to token contract
    const contract = new ethers.Contract(tokenContract, USDT_ABI, wallet);

    // 🧮 Fetch token info
    const [symbol, decimals, balance] = await Promise.all([
      contract.symbol(),
      contract.decimals(),
      contract.balanceOf(wallet.address)
    ]);

    const humanBalance = Number(ethers.formatUnits(balance, decimals));

    console.log(`Balance: ${humanBalance} ${symbol}`);

    if (humanBalance < amount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient ${symbol} balance`,
        currentBalance: humanBalance,
        requiredAmount: amount,
      });
    }

    // 💰 Prepare transaction
    const amountInUnits = ethers.parseUnits(amount.toString(), decimals);

    // Estimate gas
    const gasEstimate = await contract.transfer.estimateGas(toAddress, amountInUnits);
    const gasPrice = await provider.getFeeData();

    console.log(`Estimated Gas: ${gasEstimate.toString()}`);
    console.log(`Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, "gwei")} Gwei`);

    // 🚀 Send transaction
    const tx = await contract.transfer(toAddress, amountInUnits, {
      gasLimit: gasEstimate,
      gasPrice: gasPrice.gasPrice,
    });

    console.log("Transaction sent:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("Confirmed in block:", receipt.blockNumber);

    return res.json({
      success: true,
      message: `${symbol} transferred successfully!`,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (error) {
    console.error("Transfer Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
  }
};









//(optional) to get the BNB balance 
module.exports.getBNBBalance = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required",
      });
    }

    // Validate address format using v6 syntax
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        message: "Invalid wallet address format",
      });
    }

    // Get balance - this is the corrected line
    const balance = await provider.getBalance(address);

    // Format the balance using v6 syntax
    const bnbBalance = ethers.formatEther(balance);

    res.json({
      success: true,
      address: address,
      balance: bnbBalance,
      symbol: "BNB",
      rawBalance: balance.toString(), // Optional: include raw balance in wei
    });
  } catch (error) {
    console.error("Error in getBNBBalance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch BNB balance",
      error: error.message,
    });
  }
};

// (optional) 
module.exports.transferBNB = async function (req, res) {
  try {
    const { fromPrivateKey, toAddress, amount } = req.body;

    if (!fromPrivateKey || !toAddress || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create wallet signer
    const wallet = new ethers.Wallet(fromPrivateKey, provider);

    console.log("=== BNB TRANSFER DEBUG ===");
    console.log("From Address:", wallet.address);
    console.log("To Address:", toAddress);
    console.log("Amount to send:", amount, "BNB");

    // Check BNB balance
    const balance = await provider.getBalance(wallet.address);
    const bnbBalance = ethers.formatEther(balance);

    console.log(`Current BNB Balance: ${bnbBalance} BNB`);

    // Check if sufficient BNB balance
    if (Number(bnbBalance) < Number(amount)) {
      return res.status(400).json({
        error: "Insufficient BNB balance",
        currentBalance: bnbBalance,
        requiredAmount: amount,
      });
    }

    // Convert amount to wei
    const amountInWei = ethers.parseEther(amount.toString());

    // Estimate gas
    const gasPrice = await provider.getFeeData();
    const estimatedGas = await provider.estimateGas({
      from: wallet.address,
      to: toAddress,
      value: amountInWei,
    });

    const estimatedGasCost = estimatedGas * gasPrice.gasPrice;
    const totalCost = amountInWei + estimatedGasCost;

    console.log("Estimated Gas:", estimatedGas.toString());
    console.log(
      "Gas Price:",
      ethers.formatUnits(gasPrice.gasPrice, "gwei"),
      "Gwei"
    );
    console.log(
      "Estimated Gas Cost:",
      ethers.formatEther(estimatedGasCost),
      "BNB"
    );
    console.log(
      "Total Cost (amount + gas):",
      ethers.formatEther(totalCost),
      "BNB"
    );

    // Check if balance covers amount + gas
    if (balance < totalCost) {
      return res.status(400).json({
        error: "Insufficient BNB for amount + gas fees",
        available: bnbBalance,
        required: ethers.formatEther(totalCost),
      });
    }

    // Send BNB transaction (NOT token transfer)
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountInWei,
      gasPrice: gasPrice.gasPrice,
    });

    console.log("Transaction Hash:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log("=== TRANSACTION SUCCESS ===");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");

    return res.json({
      success: true,
      message: "BNB transferred successfully!",
      from: wallet.address,
      to: toAddress,
      amount: amount,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });
  } catch (error) {
    console.error("BNB Transfer Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
