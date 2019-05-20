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


/// @title TestMarketToken
/// @author Phil Elsasser <phil@marketprotcol.io>
contract TestMarketToken {

    function testInitialBalance() public {
        MarketToken marketToken = new MarketToken();
        Assert.equal(
            marketToken.balanceOf(address(this)),
            marketToken.INITIAL_SUPPLY(),
            "init supply allocated to creator"
        );
    }



    function testBurnTokens() public {
        MarketToken marketToken = new MarketToken();

        Assert.equal(
            marketToken.balanceOf(address(this)),
            marketToken.INITIAL_SUPPLY(),
            "Unexpected initial supply allocation"
        );

        Assert.equal(
            marketToken.totalSupply(),
            marketToken.INITIAL_SUPPLY(),
            "Unexpected initial supply allocation"
        );

        marketToken.burn(marketToken.INITIAL_SUPPLY() / 2);

        Assert.equal(
            marketToken.totalSupply(),
            marketToken.INITIAL_SUPPLY() / 2,
            "Unexpected supply after burn"
        );
    }

}
