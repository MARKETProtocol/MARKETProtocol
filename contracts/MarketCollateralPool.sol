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

    address public marketContractRegistry;
    address public mktToken;

    mapping(address => uint) public contractAddressToCollateralPoolBalance;                 // current balance of all collateral committed
    mapping(address => uint) public feesCollectedByTokenAddress;

    event TokensMinted(
        address indexed marketContract,
        address indexed user,
        address indexed feeToken,
        uint qtyMinted,
        uint collateralLocked,
        uint feesPaid
    );

    event TokensRedeemed (
        address indexed marketContract,
        address indexed user,
        uint longQtyRedeemed,
        uint shortQtyRedeemed,
        uint collateralUnlocked
    );

    constructor(address marketContractRegistryAddress, address mktTokenAddress) public {
        marketContractRegistry = marketContractRegistryAddress;
        mktToken = mktTokenAddress;
    }

    /*
    // EXTERNAL METHODS
    */

    /// @notice Called by a user that would like to mint a new set of long and short token for a specified
    /// market contract.  This will transfer and lock the correct amount of collateral into the pool
    /// and issue them the requested qty of long and short tokens
    /// @param marketContractAddress            address of the market contract to redeem tokens for
    /// @param qtyToMint                      quantity of long / short tokens to mint.
    /// @param isAttemptToPayInMKT            if possible, attempt to pay fee's in MKT rather than collateral tokens
    function mintPositionTokens(
        address marketContractAddress,
        uint qtyToMint,
        bool isAttemptToPayInMKT
    ) external onlyWhiteListedAddress(marketContractAddress)
    {

        MarketContract marketContract = MarketContract(marketContractAddress);
        require(!marketContract.isSettled(), "Contract is already settled");

        address collateralTokenAddress = marketContract.COLLATERAL_TOKEN_ADDRESS();
        uint neededCollateral = MathLib.multiply(qtyToMint, marketContract.COLLATERAL_PER_UNIT());
        // the user has selected to pay fees in MKT and those fees are non zero (allowed) OR
        // the user has selected not to pay fees in MKT, BUT the collateral token fees are disabled (0) AND the
        // MKT fees are enabled (non zero).  (If both are zero, no fee exists)
        bool isPayFeesInMKT = (isAttemptToPayInMKT &&
            marketContract.MKT_TOKEN_FEE_PER_UNIT() != 0) ||
            (!isAttemptToPayInMKT &&
            marketContract.MKT_TOKEN_FEE_PER_UNIT() != 0 &&
            marketContract.COLLATERAL_TOKEN_FEE_PER_UNIT() == 0);

        uint feeAmount;
        uint totalCollateralTokenTransferAmount;
        address feeToken;
        if (isPayFeesInMKT) { // fees are able to be paid in MKT
            feeAmount = MathLib.multiply(qtyToMint, marketContract.MKT_TOKEN_FEE_PER_UNIT());
            totalCollateralTokenTransferAmount = neededCollateral;
            feeToken = mktToken;

            // EXTERNAL CALL - transferring ERC20 tokens from sender to this contract.  User must have called
            // ERC20.approve in order for this call to succeed.
            ERC20(mktToken).safeTransferFrom(msg.sender, address(this), feeAmount);
        } else { // fee are either zero, or being paid in the collateral token
            feeAmount = MathLib.multiply(qtyToMint, marketContract.COLLATERAL_TOKEN_FEE_PER_UNIT());
            totalCollateralTokenTransferAmount = neededCollateral.add(feeAmount);
            feeToken = collateralTokenAddress;
            // we will transfer collateral and fees all at once below.
        }

        // EXTERNAL CALL - transferring ERC20 tokens from sender to this contract.  User must have called
        // ERC20.approve in order for this call to succeed.
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransferFrom(msg.sender, address(this), totalCollateralTokenTransferAmount);

        if (feeAmount != 0) {
            // update the fee's collected balance
            feesCollectedByTokenAddress[feeToken] = feesCollectedByTokenAddress[feeToken].add(feeAmount);
        }

        // Update the collateral pool locked balance.
        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[
            marketContractAddress
        ].add(neededCollateral);

        // mint and distribute short and long position tokens to our caller
        marketContract.mintPositionTokens(qtyToMint, msg.sender);

        emit TokensMinted(
            marketContractAddress,
            msg.sender,
            feeToken,
            qtyToMint,
            neededCollateral,
            feeAmount
        );
    }

    /// @notice Called by a user that currently holds both short and long position tokens and would like to redeem them
    /// for their collateral.
    /// @param marketContractAddress            address of the market contract to redeem tokens for
    /// @param qtyToRedeem                      quantity of long / short tokens to redeem.
    function redeemPositionTokens(
        address marketContractAddress,
        uint qtyToRedeem
    ) external onlyWhiteListedAddress(marketContractAddress)
    {
        MarketContract marketContract = MarketContract(marketContractAddress);

        marketContract.redeemLongToken(qtyToRedeem, msg.sender);
        marketContract.redeemShortToken(qtyToRedeem, msg.sender);

        // calculate collateral to return and update pool balance
        uint collateralToReturn = MathLib.multiply(qtyToRedeem, marketContract.COLLATERAL_PER_UNIT());
        contractAddressToCollateralPoolBalance[marketContractAddress] = contractAddressToCollateralPoolBalance[
            marketContractAddress
        ].subtract(collateralToReturn);

        // EXTERNAL CALL
        // transfer collateral back to user
        ERC20(marketContract.COLLATERAL_TOKEN_ADDRESS()).safeTransfer(msg.sender, collateralToReturn);

        emit TokensRedeemed(
            marketContractAddress,
            msg.sender,
            qtyToRedeem,
            qtyToRedeem,
            collateralToReturn
        );
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    /// @param marketContractAddress address of the MARKET Contract being traded.
    /// @param longQtyToRedeem qty to redeem of long tokens
    /// @param shortQtyToRedeem qty to redeem of short tokens
    function settleAndClose(
        address marketContractAddress,
        uint longQtyToRedeem,
        uint shortQtyToRedeem
    ) external onlyWhiteListedAddress(marketContractAddress)
    {
        MarketContract marketContract = MarketContract(marketContractAddress);
        require(marketContract.isPostSettlementDelay(), "Contract is not past settlement delay");

        // burn tokens being redeemed.
        if (longQtyToRedeem > 0) {
            marketContract.redeemLongToken(longQtyToRedeem, msg.sender);
        }

        if (shortQtyToRedeem > 0) {
            marketContract.redeemShortToken(shortQtyToRedeem, msg.sender);
        }


        // calculate amount of collateral to return and update pool balances
        uint collateralToReturn = MathLib.calculateCollateralToReturn(
            marketContract.PRICE_FLOOR(),
            marketContract.PRICE_CAP(),
            marketContract.QTY_MULTIPLIER(),
            longQtyToRedeem,
            shortQtyToRedeem,
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
            longQtyToRedeem,
            shortQtyToRedeem,
            collateralToReturn
        );
    }

    /// @dev allows the owner to remove the fees paid into this contract for minting
    /// @param feeTokenAddress - address of the erc20 token fees have been paid in
    /// @param feeRecipient - Recipient address of fees
    function withdrawFees(address feeTokenAddress, address feeRecipient) public onlyOwner {
        uint feesAvailableForWithdrawal = feesCollectedByTokenAddress[feeTokenAddress];
        require(feesAvailableForWithdrawal != 0, "No fees available for withdrawal");
        require(feeRecipient != address(0), "Cannot send fees to null address");
        feesCollectedByTokenAddress[feeTokenAddress] = 0;
        // EXTERNAL CALL
        ERC20(feeTokenAddress).safeTransfer(feeRecipient, feesAvailableForWithdrawal);
    }

    /// @dev allows the owner to update the mkt token address in use for fees
    /// @param mktTokenAddress address of new MKT token
    function setMKTTokenAddress(address mktTokenAddress) public onlyOwner {
        require(mktTokenAddress != address(0), "Cannot set MKT Token Address To Null");
        mktToken = mktTokenAddress;
    }

    /// @dev allows the owner to update the mkt token address in use for fees
    /// @param marketContractRegistryAddress address of new contract registry
    function setMarketContractRegistryAddress(address marketContractRegistryAddress) public onlyOwner {
        require(marketContractRegistryAddress != address(0), "Cannot set Market Contract Registry Address To Null");
        marketContractRegistry = marketContractRegistryAddress;
    }

    /*
    // MODIFIERS
    */

    /// @notice only can be called with a market contract address that currently exists in our whitelist
    /// this ensure's it is a market contract that has been created by us and therefore has a uniquely created
    /// long and short token address.  If it didn't we could have spoofed contracts minting tokens with a
    /// collateral token that wasn't the same as the intended token.
    modifier onlyWhiteListedAddress(address marketContractAddress) {
        require(
            MarketContractRegistryInterface(marketContractRegistry).isAddressWhiteListed(marketContractAddress),
            "Contract is not whitelisted"
        );
        _;
    }
}
