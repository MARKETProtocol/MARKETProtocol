const MathLib = artifacts.require('./libraries/MathLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');
const MarketContractFactory = artifacts.require(
  './oraclize/TestableMarketContractFactoryOraclize.sol'
);

// NOTE: Currently the factory contract is a version that is deploying a testable MARKET contract, and not the
// production version.  We should be using inheritance but due to gas constraints that fails.

module.exports = function (deployer, network) {
  if (network !== 'live') {

    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    return MarketContractRegistry.deployed().then(function (registryInstance) {
      return deployer.link(MathLib, MarketContractFactory).then(function () {
        // deploy the factories
        return deployer
          .deploy(
            MarketContractFactory,
            registryInstance.address,
            MarketToken.address,
            {gas: gasLimit, from: web3.eth.accounts[0]}
          )
          .then(function (factory) {
            return registryInstance.addFactoryAddress(factory.address).then(function () { // white list the factory
              return factory
                .deployMarketContractOraclize(
                  'ETHXBT',
                  CollateralToken.address,
                  [20155, 60465, 2, 10, marketContractExpiration],
                  'URL',
                  'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                  {gas: gasLimit, from: web3.eth.accounts[0]}
                )
                .then(function () {
                  return factory
                    .deployMarketContractOraclize(
                      'ETHXBT-2',
                      CollateralToken.address,
                      [20155, 60465, 2, 10, marketContractExpiration],
                      'URL',
                      'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                      {gas: gasLimit, from: web3.eth.accounts[0]}
                    )
                });
            });
          });
      });
    });
  }
};
