  const axios = require("axios");
const { ethers } = require("ethers");

// Same ABI for ERC20 tokens (works for both BEP20 and Polygon)
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
// Polygon provider
const polygonProvider = new ethers.JsonRpcProvider(
  process.env.POLYGON_RPC_URL || "https://polygon-rpc.com"
);
const GAS_WALLET_PRIVATE_KEY = process.env.GAS_WALLET_PRIVATE_KEY;
const adminWallet = new ethers.Wallet(GAS_WALLET_PRIVATE_KEY, polygonProvider);

const polygonController = {
  // Create wallet (200)
  createWallet: async function (req, res) {
    try {
      const wallet = ethers.Wallet.createRandom();
      const data = { address: wallet.address, privateKey: wallet.privateKey };
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      console.log("Error creating Polygon wallet:", err);
      return res.status(500).json({
        success: false,
        error: "internal server error",
      });
    }
  },

  // Get token balance (200)
  getBalance: async function (req, res) {
    try {
      const { tokenContract, address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: "Address is required",
        });
      }

      const normalizedAddress = ethers.getAddress(address);

      // If no tokenContract provided, return POL balance
      if (!tokenContract) {
        const polBalance = await polygonProvider.getBalance(normalizedAddress);
        const formattedPOL = ethers.formatEther(polBalance);

        return res.status(200).json({
          success: true,
          wallet: normalizedAddress,
          network: "Polygon",
          balance: {
            raw: polBalance.toString(),
            formatted: formattedPOL,
            value: parseFloat(formattedPOL).toFixed(6),
          },
          token: {
            symbol: "POL",
            name: "Polygon Ecosystem Token",
            type: "native",
            decimals: 18,
            contract: "native",
          },
        });
      }

      // If tokenContract provided, return token balance
      const normalizedTokenContract = ethers.getAddress(tokenContract);
      const contract = new ethers.Contract(
        normalizedTokenContract,
        USDT_ABI,
        polygonProvider
      );

      // Get data in parallel for better performance
      const [rawBalance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(normalizedAddress),
        contract.decimals().catch(() => 18),
        contract.symbol?.().catch(() => "UNKNOWN"),
        contract.name?.().catch(() => "Unknown Token"),
      ]);

      const formattedBalance = ethers.formatUnits(rawBalance, decimals);

      return res.status(200).json({
        success: true,
        token: {
          contract: normalizedTokenContract,
          symbol: symbol,
          name: name,
          type: "ERC-20",
          decimals: Number(decimals),
        },
        wallet: normalizedAddress,
        network: "Polygon",
        rawBalance: rawBalance.toString(),
        balance: formattedBalance,
        formattedBalance: parseFloat(formattedBalance).toString(),
      });
    } catch (err) {
      console.log("Get balance error:", err);

      // Handle specific errors
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
          error: "Network error - cannot connect to Polygon",
        });
      }

      return res.status(500).json({
        success: false,
        error: err.message || "Internal server error",
      });
    }
  },

  // Get wallet transactions
  // Get both POL and token transactions (200)
  getAllTransactions: async function (req, res) {
    try {
      const { address } = req.body;
      const apiKey = process.env.ETHERSCAN_API_KEY;

      if (!address)
        return res
          .status(400)
          .json({ success: false, message: "Address required" });

      // Fetch both POL and token transactions in parallel
      const [polResponse, tokenResponse] = await Promise.all([
        axios.get(
          `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${address}&chainid=137&page=1&offset=50&sort=desc&apikey=${apiKey}`
        ),
        axios.get(
          `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${address}&chainid=137&page=1&offset=50&sort=desc&apikey=${apiKey}`
        ),
      ]);

      const allTransactions = [];
      console.log(polResponse.data, tokenResponse.data);
      // Process POL transactions
      if (polResponse.data.result && polResponse.data.result.length > 0) {
        const polTxs = polResponse.data.result.map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatEther(tx.value),
          tokenSymbol: "POL",
          tokenName: "Polygon Ecosystem Token",
          type: "native",
          blockNumber: parseInt(tx.blockNumber),
          timeStamp: new Date(parseInt(tx.timeStamp) * 1000),
          contractAddress: null,
          isError: tx.isError === "0" ? false : true,
        }));
        allTransactions.push(...polTxs);
      }

      // Process token transactions
      if (tokenResponse.data.result && tokenResponse.data.result.length > 0) {
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

      // Sort by timestamp (newest first)
      allTransactions.sort((a, b) => b.timeStamp - a.timeStamp);

      return res.status(200).json({
        success: true,
        total: allTransactions.length,
        network: "Polygon",
        data: allTransactions.slice(0, 100), // Limit to 100 transactions
      });
    } catch (error) {
      console.error("All transactions error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message,
        network: "Polygon",
      });
    }
  },

  // Transfer tokens (MATIC or ERC20) (200)
  transfer: async function (req, res) {
    if (req.body?.mode === "MATIC") {
      return res
        .status(400)
        .json({ error: "the matic still in the development" });

      try {
        const { fromPrivateKey, toAddress, amount } = req.body;

        if (!fromPrivateKey || !toAddress || !amount) {
          return res
            .status(400)
            .json({ success: false, error: "Missing required fields" });
        }

        // Create wallet signer
        const wallet = new ethers.Wallet(fromPrivateKey, polygonProvider);

        console.log("=== MATIC TRANSFER DEBUG ===");
        console.log("From Address:", wallet.address);
        console.log("To Address:", toAddress);
        console.log("Amount to send:", amount, "MATIC");
        console.log("Network: Polygon");

        // Check MATIC balance
        const balance = await polygonProvider.getBalance(wallet.address);
        const maticBalance = ethers.formatEther(balance);

        console.log(`Current MATIC Balance: ${maticBalance} MATIC`);

        // Check if sufficient MATIC balance
        if (Number(maticBalance) < Number(amount)) {
          return res.status(400).json({
            success: false,
            error: {
              message: "Insufficient MATIC balance",
              currentBalance: maticBalance,
              requiredAmount: amount,
            },
          });
        }

        // Convert amount to wei
        const amountInWei = ethers.parseEther(amount.toString());

        // Estimate gas
        const gasPrice = await polygonProvider.getFeeData();
        const estimatedGas = await polygonProvider.estimateGas({
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
          "MATIC"
        );
        console.log(
          "Total Cost (amount + gas):",
          ethers.formatEther(totalCost),
          "MATIC"
        );

        // Check if balance covers amount + gas
        if (balance < totalCost) {
          return res.status(400).json({
            success: false,
            error: {
              message: "Insufficient MATIC for amount + gas fees",
              available: maticBalance,
              required: ethers.formatEther(totalCost),
            },
          });
        }

        // Send MATIC transaction
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
        console.log("Network: Polygon");

        return res.json({
          success: true,
          data: {
            from: wallet.address,
            to: toAddress,
            amount: amount,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            network: "Polygon",
            currency: "MATIC",
          },
        });
      } catch (error) {
        console.error("MATIC Transfer Error:", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    } else {
      // ERC20 Token Transfer
      try {
        const { fromPrivateKey, tokenContract, toAddress, amount } = req.body;

        if (!fromPrivateKey || !tokenContract || !toAddress || !amount) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // Create signer wallet
        const wallet = new ethers.Wallet(fromPrivateKey, polygonProvider);

        console.log("\n=== POLYGON TRANSFER DEBUG ===");
        console.log("Network: Polygon");
        console.log("From:", wallet.address);
        console.log("Token Contract:", tokenContract);
        console.log("To:", toAddress);
        console.log("Amount:", amount);

        // Connect to token contract
        const contract = new ethers.Contract(tokenContract, USDT_ABI, wallet);

        // Fetch token info
        const [symbol, decimals, balance] = await Promise.all([
          contract.symbol(),
          contract.decimals(),
          contract.balanceOf(wallet.address),
        ]);

        const humanBalance = Number(ethers.formatUnits(balance, decimals));

        console.log(`Balance: ${humanBalance} ${symbol}`);
        console.log(`Network: Polygon`);

        if (humanBalance < amount) {
          return res.status(400).json({
            success: false,
            error: `Insufficient ${symbol} balance`,
            currentBalance: humanBalance,
            requiredAmount: amount,
            network: "Polygon",
          });
        }

        // Prepare transaction
        const amountInUnits = ethers.parseUnits(amount.toString(), decimals);

        // Estimate gas
        const gasEstimate = await contract.transfer.estimateGas(
          toAddress,
          amountInUnits
        );
        const gasPrice = await polygonProvider.getFeeData();

        console.log(`Estimated Gas: ${gasEstimate.toString()}`);
        console.log(
          `Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, "gwei")} Gwei`
        );

        // Send transaction
        const tx = await contract.transfer(toAddress, amountInUnits, {
          gasLimit: gasEstimate,
          gasPrice: gasPrice.gasPrice,
        });

        console.log("Transaction sent:", tx.hash);
        console.log("Network: Polygon");

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log("Confirmed in block:", receipt.blockNumber);

        return res.json({
          success: true,
          message: `${symbol} transferred successfully on Polygon!`,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          network: "Polygon",
          token: symbol,
        });
      } catch (error) {
        console.error("Polygon Transfer Error:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
          network: "Polygon",
        });
      }
    }
  },

  transferTokenWithGasSupport: async function (req, res) {
    try {
      const { fromPrivateKey, tokenContract, toAddress, amount } = req.body;

      if (!fromPrivateKey || !tokenContract || !toAddress || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log("\n=== POLYGON TRANSFER FLOW START ===");

      // Step 1: Create user wallet
      const userWallet = new ethers.Wallet(fromPrivateKey, polygonProvider);
      console.log("User Wallet:", userWallet.address);

      // Step 2: Connect token contract
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

      // Step 4: Estimate gas needed for transfer
      const amountInUnits = ethers.parseUnits(amount.toString(), decimals);
      const gasEstimate = await token.transfer.estimateGas(
        toAddress,
        amountInUnits
      );
      const gasPriceData = await polygonProvider.getFeeData();
      const gasPrice = gasPriceData.gasPrice;

      const totalGasMatic = Number(ethers.formatEther(gasEstimate * gasPrice));
      const gasBuffer = totalGasMatic * 1.2; // 20% safety margin

      console.log(`Estimated gas cost: ~${totalGasMatic} MATIC`);
      console.log(`Funding ${gasBuffer.toFixed(6)} MATIC from admin wallet...`);

      // Step 5: Admin sends required MATIC for gas
      const fundTx = await adminWallet.sendTransaction({
        to: userWallet.address,
        value: ethers.parseEther(gasBuffer.toFixed(6).toString()),
      });
      await fundTx.wait();
      console.log(`Gas funded successfully. TxHash: ${fundTx.hash}`);

      // Optional: short delay to ensure balance update across nodes
      await new Promise((r) => setTimeout(r, 5000));

      // Step 6: Execute the token transfer
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
        message: `${symbol} transferred successfully on Polygon.`,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        network: "Polygon",
        gasTopUpTx: fundTx.hash,
        from: userWallet.address,
        to: toAddress,
        amount,
        token: symbol,
      });
    } catch (error) {
      console.error("Polygon Custodial Transfer Error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        network: "Polygon",
      });
    }
  },

  // Additional Polygon-specific method: Get gas price
  getGasPrice: async function (req, res) {
    try {
      const feeData = await polygonProvider.getFeeData();

      return res.status(200).json({
        success: true,
        network: "Polygon",
        data: {
          gasPrice: ethers.formatUnits(feeData.gasPrice, "gwei"),
          maxFeePerGas: feeData.maxFeePerGas
            ? ethers.formatUnits(feeData.maxFeePerGas, "gwei")
            : null,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            ? ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")
            : null,
        },
      });
    } catch (error) {
      console.error("Get Polygon gas price error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        network: "Polygon",
      });
    }
  },

  
};

module.exports = polygonController;
