var MarketContract = artifacts.require("./MarketContract.sol");
var MathLib = artifacts.require("./libraries/MathLib.sol");
var OrderLib = artifacts.require("./libraries/OrderLib.sol");
var ZeppelinSafeERC20 = artifacts.require("zeppelin-solidity/contracts/token/SafeERC20.sol");
var CollateralToken = artifacts.require("./tokens/CollateralToken.sol");


// example of deploying a contract using a basic ERC20 token example as collateral
// and uses kraken's ETH/BTC price repeating  the queries every 30 seconds
module.exports = function(deployer) {
  deployer.deploy(MathLib);
  deployer.link(MathLib, MarketContract);
  deployer.deploy(OrderLib);
  deployer.link(OrderLib, MarketContract);
  deployer.deploy(ZeppelinSafeERC20);
  deployer.link(ZeppelinSafeERC20, MarketContract);
  deployer.deploy(CollateralToken).then(function() {
    return deployer.deploy(
                        MarketContract,
                        "ETHXBT",
                        CollateralToken.address,
                        "URL",
                        "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
                        30,
                        20155,
                        60465,
                        6,
                        1000,
                        60 * 15,
                        {gas:6000000 ,  value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]})
  })
};
