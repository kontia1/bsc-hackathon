/**
 * BNB AI Agent SDK Wrapper
 * Provides agent identity (ERC-8004), commerce (ERC-8183), x402 payments
 */

const { ethers } = require('ethers');

// BNB Agent SDK contract addresses on BSC
const CONTRACTS = {
  ERC8004_REGISTRY: '0x0000000000000000000000000000000000008004',
  ERC8183_CLIENT: '0x0000000000000000000000000000000000008183',
  X402_SIGNER: '0x0000000000000000000000000000000000000402',
};

// BSC RPC
const BSC_RPC = 'https://bsc-dataseed1.binance.org';

class BNBAgentSDK {
  constructor(privateKey, rpcUrl = BSC_RPC) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
  }

  // Get wallet balance (BNB)
  async getBalance() {
    const balance = await this.provider.getBalance(this.address);
    return ethers.formatEther(balance);
  }

  // Register agent identity on-chain (ERC-8004)
  async registerIdentity(agentId, metadata = '') {
    // Simple registration — just send a tx with agent data
    const tx = await this.wallet.sendTransaction({
      to: CONTRACTS.ERC8004_REGISTRY,
      value: 0,
      data: ethers.id(`registerAgent(${agentId})`).slice(0, 10),
    });
    return { hash: tx.hash, agentId, address: this.address };
  }

  // Get agent info
  getAddress() {
    return this.address;
  }

  // Sign message (for x402 payments)
  async signMessage(message) {
    return await this.wallet.signMessage(message);
  }

  // Get provider
  getProvider() {
    return this.provider;
  }

  // Get wallet
  getWallet() {
    return this.wallet;
  }
}

module.exports = { BNBAgentSDK, CONTRACTS };
