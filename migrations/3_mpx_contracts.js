const MathLib = artifacts.require('./libraries/MathLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketContractFactory = artifacts.require('./oraclize/MarketContractFactoryOraclize.sol');
const MarketContractMPX = artifacts.require('./mpx/MarketContractMPX.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');

module.exports = function(deployer, network) {
  if (network !== 'live') {
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    deployer.link(MathLib, [MarketContractFactory, MarketContractMPX]);
    return deployer
      .deploy(MarketContractFactory, MarketContractRegistry.address, MarketCollateralPool.address, {
        gas: gasLimit,
        from: web3.eth.accounts[0]
      })
      .then(function(factory) {
        return MarketContractRegistry.deployed().then(function(registryInstance) {
          return registryInstance.addFactoryAddress(factory.address).then(function() {
            // white list the factory

            return factory
              .setOracleHubAddress(web3.eth.accounts[8], { from: web3.eth.accounts[0] })
              .then(function() {
                return factory
                  .deployMarketContractMPX(
                    'BTC',
                    CollateralToken.address,
                    [20000000000000, 60000000000000, 10, 100000000, marketContractExpiration],
                    'api.coincap.io/v2/rates/bitcoin',
                    'rateUsd',
                    { gas: gasLimit, from: web3.eth.accounts[0] }
                  )
                  .then(function() {
                    return factory.deployMarketContractMPX(
                      'BTC-2',
                      CollateralToken.address,
                      [20000000000000, 60000000000000, 10, 100000000, marketContractExpiration],
                      'api.coincap.io/v2/rates/bitcoin',
                      'rateUsd',
                      { gas: gasLimit, from: web3.eth.accounts[0] }
                    );
                  });
              });
          });
        });
      });
  }
};
