const MathLib = artifacts.require('./libraries/MathLib.sol');
const LinkToken = artifacts.require('./chainlink/src/lib/LinkToken.sol');
const ChainLinkOracle = artifacts.require('./chainlink/src/Oracle.sol');
const MarketContractFactory = artifacts.require('./chainlink/MarketContractFactoryChainLink.sol');
const MarketContract = artifacts.require('./chainlink/MarketContractChainLink.sol');
const OracleHub = artifacts.require('./chainlink/OracleHubChainLink.sol');
const CollateralToken = artifacts.require('./tokens/CollateralToken.sol');
const MarketCollateralPool = artifacts.require('./MarketCollateralPool.sol');
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');

module.exports = function(deployer, network) {
  const gasLimit = web3.eth.getBlock('latest').gasLimit;
  const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.

  if (network !== 'live') {
    deployer.link(MathLib, [MarketContractFactory, MarketContract]);
    return deployer.deploy(LinkToken).then(function(linkToken) {
      return deployer.deploy(ChainLinkOracle, LinkToken.address).then(function() {
        return MarketContractRegistry.deployed().then(function(registry) {
          return deployer
            .deploy(MarketContractFactory, registry.address, MarketCollateralPool.address, {
              gas: gasLimit,
              from: web3.eth.accounts[0]
            })
            .then(function(factory) {
              return registry.addFactoryAddress(factory.address).then(function() {
                return deployer
                  .deploy(OracleHub, factory.address, LinkToken.address, ChainLinkOracle.address, {
                    gas: gasLimit,
                    from: web3.eth.accounts[0]
                  })
                  .then(function(oracleHub) {
                    // set the oracle hub address in the factory to allow to request queries.
                    return factory
                      .setOracleHubAddress(oracleHub.address, { from: web3.eth.accounts[0] })
                      .then(function() {
                        // transfer link token to hub to pay for queries.
                        return linkToken.transfer(oracleHub.address, 10e22).then(function() {
                          return factory.deployMarketContractChainLink(
                            'ETHXBT',
                            CollateralToken.address,
                            [20155, 60465, 2, 10, marketContractExpiration],
                            'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
                            'result.XETHZUSD.c.0',
                            'fakeSleepJobId',
                            'fakeOnDemandJobId',
                            { gas: gasLimit, from: web3.eth.accounts[0] }
                          );
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
