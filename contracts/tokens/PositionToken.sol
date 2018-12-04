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

pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract PositionToken is StandardToken, Ownable {

    string public name;
    string public symbol;
    uint8 public decimals;

    uint8 public MARKET_SIDE; // 0 = Long, 1 = Short

    constructor(
        string tokenName,
        string tokenSymbol,
        uint8 tokenDecimals,
        uint8 marketSide
    ) public
    {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        MARKET_SIDE = marketSide;
    }


    /// @dev Called by our collateral pool to create a long or short position token. These tokens are minted,
    /// and then transferred to our recipient who is the party who is minting these tokens.  The collateral pool
    /// is the only caller (acts as the owner) because collateral must be deposited / locked prior to minting of new
    /// position tokens
    /// @param qtyToMint quantity of position tokens to mint (in base units)
    /// @param recipient the person minting and receiving these position tokens.
    function mintAndSendToken(uint256 qtyToMint, address recipient) external onlyOwner {
        // 1. mint token
        // 2. add to total supply
        // 3. transfer to recipient using safe math techniques
        // 4. fire event?
    }

    /// @dev Called by our collateral pool when redemption occurs.  This means that either a single user is redeeming
    /// both short and long tokens in order to claim their collateral, or the contract has settled, and only a single
    /// side of the tokens are needed to redeem (handled by the collateral pool)
    /// @param qtyToRedeem quantity of tokens to burn (remove from supply / circulation)
    /// @param redeemer the person redeeming these tokens (who are we taking the balance from)
    function redeemToken(uint256 qtyToRedeem, address redeemer) external onlyOwner {
        // 1. burn tokens
        // 2. remove from total supply
        // 3. remove from redeemer using safe math techniques
        // 4. fire event?
    }
}