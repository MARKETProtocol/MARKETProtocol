const LinkToken = artifacts.require('./chainlink/src/lib/LinkToken.sol');
const ChainLinkOracle = artifacts.require('./chainlink/src/Oracle.sol');
const MarketContractFactory = artifacts.require('./chainlink/MarketContractFactoryChainLink.sol');
const OracleHub = artifacts.require('./chainlink/OracleHubChainLink.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const OrderLib = artifacts.require('./libraries/OrderLib.sol');
const MarketCollateralPoolFactory = artifacts.require(
  './factories/MarketCollateralPoolFactory.sol'
);
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');

module.exports = function(deployer, network) {
  const gasLimit = web3.eth.getBlock('latest').gasLimit;
  const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.

  if (network !== 'live') {

    deployer.link(OrderLib, MarketContractFactory);

    return deployer.deploy(LinkToken).then(function (linkToken) {
      return deployer.deploy(ChainLinkOracle, LinkToken.address).then(function () {
        return MarketContractRegistry.deployed().then(function (registry) {
          return MarketCollateralPoolFactory.deployed().then(function (collateralFactory) {
            return deployer.deploy(
              MarketContractFactory,
              registry.address,
              MarketToken.address,
              collateralFactory.address,
              {gas: gasLimit, from: web3.eth.accounts[0]}
            ).then(function (factory) {
              return registry.addFactoryAddress(factory.address).then(function () {
                return deployer.deploy(
                  OracleHub,
                  factory.address,
                  LinkToken.address,
                  ChainLinkOracle.address,
                  {gas: gasLimit, from: web3.eth.accounts[0]}
                  ).then(function (oracleHub) {
                    // set the oracle hub address in the factory to allow to request queries.
                    return factory.setOracleHubAddress(
                      oracleHub.address,
                      {from: web3.eth.accounts[0]}
                      ).then(function() {
                        // transfer link token to hub to pay for queries.
                        return linkToken.transfer(oracleHub.address, 10e22).then(function () {
                          factory.deployMarketContractChainLink(
                            'ETHXBT',
                            CollateralToken.address,
                            [20155, 60465, 2, 10, marketContractExpiration],
                            'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
                            'result.XETHZUSD.c.0',
                            'fakeSleepJobId',
                            'fakeOnDemandJobId',
                            { gas: gasLimit, from: web3.eth.accounts[0] }
                          ).then(function(results) {
                            return collateralFactory.deployMarketCollateralPool(
                              results.logs[0].args.contractAddress,
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
  }
};