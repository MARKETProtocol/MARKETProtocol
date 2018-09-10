const MathLib = artifacts.require('./libraries/MathLib.sol');
const OrderLib = artifacts.require('./libraries/OrderLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractOraclize = artifacts.require('./oraclize/TestableMarketContractOraclize.sol');
const MarketCollateralPoolFactory = artifacts.require(
  './factories/MarketCollateralPoolFactory.sol'
);
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');
const MarketContractFactory = artifacts.require(
  './oraclize/TestableMarketContractFactoryOraclize.sol'
);

// NOTE: Currently the factory contract is a version that is deploying a testable MARKET contract, and not the
// production version.  We should be using inheritance but due to gas constraints that fails.

module.exports = function(deployer, network) {
  if (network !== 'live') {
    deployer.link(MathLib, MarketContractOraclize);
    deployer.link(OrderLib, MarketContractOraclize);

    deployer.link(MathLib, MarketContractFactory);
    deployer.link(OrderLib, MarketContractFactory);

    deployer.link(MathLib, MarketCollateralPoolFactory);

    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    return MarketContractRegistry.deployed().then(function(registryInstance) {
      // deploy the factories
      return deployer
        .deploy(MarketCollateralPoolFactory, registryInstance.address)
        .then(function(collateralPoolFactory) {
          return deployer
            .deploy(
              MarketContractFactory,
              registryInstance.address,
              MarketToken.address,
              collateralPoolFactory.address,
              { gas: gasLimit, from: web3.eth.accounts[0] }
            )
            .then(async function(factory) {
              await registryInstance.addFactoryAddress(factory.address); // white list the factory

              factory
                .deployMarketContractOraclize(
                  'ETHXBT',
                  CollateralToken.address,
                  [20155, 60465, 2, 10, marketContractExpiration],
                  'URL',
                  'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                  { gas: gasLimit, from: web3.eth.accounts[0] }
                )
                .then(function(results) {
                  return collateralPoolFactory.deployMarketCollateralPool(
                    results.logs[0].args.contractAddress,
                    { gas: gasLimit }
                  );
                });

              return factory
                .deployMarketContractOraclize(
                  'ETHXBT-2',
                  CollateralToken.address,
                  [20155, 60465, 2, 10, marketContractExpiration],
                  'URL',
                  'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                  { gas: gasLimit, from: web3.eth.accounts[0] }
                )
                .then(function(results) {
                  return collateralPoolFactory.deployMarketCollateralPool(
                    results.logs[0].args.contractAddress,
                    { gas: gasLimit }
                  );
                });
            });
        });
    });
  }
};
