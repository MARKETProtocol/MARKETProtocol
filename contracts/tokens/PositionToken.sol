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


/// @title Position Token
/// @notice A token that represents a claim to a collateral pool and a short or long position.
/// The collateral pool acts as the owner of this contract and controls minting and redemption of these
/// tokens based on locked collateral in the pool.
/// NOTE: We eventually can move all of this logic into a library to avoid deploying all of the logic
/// every time a new market contract is deployed.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract PositionToken is StandardToken, Ownable {

    string public name;
    string public symbol;
    uint8 public decimals;

    uint8 public MARKET_SIDE; // 0 = Long, 1 = Short
    address public MARKET_CONTRACT_ADDRESS;

    constructor(
        address marketContractAddress,
        string tokenName,
        string tokenSymbol,
        uint8 marketSide
    ) public
    {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = 18;
        MARKET_SIDE = marketSide;
    }

    /// @dev Called by our collateral pool to create a long or short position token. These tokens are minted,
    /// and then transferred to our recipient who is the party who is minting these tokens.  The collateral pool
    /// is the only caller (acts as the owner) because collateral must be deposited / locked prior to minting of new
    /// position tokens
    /// @param qtyToMint quantity of position tokens to mint (in base units)
    /// @param recipient the person minting and receiving these position tokens.
    function mintAndSendToken(
        address marketContractAddress,
        uint256 qtyToMint,
        address recipient
    ) external onlyOwner onlyMarketContractAddress(marketContractAddress) {
        totalSupply_ = totalSupply_.add(qtyToMint);                 // add to total supply
        balances[recipient] = balances[recipient].add(qtyToMint);   // transfer to recipient balance
        emit Transfer(address(0), recipient, qtyToMint);            // fire event to show balance.
    }

    /// @dev Called by our collateral pool when redemption occurs.  This means that either a single user is redeeming
    /// both short and long tokens in order to claim their collateral, or the contract has settled, and only a single
    /// side of the tokens are needed to redeem (handled by the collateral pool)
    /// @param qtyToRedeem quantity of tokens to burn (remove from supply / circulation)
    /// @param redeemer the person redeeming these tokens (who are we taking the balance from)
    function redeemToken(
        address marketContractAddress,
        uint256 qtyToRedeem,
        address redeemer
    ) external onlyOwner onlyMarketContractAddress(marketContractAddress) {
        // reduce the redeemer's balances.  This will throw if not enough balance to reduce!
        balances[redeemer] = balances[redeemer].sub(qtyToRedeem);
        totalSupply_ = totalSupply_.sub(qtyToRedeem);                    // reduce total supply
        emit Transfer(redeemer, address(0), qtyToRedeem);           // fire event to update balances
    }

    /// @notice only can be called with a market contract address that is tied to this token. This allows us to
    /// ensure that no one else can attempt to tie this token to a different MarketContract with a different collateral
    /// token to be use for spoofing token creation
    modifier onlyMarketContractAddress(address marketContractAddress) {
        require(MARKET_CONTRACT_ADDRESS == marketContractAddress);
        _;
    }
}