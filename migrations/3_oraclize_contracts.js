const MathLib = artifacts.require('./libraries/MathLib.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketContractFactory = artifacts.require('./oraclize/MarketContractFactoryOraclize.sol');
const MarketContract = artifacts.require('./oraclize/MarketContractOraclize.sol');
const OracleHub = artifacts.require('./oraclize/OracleHubOraclize.sol');

module.exports = function (deployer, network) {
  if (network !== 'live') {
    const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
    var gasLimit = web3.eth.getBlock('latest').gasLimit;

    deployer.link(MathLib, [MarketContractFactory, MarketContract]);
    return deployer.deploy(
      MarketContractFactory,
      MarketContractRegistry.address,
      {gas: gasLimit, from: web3.eth.accounts[0]}
    ).then(function (factory) {
      return MarketContractRegistry.deployed().then(function (registryInstance) {
        return registryInstance.addFactoryAddress(factory.address).then(function () { // white list the factory
          return deployer.deploy(
            OracleHub,
            factory.address,
            {gas: gasLimit, from: web3.eth.accounts[0], value: 1e18}
          ).then(function (oracleHub) {
            return factory.setOracleHubAddress(
              oracleHub.address,
              {from: web3.eth.accounts[0]}
            ).then(function () {
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
            })
          })
        });
      });
    });
  }
};
