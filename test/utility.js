const MarketContractMPX = artifacts.require('MarketContractMPX');

module.exports = {
  /**
   * Returns a promise that resolves to the next set of events of eventName publish by the contract
   *
   * @param contract
   * @param eventName
   * @return {Promise}
   */
  getEvent(contract, eventName) {
    return new Promise((resolve, reject) => {
      const event = contract[eventName]();
      event.get((error, logs) => {
        if (error) {
          return reject(error);
        }
        return resolve(logs);
      });
    });
  },

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
  calculateNeededCollateral(priceFloor, priceCap, qtyMultiplier, qty, price) {
    const zero = 0;
    let maxLoss;
    if (qty > zero) {
      if (price <= priceFloor) {
        maxLoss = zero;
      } else {
        maxLoss = price - priceFloor;
      }
    } else {
      if (price >= priceCap) {
        maxLoss = zero;
      } else {
        maxLoss = priceCap - price;
      }
    }
    return maxLoss * Math.abs(qty) * qtyMultiplier;
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
    return (priceCap - priceFloor) * qtyMultiplier;
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
      contractSpecs = [0, 150, 2, 2, 100, expiration];
    }
    const contractNames = 'BTC,LBTC,SBTC';

    return MarketContractMPX.new(
      contractNames,
      [userAddress, collateralToken.address, collateralPool.address],
      oracleHubAddress,
      contractSpecs,
      oracleURL,
      oracleStatistic
    );
  },

  /**
   * Settle MarketContract
   *
   * @param {MarketContractMPX} marketContract
   * @param {number} priceCap
   * @param {string} userAddress
   * @return {MarketContractMPX}
   */
  async settleContract(marketContract, priceCap, userAddress) {
    await marketContract.oracleCallBack(priceCap.plus(10), { from: userAddress }); // price above cap!
    return await marketContract.settlementPrice.call({ from: userAddress });
  },

  async shouldFail(block, message) {
    let error = null;
    try {
      await block();
    } catch (err) {
      error = err;
    }

    assert.instanceOf(error, Error, message);
  }
};
