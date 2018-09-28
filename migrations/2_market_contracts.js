const MathLib = artifacts.require('./libraries/MathLib.sol');
const OrderLib = artifacts.require('./libraries/OrderLib.sol');
const OrderLibMock = artifacts.require('./mocks/OrderLibMock.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractOraclize = artifacts.require('./oraclize/TestableMarketContractOraclize.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketTradingHub = artifacts.require('./MarketTradingHub.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');

module.exports = function(deployer, network) {
  if (network !== 'live') {
    deployer.deploy([MathLib, OrderLib, MarketContractRegistry]).then(function(){

      deployer.link(MathLib,
        [ MarketContractOraclize, MarketCollateralPool, OrderLibMock ]
      );
      deployer.link(OrderLib, [OrderLibMock, MarketTradingHub]);

      return deployer.deploy([OrderLibMock, MarketCollateralPool]).then(function () {
        const marketTokenToLockForTrading = 0; // for testing purposes, require no loc
        const marketTokenAmountForContractCreation = 0; //for testing purposes require no balance
        var gasLimit = web3.eth.getBlock('latest').gasLimit;

        return MarketCollateralPool.deployed().then(function (marketCollateralPool) {
          return deployer
            .deploy(MarketToken, marketTokenToLockForTrading, marketTokenAmountForContractCreation)
            .then(function() {
              return deployer
                .deploy(CollateralToken, 'CollateralToken', 'CTK', 10000, 18, {
                  gas: gasLimit,
                  from: web3.eth.accounts[0]
                }).then(function () {
                  return deployer.deploy(
                    MarketTradingHub,
                    MarketToken.address,
                    MarketCollateralPool.address
                  ).then(function (marketTradingHub) {
                    return marketCollateralPool.setMarketTradingHubAddress(marketTradingHub.address);
                  });
                });
            });
        });
      });
    });
  }
};
