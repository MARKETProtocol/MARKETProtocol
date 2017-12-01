var MathLib = artifacts.require("./libraries/MathLib.sol");
var OrderLib = artifacts.require("./libraries/OrderLib.sol");
var CollateralToken = artifacts.require("./tokens/CollateralToken.sol");
var MarketContractOraclize = artifacts.require("./oraclize/MarketContractOraclize.sol");
var MarketCollateralPool = artifacts.require("./MarketCollateralPool.sol");
var MarketContractRegistry = artifacts.require("./MarketContractRegistry.sol");
var MarketToken = artifacts.require("./tokens/MarketToken.sol");

// example of deploying a contract using a basic ERC20 token example as collateral
// and uses kraken's ETH/BTC price repeating  the queries every 30 seconds
module.exports = function(deployer, network) {
    if(network != "live") {
        deployer.deploy(MathLib);
        deployer.deploy(OrderLib);
        deployer.deploy(MarketContractRegistry)

        deployer.link(MathLib, MarketContractOraclize);
        deployer.link(OrderLib, MarketContractOraclize);

        var marketTokenToLockForTrading = 0;    // for testing purposes, require no lock
        var marketTokenAmountForContractCreation = 0;   //for testing purposes require no balance
        deployer.deploy(MarketToken, marketTokenToLockForTrading, marketTokenAmountForContractCreation).then(function() {
            return deployer.deploy(CollateralToken).then(function() {
                var expiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
                return deployer.deploy(
                                    MarketContractOraclize,
                                    "ETHXBT",
                                    MarketToken.address,
                                    CollateralToken.address,
                                    [20155, 60465, 2, 10, expiration],
                                    "URL",
                                    "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
                                    120,
                                    { gas:6100000 ,
                                    value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]})
            }).then(function() {
                return deployer.deploy(
                    MarketCollateralPool,
                    MarketContractOraclize.address
                ).then(function() {
                    return MarketContractOraclize.deployed();
                }).then(function(instance) {
                    return instance.setCollateralPoolContractAddress(MarketCollateralPool.address);
                });
            }).then(function() {
                return MarketContractRegistry.deployed();
            }).then(function (instance) {
                instance.addAddressToWhiteList(MarketContractOraclize.address);
            });
        });
    }
};
