var MarketContract = artifacts.require("MarketContract");
var CollateralToken = artifacts.require("CollateralToken");
var OrderLib = artifacts.require("OrderLib");

// basic tests for interacting with market contract.
contract('MarketContract', function(accounts) {

    // test setup of token for collateral
    var initBalance;
    var collateralToken;
    var balancePerAcct;
    it("Initial supply should be 1e+22", async function() {
        collateralToken = await CollateralToken.deployed();
        initBalance = await collateralToken.INITIAL_SUPPLY.call().valueOf();
        assert.equal(initBalance, 1e+22, "Initial balance not as expected");
    });

    it("Main account should have entire balance", async function() {
        let mainAcctBalance = await collateralToken.balanceOf.call(accounts[0]).valueOf();
        assert.equal(mainAcctBalance.toNumber(), initBalance.toNumber(), "Entire coin balance should be in primary account");
    });

    it("Main account should be able to transfer balance", async function() {
        var balanceToTransfer = initBalance / 2;
        balancePerAcct = balanceToTransfer;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});
        let secondAcctBalance = await collateralToken.balanceOf.call(accounts[1]).valueOf();
        assert.equal(secondAcctBalance.toNumber(), balanceToTransfer, "Transfer didn't register correctly");
    });

    // now we have two accounts with equal balances, begin testing market contract functionality
    var marketContract;
    it("Both accounts should be able to deposit to main contract", async function() {
        marketContract = await MarketContract.deployed();
        var amountToDeposit = 5000000;
        // create approval for main contract to move tokens!
        await collateralToken.approve(marketContract.address, amountToDeposit, {from: accounts[0]})
        await collateralToken.approve(marketContract.address, amountToDeposit, {from: accounts[1]})
        // move tokens to the MarketContract
        await marketContract.depositTokensForTrading(amountToDeposit, {from: accounts[0]})
        await marketContract.depositTokensForTrading(amountToDeposit, {from: accounts[1]})
        // ensure balances are now inside the contract.
        let tradingBalanceAcctOne = await marketContract.getUserAccountBalance.call(accounts[0]);
        let tradingBalanceAcctTwo = await marketContract.getUserAccountBalance.call(accounts[1]);
        assert.equal(tradingBalanceAcctOne, amountToDeposit, "Balance doesn't equal tokens deposited");
        assert.equal(tradingBalanceAcctTwo, amountToDeposit, "Balance doesn't equal tokens deposited");
    });

    it("Both accounts should be able to withdraw from main contract", async function() {
        var amountToWithdraw = 2500000;
        // move tokens to the MarketContract
        await marketContract.withdrawTokens(amountToWithdraw, {from: accounts[0]})
        await marketContract.withdrawTokens(amountToWithdraw, {from: accounts[1]})
        // ensure balances are now correct inside the contract.
        let tradingBalanceAcctOne = await marketContract.getUserAccountBalance.call(accounts[0]);
        let tradingBalanceAcctTwo = await marketContract.getUserAccountBalance.call(accounts[1]);
        assert.equal(tradingBalanceAcctOne, amountToWithdraw, "Balance doesn't equal tokens deposited - withdraw");
        assert.equal(tradingBalanceAcctTwo, amountToWithdraw, "Balance doesn't equal tokens deposited - withdraw");
        // ensure balances are now correct inside the arbitrary token
        var expectedTokenBalances = balancePerAcct - tradingBalanceAcctOne;
        let secondAcctTokenBalance = await collateralToken.balanceOf.call(accounts[1]).valueOf();
        assert.equal(secondAcctTokenBalance, expectedTokenBalances, "Token didn't get transferred back to user");
    });

    var orderLib;
    it("Orders are signed correctly", async function() {
        orderLib = await OrderLib.deployed();
        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var orderAddresses = [accounts[0], accounts[1], accounts[2]];
        var unsignedOrderValues = [0, 0, 33025, timeStamp, 0];
        var orderQty = 5;   // user is attempting to buy 5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContract.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );
        var orderSignature = await web3.eth.sign(accounts[0], orderHash);
        var r = orderSignature.slice(0, 66);
        var s = `0x${orderSignature.slice(66, 130)}`;
        var v = web3.toDecimal(`0x${orderSignature.slice(130, 132)}`);
        if (v !== 27 && v !== 28) v += 27;
        assert.isTrue(await orderLib.isValidSignature.call(accounts[0], orderHash, v,r,s), "Order hash doesn't match signer");
        assert.isTrue(!await orderLib.isValidSignature.call(accounts[1], orderHash, v,r,s), "Order has matches a non signer");
    });
});