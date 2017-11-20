const MarketContract = artifacts.require("MarketContract");
const CollateralToken = artifacts.require("CollateralToken");
const OrderLib = artifacts.require("OrderLib");
const utility = require('./utility.js');


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
        assert.equal(
            mainAcctBalance.toNumber(),
            initBalance.toNumber(),
            "Entire coin balance should be in primary account"
        );
    });

    it("Main account should be able to transfer balance", async function() {
        var balanceToTransfer = initBalance / 2;
        balancePerAcct = balanceToTransfer;
        await collateralToken.transfer(accounts[1], balanceToTransfer, {from: accounts[0]});
        let secondAcctBalance = await collateralToken.balanceOf.call(accounts[1]).valueOf();
        assert.equal(
            secondAcctBalance.toNumber(),
            balanceToTransfer,
            "Transfer didn't register correctly"
        );
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

        assert.equal(
            tradingBalanceAcctOne,
            amountToWithdraw,
            "Balance doesn't equal tokens deposited - withdraw"
        );
        assert.equal(
            tradingBalanceAcctTwo,
            amountToWithdraw,
            "Balance doesn't equal tokens deposited - withdraw"
        );

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
        var orderSignature = utility.signMessage(web3, accounts[0], orderHash)
        assert.isTrue(await orderLib.isValidSignature.call(
            accounts[0],
            orderHash,
            orderSignature[0],
            orderSignature[1],
            orderSignature[2]),
            "Order hash doesn't match signer"
        );
        assert.isTrue(!await orderLib.isValidSignature.call(
            accounts[1],
            orderHash,
            orderSignature[0],
            orderSignature[1],
            orderSignature[2]),
            "Order hash matches a non signer"
        );
    });

    var makerAccountBalanceBeforeTrade;
    var takerAccountBalanceBeforeTrade;
    var entryOrderPrice = 33025;
    it("Trade occurs, cancel occurs, balances transferred, positions updated", async function() {
        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var accountMaker = accounts[0];
        var accountTaker = accounts[1];
        var orderAddresses = [accountMaker, accountTaker, accounts[2]];
        var unsignedOrderValues = [0, 0, entryOrderPrice, timeStamp, 1];
        var orderQty = 5;   // user is attempting to buy 5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContract.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );

        makerAccountBalanceBeforeTrade = await marketContract.getUserAccountBalance.call(accounts[0]);
        takerAccountBalanceBeforeTrade = await marketContract.getUserAccountBalance.call(accounts[1]);

        // Execute trade between maker and taker for partial amount of order.
        var qtyToFill = 1;
        var orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            5,                  // qty is five
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        var makerNetPos = await marketContract.getUserPosition.call(accountMaker);
        var takerNetPos = await marketContract.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 1, "Maker should be long 1");
        assert.equal(takerNetPos.toNumber(), -1, "Taker should be short 1");

        var qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, 5, 1); //cancel part of order
        qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), 2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from users to the pool, check all balances
        // here.
        var priceFloor = await marketContract.PRICE_FLOOR.call();
        var priceCap = await marketContract.PRICE_CAP.call();
        var decimalPlaces = await marketContract.QTY_DECIMAL_PLACES();
        var actualCollateralPoolBalance = await marketContract.collateralPoolBalance.call();

        var longCollateral = (entryOrderPrice - priceFloor) * decimalPlaces * qtyToFill;
        var shortCollateral = (priceCap - entryOrderPrice) * decimalPlaces * qtyToFill;
        var totalExpectedCollateralBalance = longCollateral + shortCollateral;

        assert.equal(
            totalExpectedCollateralBalance,
            actualCollateralPoolBalance,
            "Collateral pool isn't funded correctly"
        );

        var makerAccountBalanceAfterTrade = await marketContract.getUserAccountBalance.call(accounts[0]);
        var takerAccountBalanceAfterTrade = await marketContract.getUserAccountBalance.call(accounts[1]);

        assert.equal(
            makerAccountBalanceAfterTrade,
            makerAccountBalanceBeforeTrade - longCollateral,
            "Maker balance is wrong"
        );
        assert.equal(
            takerAccountBalanceAfterTrade,
            takerAccountBalanceBeforeTrade - shortCollateral,
            "Taker balance is wrong"
        );
    });

    var exitOrderPrice = 36025;
    it("Trade is unwound, correct collateral amount returns to user balances", async function() {
        var timeStamp = ((new Date()).getTime() / 1000) + 60*5; // order expires 5 minute from now.
        var accountMaker = accounts[0];
        var accountTaker = accounts[1];
        var orderAddresses = [accountMaker, accountTaker, accounts[2]];
        var orderPrice = 36025;
        var unsignedOrderValues = [0, 0, orderPrice, timeStamp, 1];
        var orderQty = -5;   // user is attempting to sell -5
        var orderHash = await orderLib.createOrderHash.call(
            MarketContract.address,
            orderAddresses,
            unsignedOrderValues,
            orderQty
        );


        // Execute trade between maker and taker for partial amount of order.
        var qtyToFill = -1;
        var orderSignature = utility.signMessage(web3, accountMaker, orderHash)
        await marketContract.tradeOrder(
            orderAddresses,
            unsignedOrderValues,
            -5,                 // qty is five
            qtyToFill,          // let us fill a one lot
            orderSignature[0],  // v
            orderSignature[1],  // r
            orderSignature[2],  // s
            {from: accountTaker}
        );

        var makerNetPos = await marketContract.getUserPosition.call(accountMaker);
        var takerNetPos = await marketContract.getUserPosition.call(accountTaker);
        assert.equal(makerNetPos.toNumber(), 0, "Maker should be flat");
        assert.equal(takerNetPos.toNumber(), 0, "Taker should be flat");

        var qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), -1, "Fill Qty doesn't match expected");

        await marketContract.cancelOrder(orderAddresses, unsignedOrderValues, -5, -1); //cancel part of order
        qtyFilledOrCancelled = await marketContract.getQtyFilledOrCancelledFromOrder.call(orderHash);
        assert.equal(qtyFilledOrCancelled.toNumber(), -2, "Fill Or Cancelled Qty doesn't match expected");

        // after the execution we should have collateral transferred from pool to the users since they are now flat!
        var actualCollateralPoolBalance = await marketContract.collateralPoolBalance.call();
        assert.equal(
            actualCollateralPoolBalance.toNumber(),
            0,
            "Collateral pool should be completely empty"
        );

        var makerAccountBalanceAfterTrade = await marketContract.getUserAccountBalance.call(accounts[0]);
        var takerAccountBalanceAfterTrade = await marketContract.getUserAccountBalance.call(accounts[1]);
        var decimalPlaces = await marketContract.QTY_DECIMAL_PLACES();
        var profitForMaker = (exitOrderPrice - entryOrderPrice) * decimalPlaces;

        assert.equal(
            makerAccountBalanceAfterTrade - makerAccountBalanceBeforeTrade,
            profitForMaker,
            "Maker balance is wrong - profit amount doesn't make sense"
        );
        assert.equal(
            takerAccountBalanceAfterTrade - takerAccountBalanceBeforeTrade,
            profitForMaker * -1,
            "Taker balance is wrong - loss amount doesn't make sense"
        );
    });

        // TODO:
        //      - attempt to overfill
        //      - attempt to over cancel
        //      - attempt to fill expired order
        //      - attempt to trade zero qty
        //      - order with zero qty
        //      - order with values manipulated
        //      - fees get transferred to recipient correctly.
        //      - attempt to trade / cancel post expiration
        //      - expiration methods
        //      - settleAndClose()
});