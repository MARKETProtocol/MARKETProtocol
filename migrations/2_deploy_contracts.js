var MathLib = artifacts.require("./libraries/MathLib.sol");
var OrderLib = artifacts.require("./libraries/OrderLib.sol");
var CollateralToken = artifacts.require("./tokens/CollateralToken.sol");
var MarketContractOraclize = artifacts.require("./oraclize/MarketContractOraclize.sol");
var MarketContractRegistry = artifacts.require("./MarketContractRegistry.sol");

// example of deploying a contract using a basic ERC20 token example as collateral
// and uses kraken's ETH/BTC price repeating  the queries every 30 seconds
module.exports = function(deployer) {
    deployer.deploy(MathLib);
    deployer.deploy(OrderLib);
    deployer.deploy(MarketContractRegistry)

    deployer.link(MathLib, MarketContractOraclize);
    deployer.link(OrderLib, MarketContractOraclize);

    deployer.deploy(CollateralToken).then(function() {
        var expiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.
        return deployer.deploy(
                            MarketContractOraclize,
                            "ETHXBT",
                            CollateralToken.address,
                            [20155, 60465, 2, 10, expiration],
                            "URL",
                            "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
                            120,
                            {gas:6710000 ,  value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]})
    })

    // add deployed contract to whitelist.
    deployer.then(function() {
        return MarketContractRegistry.deployed();
    }).then(function (instance) {
        instance.addAddressToWhiteList(MarketContractOraclize.address);
    });
};
