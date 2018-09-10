const LinkToken = artifacts.require('./chainlink/src/lib/LinkToken.sol');
const ChainLinkOracle = artifacts.require('./chainlink/src/Oracle.sol');


module.exports = function(deployer) {
  deployer.deploy(LinkToken).then( function() {
    deployer.deploy(ChainLinkOracle, LinkToken.address).then( function() {
      //deployer.deploy(MyContract, LinkToken.address, ChainLinkOracle.address);
    });
  });
};