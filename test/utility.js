const MarketContractOraclize = artifacts.require('MarketContractOraclize');

module.exports = {
  /**
   * Signs a message.
   *
   * @param web3
   * @param address
   * @param message
   * @return {[*,*,*]}
   */
  signMessage(web3, address, message) {
    const signature = web3.eth.sign(address, message);
    const r = signature.slice(0, 66);
    const s = `0x${signature.slice(66, 130)}`;
    let v = web3.toDecimal(`0x${signature.slice(130, 132)}`);
    if (v !== 27 && v !== 28) v += 27;
    return [v, r, s];
  },

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
   * @return {MarketContractOraclize}
   */
  createMarketContract(collateralToken, collateralPool, userAddress, oracleHubAddress) {
    const expiration = new Date().getTime() / 1000 + 60 * 50; // order expires 50 minutes from now.
    const oracleDataSoure = 'URL';
    const oracleQuery =
      'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0';

    if (!oracleHubAddress) {
      oracleHubAddress = userAddress;
    }

    return MarketContractOraclize.new(
      'MyNewContract',
      [userAddress, collateralToken.address, collateralPool.address],
      oracleHubAddress,
      [0, 150, 2, 2, expiration],
      oracleDataSoure,
      oracleQuery
    );
  },

  /**
   * Settle MarketContract
   *
   * @param {MarketContractOraclize} marketContract
   * @param {number} priceCap
   * @param {string} userAddress
   * @return {MarketContractOraclize}
   */
  async settleContract(marketContract, priceCap, userAddress) {
    await marketContract.oracleCallBack(priceCap.plus(10), { from: userAddress }); // price above cap!
    return await marketContract.settlementPrice.call({ from: userAddress });
  }
};
