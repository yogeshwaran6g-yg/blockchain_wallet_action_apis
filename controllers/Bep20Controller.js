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
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
];

const provider = new ethers.JsonRpcProvider(`${process.env.provider}`);
const GAS_WALLET_PRIVATE_KEY = process.env.GAS_WALLET_PRIVATE_KEY;
const adminWallet = new ethers.Wallet(GAS_WALLET_PRIVATE_KEY, provider);

const Bep20Controller = {
  //create wallet (200)
  createWallet: async function (req, res) {
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
  },

  //get wallet balance (200) for both bnp and token balance
  getBalance: async function (req, res) {
    try {
      const { tokenContract, address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: "Address is required",
        });
      }

      // Validate and normalize address
      const normalizedAddress = ethers.getAddress(address);

      // 🟡 Case 1: No token contract → Get native BNB balance
      if (!tokenContract) {
        if (!ethers.isAddress(address)) {
          return res.status(400).json({
            success: false,
            message: "Invalid wallet address format",
          });
        }
        const balance = await provider.getBalance(normalizedAddress);
        const formattedBNB = ethers.formatEther(balance);

        return res.status(200).json({
          success: true,
          wallet: normalizedAddress,
          network: "Binance Smart Chain",
          token: {
            symbol: "BNB",
            name: "Binance Coin",
            type: "native",
            decimals: 18,
            contract: "native",
          },
          balance: {
            raw: balance.toString(),
            formatted: formattedBNB,
            value: parseFloat(formattedBNB).toFixed(6),
          },
        });
      }

      // 🟣 Case 2: Token contract provided → Get BEP20 token balance
      const normalizedTokenContract = ethers.getAddress(tokenContract);
      const contract = new ethers.Contract(
        normalizedTokenContract,
        USDT_ABI,
        provider
      );

      // Fetch balance + token info in parallel
      const [rawBalance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(normalizedAddress),
        contract.decimals().catch(() => 18),
        contract.symbol?.().catch(() => "UNKNOWN"),
        contract.name?.().catch(() => "Unknown Token"),
      ]);

      const formattedBalance = ethers.formatUnits(rawBalance, decimals);

      return res.status(200).json({
        success: true,
        wallet: normalizedAddress,
        network: "Binance Smart Chain",
        token: {
          contract: normalizedTokenContract,
          symbol,
          name,
          type: "BEP20",
          decimals: Number(decimals),
        },
        rawBalance: rawBalance.toString(),
        balance: formattedBalance,
        formattedBalance: parseFloat(formattedBalance).toString(),
      });
    } catch (err) {
      console.error("Get balance error:", err);

      // Specific error handling
      if (err.code === "INVALID_ARGUMENT") {
        return res.status(400).json({
          success: false,
          error: "Invalid address format",
        });
      }

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
  },

  //get wallet transactions
  getTransactions: async function (req, res) {
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
      console.log(data)
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
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message,
      });
    }
  },

  // (200)
  getAllTransactions: async function (req, res) {
    try {
      const { address } = req.body;

      if (!address)
        return res
          .status(400)
          .json({ success: false, message: "Address required" });

      const apiKey = process.env.ETHERSCAN_API_KEY;            
      const normalTxURL = `https://api.etherscan.io/v2/api
                          ?chainid=56
                          &module=account
                          &action=txlist
                          &address=${address}
                          &page=1
                          &offset=50
                          &sort=desc
                          &apikey=${apiKey}`.replace(/\s+/g, "");
                          
      const tokenTxURL = `https://api.etherscan.io/v2/api
                          ?chainid=56
                          &module=account
                          &action=tokentx
                          &address=${address}
                          &sort=desc
                          &apikey=${apiKey}`.replace(/\s+/g, "");

                          // Fetch both BNB (native) and BEP20 transactions in parallel
                          const [bnbResponse, tokenResponse] = await Promise.all([
                            axios.get(normalTxURL),
                            axios.get(tokenTxURL),
                          ]);
      console.log(bnbResponse.data, tokenResponse.data)

      const allTransactions = [];

      // ✅ Native BNB transactions
      if (bnbResponse.data.status === "1" && bnbResponse.data.result.length > 0) {
        const bnbTxs = bnbResponse.data.result.map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatEther(tx.value),
          tokenSymbol: "BNB",
          tokenName: "Binance Coin",
          type: "native",
          blockNumber: parseInt(tx.blockNumber),
          timeStamp: new Date(parseInt(tx.timeStamp) * 1000),
          contractAddress: null,
          isError: tx.isError === "0" ? false : true,
        }));
        allTransactions.push(...bnbTxs);
      }

      // ✅ Token transactions (BEP20)
      if (tokenResponse.data.status === "1" && tokenResponse.data.result.length > 0) {
        const tokenTxs = tokenResponse.data.result.map((tx) => {
          const decimals = parseInt(tx.tokenDecimal) || 18;
          const value = parseFloat(tx.value) / Math.pow(10, decimals);

          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: value.toFixed(6),
            tokenSymbol: tx.tokenSymbol || "UNKNOWN",
            tokenName: tx.tokenName || "Unknown Token",
            type: "token",
            blockNumber: parseInt(tx.blockNumber),
            timeStamp: new Date(parseInt(tx.timeStamp) * 1000),
            contractAddress: tx.contractAddress,
          };
        });
        allTransactions.push(...tokenTxs);
      }

      // ✅ Sort by newest first
      allTransactions.sort((a, b) => b.timeStamp - a.timeStamp);

      // ✅ Final response
      return res.status(200).json({
        success: true,
        total: allTransactions.length,
        network: "Binance Smart Chain",
        data: allTransactions.slice(0, 100),
      });
    } catch (error) {
      console.error("BSC transaction history error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message,
        network: "Binance Smart Chain",
      });
    }
  },


  //transfer bep20 (optional bnp )
  transfer: async function (req, res) {
    if (req.body?.mode === "BNP") {
      try {
        const { fromPrivateKey, toAddress, amount } = req.body;

        if (!fromPrivateKey || !toAddress || !amount) {
          return res
            .status(400)
            .json({ success: false, error: "Missing required fields" });
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
            success: false,
            error: {
              message: "Insufficient BNB balance",
              currentBalance: bnbBalance,
              requiredAmount: amount,
            },
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
            success: false,
            error: {
              message: "Insufficient BNB for amount + gas fees",
              available: bnbBalance,
              required: ethers.formatEther(totalCost),
            },
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
          data: {
            from: wallet.address,
            to: toAddress,
            amount: amount,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
          },
        });
      } catch (error) {
        console.error("BNB Transfer Error:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    } else {
      try {
        const { fromPrivateKey, tokenContract, toAddress, amount } = req.body;

        if (!fromPrivateKey || !tokenContract || !toAddress || !amount) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Create signer wallet
        const wallet = new ethers.Wallet(fromPrivateKey, provider);
        console.log("\n=== Transfer Debug Info ===");
        console.log("From:", wallet.address);
        console.log("To:", toAddress);
        console.log("Token:", tokenContract);
        console.log("Amount:", amount);

        // ✅ Connect to token contract
        const contract = new ethers.Contract(tokenContract, USDT_ABI, wallet);

        // ✅ Fetch token info
        const [symbol, decimals, rawBalance] = await Promise.all([
          contract.symbol(),
          contract.decimals(),
          contract.balanceOf(wallet.address),
        ]);

        const humanBalance = Number(ethers.formatUnits(rawBalance, decimals));

        console.log(`Balance: ${humanBalance} ${symbol}`);

        if (humanBalance < Number(amount)) {
          return res.status(400).json({
            success: false,
            error: `Insufficient ${symbol} balance`,
            currentBalance: humanBalance,
            requiredAmount: amount,
          });
        }

        // ✅ Check wallet BNB balance for gas
        const bnbBalance = Number(
          ethers.formatEther(await provider.getBalance(wallet.address))
        );
        // const balance = await provider.getBalance(wallet.address);

        if (bnbBalance < 0.0002) {
          return res.status(400).json({
            success: false,
            error: "Insufficient BNB for gas fee",
            currentBNB: bnbBalance,
            requiredBNB: "≥ 0.0002",
          });
        }

        // ✅ Prepare transfer
        const amountInUnits = ethers.parseUnits(amount.toString(), decimals);

        // ✅ Estimate gas & gas price
        const gasEstimate = await contract.transfer.estimateGas(
          toAddress,
          amountInUnits
        );
        const gasData = await provider.getFeeData();

        console.log(`Gas Estimate: ${gasEstimate}`);
        console.log(
          `Gas Price: ${ethers.formatUnits(gasData.gasPrice, "gwei")} Gwei`
        );

        // ✅ Send transaction
        const tx = await contract.transfer(toAddress, amountInUnits, {
          gasLimit: gasEstimate,
          gasPrice: gasData.gasPrice,
        });

        console.log("TX Sent:", tx.hash);

        // ✅ Wait for confirmation
        const receipt = await tx.wait();
        console.log("Confirmed in block:", receipt.blockNumber);

        return res.json({
          success: true,
          message: `${symbol} transferred successfully!`,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          from: wallet.address,
          to: toAddress,
          amount: amount,
          token: symbol,
        });
      } catch (error) {
        console.error("Transfer Error:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  },

  transferBEP20WithGasSupport: async function (req, res) {
    try {
      const { fromPrivateKey, tokenContract, toAddress, amount } = req.body;

      if (!fromPrivateKey || !tokenContract || !toAddress || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log("\n=== BSC BEP20 TRANSFER FLOW START ===");

      // Step 1: Create user wallet
      const userWallet = new ethers.Wallet(fromPrivateKey, provider);
      console.log("User Wallet:", userWallet.address);

      // Step 2: Connect token contract (BEP20)
      const token = new ethers.Contract(tokenContract, USDT_ABI, userWallet);

      // Step 3: Fetch token info
      const [symbol, decimals, balance] = await Promise.all([
        token.symbol(),
        token.decimals(),
        token.balanceOf(userWallet.address),
      ]);
      const humanBalance = Number(ethers.formatUnits(balance, decimals));
      console.log(`Token: ${symbol}, Balance: ${humanBalance}`);

      if (humanBalance < amount) {
        return res.status(400).json({
          success: false,
          error: `Insufficient ${symbol} balance`,
          currentBalance: humanBalance,
          requiredAmount: amount,
        });
      }

      // Step 4: Estimate gas for transfer
      const amountInUnits = ethers.parseUnits(amount.toString(), decimals);
      const gasEstimate = await token.transfer.estimateGas(
        toAddress,
        amountInUnits
      );
      const gasPriceData = await provider.getFeeData();
      const gasPrice = gasPriceData.gasPrice;

      const totalGasBNB = Number(ethers.formatEther(gasEstimate * gasPrice));
      const gasBuffer = totalGasBNB * 1.2; // 20% safety margin

      console.log(`Estimated gas cost: ~${totalGasBNB} BNB`);
      console.log(`Funding ${gasBuffer.toFixed(6)} BNB from admin wallet...`);

      // Step 5: Admin sends required BNB for gas to user
      const fundTx = await adminWallet.sendTransaction({
        to: userWallet.address,
        value: ethers.parseEther(gasBuffer.toFixed(6).toString()),
      });
      await fundTx.wait();
      console.log(`Gas funded successfully. TxHash: ${fundTx.hash}`);

      // Optional delay to allow for node sync
      await new Promise((r) => setTimeout(r, 5000));

      // Step 6: Execute token transfer from user to admin (or any receiver)
      console.log("Transferring tokens now...");
      const tx = await token.transfer(toAddress, amountInUnits, {
        gasLimit: gasEstimate,
        gasPrice,
      });
      console.log("Token transfer tx sent:", tx.hash);

      const receipt = await tx.wait();
      console.log(
        `✅ ${symbol} transferred successfully in block ${receipt.blockNumber}`
      );

      return res.json({
        success: true,
        message: `${symbol} transferred successfully on BSC.`,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        network: "BSC",
        gasTopUpTx: fundTx.hash,
        from: userWallet.address,
        to: toAddress,
        amount,
        token: symbol,
      });
    } catch (error) {
      console.error("BSC Custodial Transfer Error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        network: "BSC",
      });
    }
  },

  // (optional)
  transferBNB: async function (req, res) {
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
  },

};

module.exports = Bep20Controller;
