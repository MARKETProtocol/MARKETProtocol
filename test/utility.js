const BN = require('bn.js');
const MarketContractMPX = artifacts.require('MarketContractMPX');
const Utils = require('web3-utils');

const { AbstractWeb3Module } = require('web3-core');
const {
  AbstractMethodFactory,
  GetBlockByNumberMethod,
  AbstractMethod
} = require('web3-core-method');
const { formatters } = require('web3-core-helpers');

class EVMManipulator extends AbstractWeb3Module {
  /**
   * @param {AbstractSocketProvider|HttpProvider|CustomProvider|String} provider
   *
   * @constructor
   */
  constructor(provider) {
    super(provider);
  }

  /**
   * Creates and evm snapshot
   *
   * @returns {Promise<string>} evm snapshot Id
   */
  createSnapshot() {
    const method = new AbstractMethod('evm_snapshot', 0, Utils, formatters, this);
    method.setArguments(arguments);

    return method.execute();
  }

  /**
   * Restores the EVM to the snapshot set in id
   *
   * @param {string} snapshotId
   */
  restoreSnapshot(snapshotId) {
    const method = new AbstractMethod('evm_revert', 1, Utils, formatters, this);
    method.setArguments([snapshotId]);

    return method.execute();
  }

  increase(duration) {
    const increaseTimeMethod = new AbstractMethod('evm_increaseTime', 1, Utils, formatters, this);
    increaseTimeMethod.setArguments([duration]);

    return increaseTimeMethod.execute().then(() => {
      const mineMethod = new AbstractMethod('evm_mine', 0, Utils, formatters, this);
      mineMethod.setArguments([]);

      return mineMethod.execute();
    });
  }
}

module.exports = {
  /**
   * Given a specific set of contract specifications and an execution price, this function returns
   * the needed collateral a user must post in order to execute a trade at that price.
   *
   * @param priceFloor
   * @param priceCap
   * @param qtyMultiplier
   * @param qty
   * @param price
   * @return {number}
   */
  calculateCollateralToReturn(priceFloor, priceCap, qtyMultiplier, qty, price) {
    const zero = 0;
    let maxLoss;
    if (qty > zero) {
      if (price <= priceFloor) {
        maxLoss = zero;
      } else {
        maxLoss = price.sub(priceFloor);
      }
    } else {
      if (price >= priceCap) {
        maxLoss = zero;
      } else {
        maxLoss = priceCap.sub(price);
      }
    }
    return maxLoss.mul(qty.abs()).mul(qtyMultiplier);
  },

  /**
   * Calculate total collateral required for a price range
   *
   * @param {number} priceFloor
   * @param {number} priceCap
   * @param {number} qtyMultiplier
   * @return {number}
   */
  calculateTotalCollateral(priceFloor, priceCap, qtyMultiplier) {
    return priceCap.sub(priceFloor).mul(qtyMultiplier);
  },

  /**
   * Create MarketContract
   *
   * @param {CollateralToken} collateralToken
   * @param {MarketCollateralPool} collateralPool
   * @param {string} userAddress
   * @param {string | null} oracleHubAddress
   * @param {number[] | null} contractSpecs
   * @return {MarketContractMPX}
   */
  createMarketContract(
    collateralToken,
    collateralPool,
    userAddress,
    oracleHubAddress,
    contractSpecs
  ) {
    const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50); // order expires 50 minutes from now.
    const oracleURL = 'api.coincap.io/v2/rates/bitcoin';
    const oracleStatistic = 'rateUSD';

    if (!oracleHubAddress) {
      oracleHubAddress = userAddress;
    }

    if (!contractSpecs) {
      contractSpecs = [0, 150, 2, 2, 100, 50, expiration];
    }
    const contractNames = [
      web3.utils.asciiToHex('BTC', 32),
      web3.utils.asciiToHex('LBTC', 32),
      web3.utils.asciiToHex('SBTC', 32)
    ];

    return MarketContractMPX.new(
      contractNames,
      [userAddress, collateralToken.address, collateralPool.address],
      oracleHubAddress,
      contractSpecs,
      oracleURL,
      oracleStatistic
    );
  },

  increase(duration) {
    return new EVMManipulator(web3.currentProvider).increase(duration);
  },

  expirationInDays(days) {
    const daysInSeconds = 60 * 60 * 24 * days;
    return Math.round(new Date().getTime() / 1000 + daysInSeconds);
  },

  /**
   * Creates an EVM Snapshot and returns a Promise that resolves to the id of the snapshot.
   *
   * @returns {Promise<string>} snapshotId
   */
  createEVMSnapshot() {
    return new EVMManipulator(web3.currentProvider).createSnapshot();
  },

  /**
   * Restores the EVM to the snapshot set in id
   *
   * @param {string} snapshotId
   */
  restoreEVMSnapshotsnapshotId(snapshotId) {
    return new EVMManipulator(web3.currentProvider).restoreSnapshot(snapshotId);
  },

  /**
   * Settle MarketContract
   *
   * @param {MarketContractMPX} marketContract
   * @param {number} settlementPrice
   * @param {string} userAddress
   * @return {MarketContractMPX}
   */
  async settleContract(marketContract, settlementPrice, userAddress) {
    await marketContract.arbitrateSettlement(settlementPrice, { from: userAddress }); // price above cap!
    return await marketContract.settlementPrice.call({ from: userAddress });
  },

  async shouldFail(block, message, errorContainsMessage, containsMessage) {
    let error = null;
    try {
      await block();
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error, message);
    if (errorContainsMessage) {
      assert.ok(error.message.includes(errorContainsMessage), containsMessage);
    }
  }
};
