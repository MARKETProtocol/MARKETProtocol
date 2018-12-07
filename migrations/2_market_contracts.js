const MathLib = artifacts.require('./libraries/MathLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractOraclize = artifacts.require('./oraclize/TestableMarketContractOraclize.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');

module.exports = function (deployer, network) {
  if (network !== 'live') {
    deployer.deploy([MathLib, MarketContractRegistry]).then(function () {

      deployer.link(MathLib,
        [MarketContractOraclize, MarketCollateralPool]
      );

      return deployer.deploy(MarketCollateralPool).then(function () {
        var gasLimit = web3.eth.getBlock('latest').gasLimit;
        return MarketCollateralPool.deployed().then(function () {
          return deployer
            .deploy(CollateralToken, 'CollateralToken', 'CTK', 10000, 18, {
              gas: gasLimit,
              from: web3.eth.accounts[0]
          })
        });
      });
    });
  }
};
