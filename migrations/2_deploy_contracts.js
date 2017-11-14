var MarketContract = artifacts.require("./MarketContract.sol");
var MathLib = artifacts.require("./libraries/MathLib.sol");
var HashLib = artifacts.require("./libraries/HashLib.sol");
var ZeppelinERC20 = artifacts.require("zeppelin-solidity/contracts/token/ERC20.sol");
var ZeppelinSafeERC20 = artifacts.require("zeppelin-solidity/contracts/token/SafeERC20.sol");


// example of deploying a contract using kraken and ETH/BTC and repeating queries every 30 seconds
module.exports = function(deployer) {
  deployer.deploy(MathLib);
  deployer.link(MathLib, MarketContract);
  deployer.deploy(HashLib);
  deployer.link(HashLib, MarketContract);
  deployer.deploy(ZeppelinERC20);
  deployer.link(ZeppelinERC20, MarketContract);
  deployer.deploy(ZeppelinSafeERC20);
  deployer.link(ZeppelinSafeERC20, MarketContract);
  deployer.deploy(MarketContract, "ETHXBT",
  "0x0", "URL", "json(https://api.kraken.com/0/public/Ticker?pair=ETHXBT).result.XETHXXBT.c.0", 30,
   20155, 60465,  6, 1000, 60 * 15, {gas:5000000 ,  value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]});
};
