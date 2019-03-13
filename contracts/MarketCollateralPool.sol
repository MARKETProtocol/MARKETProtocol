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

pragma solidity ^0.5.0;

import "./libraries/MathLib.sol";
import "./MarketContract.sol";
import "./tokens/PositionToken.sol";
import "./MarketContractRegistryInterface.sol";

import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


/// @title MarketCollateralPool
/// @notice This collateral pool houses all of the collateral for all market contracts currently in circulation.
/// This pool facilitates locking of collateral and minting / redemption of position tokens for that collateral.
/// @author Phil Elsasser <phil@marketprotocol.io>
contract MarketCollateralPool is Ownable {
    using MathLib for uint;
    using MathLib for int;
    using SafeERC20 for ERC20;

    address public MARKET_CONTRACT_REGISTRY;
    mapping(address => uint) public contractAddressToCollateralPoolBalance;                 // current balance of all collateral committed
    enum MarketSide { Long, Short, Both}

    event TokensMinted(address indexed marketContract, address indexed user, uint qtyMinted, uint collateralLocked);
    event TokensRedeemed(address indexed marketContract, address indexed user, uint qtyRedeemed, uint collateralUnlocked, uint8 marketSide);

    constructor(address marketContractRegistry) public {
        MARKET_CONTRACT_REGISTRY = marketContractRegistry;
    }

    /*
    // EXTERNAL METHODS
    */

    /// @notice Called by a user that would like to mint a new set of long and short token for a specified
    /// market contract.  This will transfer and lock the correct amount of collateral into the pool
    /// and issue them the requested qty of long and short tokens
    /// @param marketContractAddress            address of the market contract to redeem tokens for
    /// @param qtyToMint                      quantity of long / short tokens to mint.
    function mintPositionTokens(
        address marketContractAddress,
        uint qtyToMint
    ) external onlyWhiteListedAddress(marketContractAddress) {

        MarketContract marketContract = MarketContract(marketContractAddress);
        require(!marketContract.isSettled(), "Contract is already settled");

        uint neededCollateral = MathLib.multiply(qtyToMint, marketContract.COLLATERAL_PER_UNIT());

        // EXTERNAL CALL - transferring ERC20 tokens from sender to this contract.  User must have called
        // ERC20.approve in order for this call to succeed.
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransferFrom(msg.sender, address(this), neededCollateral);

        // Update the collateral pool locked balance.
        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[
            marketContractAddress
        ].add(neededCollateral);

        // mint and distribute short and long position tokens to our caller
        marketContract.mintPositionTokens(qtyToMint, msg.sender);

        emit TokensMinted(marketContractAddress, msg.sender, qtyToMint, neededCollateral);
    }

    /// @notice Called by a user that currently holds both short and long position tokens and would like to redeem them
    /// for their collateral.
    /// @param marketContractAddress            address of the market contract to redeem tokens for
    /// @param qtyToRedeem                      quantity of long / short tokens to redeem.
    function redeemPositionTokens(
        address marketContractAddress,
        uint qtyToRedeem
    ) external onlyWhiteListedAddress(marketContractAddress) {
        MarketContract marketContract = MarketContract(marketContractAddress);

        marketContract.redeemLongToken(qtyToRedeem, msg.sender);
        marketContract.redeemShortToken(qtyToRedeem, msg.sender);

        // calculate collateral to return and update pool balance
        uint collateralToReturn = MathLib.multiply(qtyToRedeem, marketContract.COLLATERAL_PER_UNIT());
        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[
            marketContractAddress
        ].subtract(collateralToReturn);

        // transfer collateral back to user
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransfer(msg.sender, collateralToReturn);

        emit TokensRedeemed(
            marketContractAddress,
            msg.sender,
            qtyToRedeem,
            collateralToReturn,
            uint8(MarketSide.Both)
        );
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    /// @param marketContractAddress address of the MARKET Contract being traded.
    /// @param qtyToRedeem signed qtyToRedeem, positive (+) for long tokens, negative(-) for short tokens
    function settleAndClose(
        address marketContractAddress,
        int qtyToRedeem
    ) external onlyWhiteListedAddress(marketContractAddress) {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(marketContract.isPostSettlementDelay(), "Contract is not past settlement delay");

        // burn tokens being redeemed.
        MarketSide marketSide;
        uint absQtyToRedeem = qtyToRedeem.abs(); // convert to a uint for non signed functions
        if (qtyToRedeem > 0) {
            marketSide = MarketSide.Long;
            marketContract.redeemLongToken(absQtyToRedeem, msg.sender);
        } else {
            marketSide = MarketSide.Short;
            marketContract.redeemShortToken(absQtyToRedeem, msg.sender);
        }

        // calculate amount of collateral to return and update pool balances
        uint collateralToReturn = MathLib.calculateNeededCollateral(
            marketContract.PRICE_FLOOR(),
            marketContract.PRICE_CAP(),
            marketContract.QTY_MULTIPLIER(),
            qtyToRedeem,
            marketContract.settlementPrice()
        );

        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[
            marketContractAddress
        ].subtract(collateralToReturn);

        // return collateral tokens
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransfer(msg.sender, collateralToReturn);

        emit TokensRedeemed(
            marketContractAddress,
            msg.sender,
            absQtyToRedeem,
            collateralToReturn,
            uint8(marketSide)
        );
    }

    /// @notice only can be called with a market contract address that currently exists in our whitelist
    /// this ensure's it is a market contract that has been created by us and therefore has a uniquely created
    /// long and short token address.  If it didn't we could have spoofed contracts minting tokens with a
    /// collateral token that wasn't the same as the intended token.
    modifier onlyWhiteListedAddress(address marketContractAddress) {
        require(
            MarketContractRegistryInterface(MARKET_CONTRACT_REGISTRY).isAddressWhiteListed(marketContractAddress),
            "Contract is not whitelisted"
        );
        _;
    }
}
