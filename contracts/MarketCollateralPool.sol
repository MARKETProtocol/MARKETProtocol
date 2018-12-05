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
import "./tokens/PositionToken.sol";

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
    enum MarketSide { Long, Short, Both}

    event TokensMinted(address indexed marketContract, uint qtyMinted, uint collateralLocked);
    event TokensRedeemed(address indexed marketContract, uint qtyRedeemed, uint collateralUnlocked, uint8 marketSide);
    event FactoryAddressRemoved(address indexed factoryAddress);

    constructor() public { }

    /*
    // EXTERNAL METHODS
    */

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    /// @param marketContractAddress address of the MARKET Contract being traded.
    /// @param qtyToRedeem signed qtyToRedeem, positive (+) for long tokens, negative(-) for short tokens
    function settleAndClose(address marketContractAddress, int qtyToRedeem, bool isLong) external {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(marketContract.isSettled(), "Contract is not settled");

        // burn tokens being redeemed.
        MarketSide marketSide;
        uint absQtyToRedeem = qtyToRedeem.abs(); // convert to a uint
        if(qtyToRedeem > 0) {
            PositionToken(marketContract.LONG_POSITION_TOKEN()).redeemToken(absQtyToRedeem, msg.sender);
            marketSide = MarketSide.Long;
        } else {
            PositionToken(marketContract.SHORT_POSITION_TOKEN()).redeemToken(absQtyToRedeem, msg.sender);
            marketSide = MarketSide.Short;
        }

        // calculate amount of collateral to return and update pool balances
        uint collateralToReturn = MathLib.calculateNeededCollateral(
            marketContract.PRICE_FLOOR(),
            marketContract.PRICE_CAP(),
            marketContract.QTY_MULTIPLIER(),
            qtyToRedeem,
            marketContract.settlementPrice()
        );
        contractAddressToCollateralPoolBalance[marketContract] =
            contractAddressToCollateralPoolBalance[marketContract].subtract(collateralToReturn);

        // return collateral tokens
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransfer(msg.sender, collateralToReturn);

        emit TokensRedeemed(
            marketContractAddress,
            absQtyToRedeem,
            collateralToReturn,
            uint8(marketSide)
        );
    }

    /*
    // PUBLIC METHODS
    */

    /// Called by a user that wants to mint new PositionTokens (both long and short).  The user must approve (ERC20) the
    /// transfer of collateral tokens before this call, or it will fail!
    function mintPositionTokens(address marketContractAddress, uint qtyToMint) {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(!marketContract.isSettled(), "Contract is already settled");

        uint neededCollateral = MathLib.multiply(qtyToMint, marketContract.COLLATERAL_PER_UNIT());

        // EXTERNAL CALL - transferring ERC20 tokens from sender to this contract.  User must have called
        // ERC20.approve in order for this call to succeed.
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransferFrom(msg.sender, this, neededCollateral);

        // Update the collateral pool locked balance.
        contractAddressToCollateralPoolBalance[marketContractAddress] =
            contractAddressToCollateralPoolBalance[marketContractAddress].add(neededCollateral);

        // mint and distribute short and long position tokens to our caller
        PositionToken(marketContract.LONG_POSITION_TOKEN()).mintAndSendToken(qtyToMint, msg.sender);
        PositionToken(marketContract.SHORT_POSITION_TOKEN()).mintAndSendToken(qtyToMint, msg.sender);

        emit TokensMinted(marketContractAddress, qtyToMint, neededCollateral);
    }

    /// Called by a user that currently holds both short and long position tokens and would like to redeem them
    /// for their collateral.
    function redeemPositionTokens(address marketContractAddress, uint qtyToRedeem) {
        MarketContract marketContract = MarketContract(marketContractAddress);

        // Redeem positions tokens by burning them.
        PositionToken(marketContract.LONG_POSITION_TOKEN()).redeemToken(qtyToRedeem, msg.sender);
        PositionToken(marketContract.SHORT_POSITION_TOKEN()).redeemToken(qtyToRedeem, msg.sender);

        // calculate collateral to return and update pool balance
        uint collateralToReturn = MathLib.multiply(qtyToRedeem, marketContract.COLLATERAL_PER_UNIT());
        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[marketContractAddress].subtract(collateralToReturn);

        // transfer collateral back to user
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransfer(msg.sender, collateralToReturn);

        emit TokensRedeemed(
            marketContractAddress,
            qtyToRedeem,
            collateralToReturn,
            uint8(MarketSide.Both)
        );
    }
}
