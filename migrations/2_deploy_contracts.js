const MathLib = artifacts.require('./libraries/MathLib.sol');
const OrderLib = artifacts.require('./libraries/OrderLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractOraclize = artifacts.require('./oraclize/TestableMarketContractOraclize.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');
const MarketContractFactory = artifacts.require(
  './oraclize/TestableMarketContractFactoryOraclize.sol'
);

// NOTE: Currently the factory contract is a version that is deploying a testable MARKET contract, and not the
// production version.  We should be using inheritance but due to gas constraints that fails.

module.exports = function(deployer, network) {
  if (network !== 'live') {
    deployer.deploy(MathLib);
    deployer.deploy(OrderLib);
    deployer.deploy(MarketContractRegistry);

    deployer.link(MathLib, MarketContractOraclize);
    deployer.link(OrderLib, MarketContractOraclize);

    deployer.link(MathLib, MarketContractFactory);
    deployer.link(OrderLib, MarketContractFactory);

    const marketTokenToLockForTrading = 0; // for testing purposes, require no loc
    const marketTokenAmountForContractCreation = 0; //for testing purposes require no balance
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    // deploy primary instance of market contract
    deployer
      .deploy(MarketToken, marketTokenToLockForTrading, marketTokenAmountForContractCreation)
      .then(function() {
        return deployer
          .deploy(CollateralToken, 'CollateralToken', 'CTK', 10000, 18, {
            gas: gasLimit,
            from: web3.eth.accounts[0]
          })
          .then(function() {
            return MarketContractRegistry.deployed().then(function(registryInstance) {
              // deploy the factory
              return deployer
                .deploy(MarketContractFactory, registryInstance.address, {
                  gas: gasLimit,
                  from: web3.eth.accounts[0]
                })
                .then(async function(factory) {
                  await registryInstance.addFactoryAddress(factory.address); // white list the factory

                  return factory.deployMarketContractOraclize(
                    'ETHXBT',
                    MarketToken.address,
                    CollateralToken.address,
                    [20155, 60465, 2, 10, marketContractExpiration],
                    'URL',
                    'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                    { gas: gasLimit, from: web3.eth.accounts[0] }
                  );
                });
            });
          })
          .then(function(results) {
            return deployer
              .deploy(MarketCollateralPool, results.logs[0].args.contractAddress, {
                gas: gasLimit,
                from: web3.eth.accounts[0]
              })
              .then(function() {
                return MarketContractOraclize.at(results.logs[0].args.contractAddress);
              })
              .then(function(instance) {
                return instance.setCollateralPoolContractAddress(MarketCollateralPool.address);
              });
          });
      })
      .then(function() {
        //deploy second identical contract for testing purposes
        return MarketToken.deployed().then(function() {
          return CollateralToken.deployed()
            .then(function() {
              return MarketContractRegistry.deployed().then(function(registryInstance) {
                return MarketContractFactory.deployed().then(async function(factory) {
                  return factory.deployMarketContractOraclize(
                    'ETHXBT-2',
                    MarketToken.address,
                    CollateralToken.address,
                    [20155, 60465, 2, 10, marketContractExpiration],
                    'URL',
                    'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0',
                    { gas: gasLimit, from: web3.eth.accounts[0] }
                  );
                });
              });
            })
            .then(function(results) {
              return deployer
                .deploy(MarketCollateralPool, results.logs[0].args.contractAddress, {
                  gas: gasLimit,
                  from: web3.eth.accounts[0]
                })
                .then(function() {
                  return MarketContractOraclize.at(results.logs[0].args.contractAddress);
                })
                .then(function(instance) {
                  return instance.setCollateralPoolContractAddress(MarketCollateralPool.address);
                });
            });
        });
      });
  }
};
