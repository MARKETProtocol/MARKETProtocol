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

import "./libraries/MathLib.sol";
import "./MarketContract.sol";

import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


/// @title MarketCollateralPool is a contract controlled by Market Contracts.  It holds collateral balances
/// as well as user balances and open positions.  It should be instantiated and then linked to a specific market
/// contract factory.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketCollateralPool is Ownable {
    using MathLib for uint;
    using MathLib for int;
    using SafeERC20 for ERC20;

    mapping(address => uint) public contractAddressToCollateralPoolBalance;                 // current balance of all collateral committed

    event UpdatedLockedBalance(address indexed marketContractAddress, uint changeInBalance);

    constructor() public { }

    /*
    // EXTERNAL METHODS
    */

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    /// @param marketContractAddress address of the MARKET Contract being traded.
    /// @param qtyToRedeem signed qtyToRedeem, positive (+) for long tokens, negative(-) for short tokens
    function settleAndClose(address marketContractAddress, int qtyToRedeem) external {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(marketContract.isSettled(), "Contract is not settled");
        // 1. calculate collateral token amount owed back to user from the qtyToRedeem and the
        // marketContract.settlementPrice()
        // 2. call long or short redeem
        // 3. return collateral tokens marketContract.COLLATERAL_TOKEN_ADDRESS()
    }

    /*
    // PUBLIC METHODS
    */

    /// Called by a user that wants to mint new PositionTokens (both long and short).  The user must approve (ERC20) the
    /// transfer of collateral tokens before this call, or it will fail!
    function mintPositionTokens(address marketContract, uint qtyToMint) {
        // 1. calculate needed amount of collateral (PRICE_CAP - PRICE_FLOOR * Multiplier * qty)
        // 2. erc20 transfer the collateral tokens to become locked here
        //   ERC20(collateralTokenAddress).safeTransferFrom(msg.sender, this, collateralAmount);
        //  contractAddressToCollateralPoolBalance[marketContract] = contractAddressToCollateralPoolBalance[marketContract].add(collateralAmount);
        // 3. call the long and short position tokens to mint and transfer to the msg.sender of this call
        //  the single call to each token should handle creation and transfer
        // 4. event?
    }

    /// Called by a user that currently holds both short and long position tokens and would like to redeem them
    /// for their collateral.
    function redeemPositionTokens(address marketContract, uint qtyToRedeem) {
        // 1. burns / redeems callers position tokens (both short and long)
        // 2. transfers collateral back to user (or unlocks it)
        // ERC20(collateralTokenAddress).safeTransfer(msg.sender, withdrawAmount);
        // contractAddressToCollateralPoolBalance[marketContract] = contractAddressToCollateralPoolBalance[marketContract].subtract(
        // withdrawAmount
        // );
        // 4. event?
    }
}
