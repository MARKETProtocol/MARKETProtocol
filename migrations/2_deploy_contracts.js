const MathLib = artifacts.require("./libraries/MathLib.sol");
const OrderLib = artifacts.require("./libraries/OrderLib.sol");
const CollateralToken = artifacts.require("./tokens/CollateralToken.sol");
const MarketContractOraclize = artifacts.require("./oraclize/TestableMarketContractOraclize.sol");
const MarketCollateralPool = artifacts.require("./MarketCollateralPool.sol");
const MarketContractRegistry = artifacts.require("./MarketContractRegistry.sol");
const MarketToken = artifacts.require("./tokens/MarketToken.sol");

// example of deploying a contract using a basic ERC20 token example as collateral
// and uses kraken's ETH/BTC price repeating  the queries every 30 seconds
module.exports = function(deployer, network) {
    if(network !== "live") {
        deployer.deploy(MathLib);
        deployer.deploy(OrderLib);
        deployer.deploy(MarketContractRegistry)

        deployer.link(MathLib, MarketContractOraclize);
        deployer.link(OrderLib, MarketContractOraclize);

        const marketTokenToLockForTrading = 0;    // for testing purposes, require no lock
        const marketTokenAmountForContractCreation = 0;   //for testing purposes require no balance
        const marketContractExpiration = Math.floor(Date.now() / 1000) + 60 * 15; // expires in 15 minutes.

        // deploy primary instance of market contract
        deployer.deploy(
            MarketToken,
            marketTokenToLockForTrading,
            marketTokenAmountForContractCreation
        ).then(function() {
            return deployer.deploy(CollateralToken, "CollateralToken", "CTK", 10000, 18).then(function() {
                let gasLimit = 6200000;  // gas limit for development network
                let block = web3.eth.getBlock("latest");
                if (block.gasLimit > 7000000) {  // coverage network
                    gasLimit = block.gasLimit;
                }
                return deployer.deploy(
                    MarketContractOraclize,
                    "ETHXBT",
                    MarketToken.address,
                    CollateralToken.address,
                    [20155, 60465, 2, 10, marketContractExpiration],
                    "URL",
                    "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
                    120,
                    { gas: gasLimit, value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]}
                )
            }).then(function() {
                return deployer.deploy(
                    MarketCollateralPool,
                    MarketContractOraclize.address
                ).then(function() {
                    return MarketContractOraclize.deployed();
                }).then(function(instance) {
                    return instance.setCollateralPoolContractAddress(MarketCollateralPool.address);
                })
            }).then(function() {
                return MarketContractRegistry.deployed();
            }).then(function (instance) {
                instance.addAddressToWhiteList(MarketContractOraclize.address);
            });
        }).then(function(){
            // deploy second identical contract for testing purposes
            return MarketToken.deployed().then(function() {
                return CollateralToken.deployed().then(function() {

                    let gasLimit = 6200000;  // gas limit for development network
                    let block = web3.eth.getBlock("latest");
                    if (block.gasLimit > 7000000) {  // coverage network allows for more gas.
                        gasLimit = block.gasLimit;
                    }

                    return MarketContractOraclize.new(
                        "ETHXBT-2",
                        MarketToken.address,
                        CollateralToken.address,
                        [20155, 60465, 2, 10, marketContractExpiration],
                        "URL",
                        "json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0",
                        120,
                        { gas: gasLimit, value: web3.toWei('.2', 'ether'), from: web3.eth.accounts[0]}
                    )
                }).then(function(deployedMarketContract) {
                    return MarketCollateralPool.new(
                        deployedMarketContract.address
                    ).then(function(deployedMarketCollateralPool) {
                        return deployedMarketContract.setCollateralPoolContractAddress(
                            deployedMarketCollateralPool.address
                        );
                    }).then(function() {
                        return MarketContractRegistry.deployed();
                    }).then(function(deployedMarketContractRegistry) {
                        deployedMarketContractRegistry.addAddressToWhiteList(deployedMarketContract.address);
                    });
                });
            });
        });
    }
};
