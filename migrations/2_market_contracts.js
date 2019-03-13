const MathLib = artifacts.require('./libraries/MathLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');
const MarketContractMPX = artifacts.require('./mpx/MarketContractMPX.sol');
const MarketContractFactory = artifacts.require('./mpx/MarketContractFactoryMPX.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');

module.exports = function(deployer, network) {
  if (network !== 'live') {
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    return web3.eth.getAccounts().then(function(accounts) {
      return deployer.deploy(MarketToken).then(function() {
        return deployer.deploy(MathLib).then(function() {
          return deployer.deploy(MarketContractRegistry).then(function() {
            return deployer
              .link(MathLib, [MarketContractMPX, MarketCollateralPool, MarketContractFactory])
              .then(function() {
                return deployer
                  .deploy(MarketCollateralPool, MarketContractRegistry.address)
                  .then(function() {
                    var gasLimit = web3.eth.getBlock('latest').gasLimit;
                    return MarketCollateralPool.deployed().then(function() {
                      return deployer
                        .deploy(CollateralToken, 'CollateralToken', 'CTK', 10000, 18, {
                          gas: gasLimit
                        })
                        .then(function() {
                          return deployer
                            .deploy(
                              MarketContractFactory,
                              MarketContractRegistry.address,
                              MarketCollateralPool.address,
                              {
                                gas: gasLimit
                              }
                            )
                            .then(function(factory) {
                              return MarketContractRegistry.deployed().then(function(
                                registryInstance
                              ) {
                                return registryInstance
                                  .addFactoryAddress(factory.address)
                                  .then(function() {
                                    // white list the factory
                                    return factory
                                      .setOracleHubAddress(accounts[8])
                                      .then(function() {
                                        return factory
                                          .deployMarketContractMPX(
                                            'BTC',
                                            CollateralToken.address,
                                            [
                                              20000000000000,
                                              60000000000000,
                                              10,
                                              100000000,
                                              marketContractExpiration
                                            ],
                                            'api.coincap.io/v2/rates/bitcoin',
                                            'rateUsd',
                                            { gas: gasLimit }
                                          )
                                          .then(function() {
                                            return factory.deployMarketContractMPX(
                                              'BTC-2',
                                              CollateralToken.address,
                                              [
                                                20000000000000,
                                                60000000000000,
                                                10,
                                                100000000,
                                                marketContractExpiration
                                              ],
                                              'api.coincap.io/v2/rates/bitcoin',
                                              'rateUsd',
                                              { gas: gasLimit }
                                            );
                                          });
                                      });
                                  });
                              });
                            });
                        });
                    });
                  });
              });
          });
        });
      });
    });
  }
};
