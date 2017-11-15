var MarketContract = artifacts.require("./MarketContract.sol");
var MathLib = artifacts.require("./libraries/MathLib.sol");
var OrderLib = artifacts.require("./libraries/OrderLib.sol");
var ZeppelinSafeERC20 = artifacts.require("zeppelin-solidity/contracts/token/SafeERC20.sol");


// example of deploying a contract using kraken and ETH/BTC and repeating queries every 30 seconds
module.exports = function(deployer) {
  deployer.deploy(MathLib);
  deployer.link(MathLib, MarketContract);
  deployer.deploy(OrderLib);
  deployer.link(OrderLib, MarketContract);
  deployer.deploy(ZeppelinSafeERC20);
  deployer.link(ZeppelinSafeERC20, MarketContract);
  deployer.deploy(MarketContract, "ETHXBT",
  "0x0", "URL", "json(https://api.kraken.com/0/public/Ticker?pair=ETHXBT).result.XETHXXBT.c.0", 30,
   20155, 60465,  6, 1000, 60 * 15, {gas:6000000 ,  value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]});
};
