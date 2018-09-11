const LinkToken = artifacts.require('./chainlink/src/lib/LinkToken.sol');
const ChainLinkOracle = artifacts.require('./chainlink/src/Oracle.sol');
const MarketContractFactory = artifacts.require('./chainlink/MarketContractFactoryChainLink.sol');
const OracleHub = artifacts.require('./chainlink/OracleHubChainLink.sol');

const OrderLib = artifacts.require('./libraries/OrderLib.sol');
const MarketCollateralPoolFactory = artifacts.require(
  './factories/MarketCollateralPoolFactory.sol'
);
const MarketContractRegistry = artifacts.require('./MarketContractRegistry.sol');
const MarketToken = artifacts.require('./tokens/MarketToken.sol');

module.exports = function(deployer, network) {
  var gasLimit = web3.eth.getBlock('latest').gasLimit;
  if (network !== 'live') {

    deployer.link(OrderLib, MarketContractFactory);

    deployer.deploy(LinkToken).then(function () {
      deployer.deploy(ChainLinkOracle, LinkToken.address).then(function () {
        return MarketContractRegistry.deployed().then(function (registry) {
          return MarketCollateralPoolFactory.deployed().then(function (collateralFactory) {
            return deployer.deploy(
              MarketContractFactory,
              registry.address,
              MarketToken.address,
              collateralFactory.address,
              {gas: gasLimit, from: web3.eth.accounts[0]}
            ).then(function (factory) {
              return deployer.deploy(
                OracleHub,
                factory.address,
                LinkToken.address,
                ChainLinkOracle.address,
                {gas: gasLimit, from: web3.eth.accounts[0]}
                ).then(function (oracleHub) {
                  return factory.setOracleHubAddress(oracleHub.address, {from: web3.eth.accounts[0]});
              });
            });
          });
        });
      });
    });
  }
};