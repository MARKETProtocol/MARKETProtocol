/*
    Copyright 2017-2018 Phillip A. Elsasser

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity ^0.4.18;

import "truffle/Assert.sol";
import "../../contracts/tokens/MarketToken.sol";


/// @title TestMarketToken
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestMarketToken {

    function testInitialBalance() public {
        MarketToken marketToken = new MarketToken(0, 0);
        Assert.equal(
            marketToken.balanceOf(this),
            marketToken.INITIAL_SUPPLY(),
            "init supply allocated to creator"
        );
    }

    /// @dev tests functionality related to our minimum required balance of tokens in order
    /// to allow users to create a MarketContract
    function testNeededBalanceForContractCreation() public {
        uint neededBalanceForContractCreation = 25;
        MarketToken marketToken = new MarketToken(0, neededBalanceForContractCreation);

        Assert.equal(
            neededBalanceForContractCreation,
            marketToken.minBalanceToAllowContractCreation(),
            "contract requirements don't match from constructor"
        );

        Assert.isTrue(
            marketToken.isBalanceSufficientForContractCreation(this),
            "balance report as insufficient"
        );

        address recipient = 0x123; // fake address to use for testing of sufficient balances

        Assert.equal(
            marketToken.balanceOf(recipient),
            0,
            "balance of new address isn't zero"
        );

        Assert.isTrue(
            !marketToken.isBalanceSufficientForContractCreation(recipient),
            "balance report as sufficient when zero!"
        );

        marketToken.transfer(recipient, neededBalanceForContractCreation);

        Assert.equal(
            marketToken.balanceOf(recipient),
            neededBalanceForContractCreation,
            "balance not transferred correctly"
        );

        Assert.isTrue(
            marketToken.isBalanceSufficientForContractCreation(recipient),
            "balance report as insufficient!"
        );

        // since this contract is the creator we should be able to set a new min balance and then ensure
        // our recipient isn't able to create now
        marketToken.setMinBalanceForContractCreation(neededBalanceForContractCreation + 1);

        Assert.isTrue(
            !marketToken.isBalanceSufficientForContractCreation(recipient),
            "balance report as sufficient after increase!"
        );

        Assert.isTrue(
            marketToken.isBalanceSufficientForContractCreation(this),
            "balance report as insufficient"
        );
    }

    function testLockTokensForTrading() public {
        uint qtyToLockForTrading = 10;
        MarketToken marketToken = new MarketToken(qtyToLockForTrading, 0);

        Assert.equal(
            qtyToLockForTrading,
            marketToken.lockQtyToAllowTrading(),
            "contract requirements don't match from constructor"
        );

        address fakeMarketContractAddress = 0x12345;
        Assert.isTrue(
            !marketToken.isUserEnabledForContract(fakeMarketContractAddress, this),
            "contract shouldn't allow trading without lock"
        );

        marketToken.lockTokensForTradingMarketContract(fakeMarketContractAddress, qtyToLockForTrading);

        Assert.equal(
            qtyToLockForTrading,
            marketToken.getLockedBalanceForUser(fakeMarketContractAddress, this),
            "contract reporting incorrect locked balance"
        );

        Assert.equal(
            marketToken.balanceOf(this),
            marketToken.INITIAL_SUPPLY() - qtyToLockForTrading,
            "balance didn't decrease with lock"
        );

        Assert.isTrue(
            marketToken.isUserEnabledForContract(fakeMarketContractAddress, this),
            "contract should allow trading with locked balance"
        );


        Assert.equal(
            0,
            marketToken.getLockedBalanceForUser(0x100, this),
            "contract reporting incorrect locked balance for fake contract"
        );

        Assert.isTrue(
            marketToken.isUserEnabledForContract(fakeMarketContractAddress, this),
            "user not enabled for contract"
        );

        Assert.isTrue(
            !marketToken.isUserEnabledForContract(0x100, this),
            "user enabled for unknown contract"
        );

        // since we are the creator of the market token, we should be able to change the required lock amount
        // therefore disabling trading based on the lower locked qty
        marketToken.setLockQtyToAllowTrading(qtyToLockForTrading + 1);

        Assert.isTrue(
            !marketToken.isUserEnabledForContract(fakeMarketContractAddress, this),
            "higher lock amount didn't stop user from trading"
        );

        marketToken.unlockTokens(fakeMarketContractAddress, qtyToLockForTrading);

        Assert.equal(
            marketToken.balanceOf(this),
            marketToken.INITIAL_SUPPLY(),
            "balance didn't increase with unlock"
        );

        Assert.equal(
            0,
            marketToken.getLockedBalanceForUser(fakeMarketContractAddress, this),
            "contract reporting incorrect locked balance after unlock"
        );
    }

}
