
/*
    Copyright 2017-2019 Phillip A. Elsasser

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

pragma solidity 0.5.2;

import "truffle/Assert.sol";
import "../../contracts/tokens/MarketToken.sol";
import "../../contracts/tokens/UpgradeableTokenMock.sol";


/// @title TestUpgradeableToken
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestUpgradeableToken {

    UpgradeableTokenMock public upgradedToken;
    MarketToken public marketToken;

    function beforeEachCreateMarketToken() public {
        marketToken = new MarketToken();
    }

    function beforeEachCreateUpgradeableTokenMock() public {
        upgradedToken = new UpgradeableTokenMock(address(marketToken)); // pass in address
    }

    function testUpgradeableToken() public {

        Assert.equal(
            marketToken.balanceOf(address(this)),
            marketToken.INITIAL_SUPPLY(),
            "Unexpected initial supply allocation"
        );

        Assert.equal(
            marketToken.balanceOf(address(this)),
            marketToken.totalSupply(),
            "Unexpected total supply allocation"
        );

        marketToken.setUpgradeableTarget(address(upgradedToken));

        Assert.equal(
            marketToken.upgradeableTarget(),
            address(upgradedToken),
            "Unable to set correct address for upgrade token target"
        );

        Assert.equal(
            upgradedToken.PREVIOUS_TOKEN_ADDRESS(),
            address(marketToken),
            "Unable to set correct address for upgrade token target"
        );

        marketToken.upgrade(marketToken.balanceOf(address(this)));

        Assert.equal(
            marketToken.INITIAL_SUPPLY(),
            upgradedToken.totalSupply(),
            "Entire supply not upgraded in new contract"
        );

        Assert.equal(
            marketToken.INITIAL_SUPPLY(),
            marketToken.totalUpgraded(),
            "Entire supply not upgraded in old contract"
        );

        Assert.equal(
            upgradedToken.balanceOf(address(this)),
            upgradedToken.totalSupply(),
            "Supply not allocated to user"
        );

    }
}
