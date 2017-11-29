/*
    Copyright 2017 Phillip A. Elsasser

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
pragma solidity 0.4.18;

import "./MathLib.sol";
import "../ContractSpecs.sol";
import "zeppelin-solidity/contracts/token/ERC20.sol";
import "zeppelin-solidity/contracts/token/SafeERC20.sol";


library AccountLib {
    using MathLib for int;
    using MathLib for uint;
    using SafeERC20 for ERC20;

    struct AccountMappings {
        uint collateralPoolBalance;                                 // current balance of all collateral committed
        mapping(address => UserNetPosition) addressToUserPosition;
        mapping(address => uint) userAddressToAccountBalance;       // stores account balances allowed to be allocated to orders
    }

    struct UserNetPosition {
        address userAddress;
        Position[] positions;   // all open positions (lifo upon exit - allows us to not reindex array!)
        int netPosition;        // net position across all prices / executions
    }

    struct Position {
        uint price;
        int qty;
    }

    event UpdatedUserBalance(address indexed user, uint balance);
    event UpdatedPoolBalance(uint balance);

    /// @notice get the net position for a give user address
    /// @param accountMappings struct to modify
    /// @param userAddress address to return position for
    /// @return the users current open position.
    function getUserPosition(
        AccountMappings storage accountMappings,
        address userAddress
    ) internal view returns (int)
    {
        return accountMappings.addressToUserPosition[userAddress].netPosition;
    }

    /// @notice moves collateral from a user's account to the pool upon trade execution.
    /// @param accountMappings struct to modify
    /// @param fromAddress address of user entering trade
    /// @param collateralAmount amount of collateral to transfer from user account to collateral pool
    function commitCollateralToPool(
        AccountMappings storage accountMappings,
        address fromAddress,
        uint collateralAmount
    ) internal
    {
        require(accountMappings.userAddressToAccountBalance[fromAddress] >= collateralAmount);   // ensure sufficient balance
        uint newBalance = accountMappings.userAddressToAccountBalance[fromAddress].subtract(collateralAmount);
        accountMappings.userAddressToAccountBalance[fromAddress] = newBalance;
        accountMappings.collateralPoolBalance = accountMappings.collateralPoolBalance.add(collateralAmount);
        UpdatedUserBalance(fromAddress, newBalance);
        UpdatedPoolBalance(accountMappings.collateralPoolBalance);
    }

    /// @notice withdraws collateral from pool to a user account upon exit or trade settlement
    /// @param accountMappings storage mappings from contract
    /// @param toAddress address of user
    /// @param collateralAmount amount to transfer from pool to user.
    function withdrawCollateralFromPool(
        AccountMappings storage accountMappings,
        address toAddress,
        uint collateralAmount
        ) private
    {
        require(accountMappings.collateralPoolBalance >= collateralAmount); // ensure sufficient balance
        uint newBalance = accountMappings.userAddressToAccountBalance[toAddress].add(collateralAmount);
        accountMappings.userAddressToAccountBalance[toAddress] = newBalance;
        accountMappings.collateralPoolBalance = accountMappings.collateralPoolBalance.subtract(collateralAmount);
        UpdatedUserBalance(toAddress, newBalance);
        UpdatedPoolBalance(accountMappings.collateralPoolBalance);
    }

    /// @notice removes token from users trading account
    /// @param accountMappings storage mappings from contract
    /// @param baseToken ERC20 token used for collateral in the calling contract
    /// @param withdrawAmount qty of token to attempt to withdraw
    function withdrawTokens(
        AccountMappings storage accountMappings,
        ERC20 baseToken,
        uint256 withdrawAmount
    ) internal
    {
        require(accountMappings.userAddressToAccountBalance[msg.sender] >= withdrawAmount);   // ensure sufficient balance
        uint256 balanceAfterWithdrawal = accountMappings.userAddressToAccountBalance[msg.sender].subtract(withdrawAmount);
        accountMappings.userAddressToAccountBalance[msg.sender] = balanceAfterWithdrawal;   // update balance before external call!
        baseToken.safeTransfer(msg.sender, withdrawAmount);
        UpdatedUserBalance(msg.sender, balanceAfterWithdrawal);
    }

    /// @notice deposits tokens to the smart contract to fund the user account and provide needed tokens for collateral
    /// pool upon trade matching.
    /// @param accountMappings storage mappings from contract
    /// @param baseToken ERC20 token used for collateral in the calling contract
    /// @param depositAmount qty of ERC20 tokens to deposit to the smart contract to cover open orders and collateral
    function depositTokensForTrading(
        AccountMappings storage accountMappings,
        ERC20 baseToken,
        uint256 depositAmount
    ) internal
    {
        // user must call approve!
        baseToken.safeTransferFrom(msg.sender, this, depositAmount);
        uint256 balanceAfterDeposit = accountMappings.userAddressToAccountBalance[msg.sender].add(depositAmount);
        accountMappings.userAddressToAccountBalance[msg.sender] = balanceAfterDeposit;
        UpdatedUserBalance(msg.sender, balanceAfterDeposit);
    }

    // @notice called by a user after settlement has occurred.  This function will finalize all accounting around any
    /// @param accountMappings storage mappings from contract
    /// @param contractSpecs constant values defining contract.
    // outstanding positions and return all remaining collateral to the caller. This should only be called after
    // settlement has occurred.
    function settleAndClose(
        AccountMappings storage accountMappings,
        ContractSpecs contractSpecs,
        uint settlementPrice
    ) internal
    {
        UserNetPosition storage userNetPos = accountMappings.addressToUserPosition[msg.sender];
        if (userNetPos.netPosition != 0) {
            // this user has a position that we need to settle based upon the settlement price of the contract
            reduceUserNetPosition(
                accountMappings,
                contractSpecs,
                userNetPos,
                msg.sender,
                userNetPos.netPosition * - 1,
                settlementPrice
            );
        }
        // transfer all balances back to user.
        withdrawTokens(
            accountMappings,
            contractSpecs.BASE_TOKEN(),
            accountMappings.userAddressToAccountBalance[msg.sender]
        );
    }

    /// @dev calculates the needed collateral for a new position and commits it to the pool removing it from the
    /// users account and creates the needed Position struct to record the new position.
    /// @param accountMappings storage mappings from contract
    /// @param contractSpecs constant values defining contract.
    /// @param userNetPosition current positions held by user
    /// @param userAddress address of user entering into the position
    /// @param qty signed quantity of the trade
    /// @param price agreed price of trade
    function addUserNetPosition(
        AccountMappings storage accountMappings,
        ContractSpecs contractSpecs,
        UserNetPosition storage userNetPosition,
        address userAddress,
        int qty,
        uint price
    ) internal
    {
        uint neededCollateral = MathLib.calculateNeededCollateral(
            contractSpecs,
            qty,
            price
        );
        commitCollateralToPool(accountMappings, userAddress, neededCollateral);
        userNetPosition.positions.push(Position(price, qty));   // append array with new position
    }

    /// @dev reduces net position correctly allocating collateral back to user
    /// @param accountMappings storage mappings from contract
    /// @param contractSpecs constant values defining contract.
    /// @param userNetPos storage struct for this users position
    /// @param userAddress address of user who is reducing their pos
    /// @param qty signed quantity of the qty to reduce this users position by
    /// @param price transacted price
    function reduceUserNetPosition(
        AccountMappings storage accountMappings,
        ContractSpecs contractSpecs,
        UserNetPosition storage userNetPos,
        address userAddress,
        int qty,
        uint price
    ) internal
    {
        uint collateralToReturnToUserAccount = 0;
        int qtyToReduce = qty;                      // note: this sign is opposite of our users position
        assert(userNetPos.positions.length != 0);   // sanity check
        while (qtyToReduce != 0) {   //TODO: ensure we dont run out of gas here!
            Position storage position = userNetPos.positions[userNetPos.positions.length - 1];  // get the last pos (LIFO)
            if (position.qty.abs() <= qtyToReduce.abs()) {   // this position is completely consumed!
                collateralToReturnToUserAccount = collateralToReturnToUserAccount.add(
                    MathLib.calculateNeededCollateral(
                        contractSpecs,
                        position.qty,
                        price
                    )
                );
                qtyToReduce = qtyToReduce.add(position.qty);
                userNetPos.positions.length--;  // remove this position from our array.
            } else {  // this position stays, just reduce the qty.
                position.qty = position.qty.add(qtyToReduce);
                // pos is opp sign of qty we are reducing here!
                collateralToReturnToUserAccount = collateralToReturnToUserAccount.add(
                    MathLib.calculateNeededCollateral(
                        contractSpecs,
                        qtyToReduce * -1,
                        price
                    )
                );
                //qtyToReduce = 0; // completely reduced now!
                break;
            }
        }

        if (collateralToReturnToUserAccount != 0) {  // allocate funds back to user acct.
            withdrawCollateralFromPool(accountMappings, userAddress, collateralToReturnToUserAccount);
        }
    }

    /// @param accountMappings storage mappings from contract
    /// @param contractSpecs constant values defining contract.
    /// @param maker address of the maker in the trade
    /// @param taker address of the taker in the trade
    /// @param qty quantity transacted between parties
    /// @param price agreed price of the matched trade.
    function updatePositions(
        AccountMappings storage accountMappings,
        ContractSpecs contractSpecs,
        address maker,
        address taker,
        int qty,
        uint price
    ) internal
    {
        updatePosition(
            accountMappings,
            contractSpecs,
            maker,
            qty,
            price
        );
        // continue process for taker, but qty is opposite sign for taker
        updatePosition(
            accountMappings,
            contractSpecs,
            taker, qty * -1,
            price
        );
    }

    /// @dev handles all needed internal accounting when a user enters into a new trade
    /// @param accountMappings storage mappings from contract
    /// @param contractSpecs constant values defining contract.
    /// @param userAddress storage struct containing position information for this user
    /// @param qty signed quantity this users position is changing by, + for buy and - for sell
    /// @param price transacted price of the new position / trade
    function updatePosition(
        AccountMappings storage accountMappings,
        ContractSpecs contractSpecs,
        address userAddress,
        int qty,
        uint price
    ) private
    {
        UserNetPosition storage userNetPosition = accountMappings.addressToUserPosition[userAddress];
        if (userNetPosition.netPosition == 0 || userNetPosition.netPosition.isSameSign(qty)) {
            // new position or adding to open pos
            addUserNetPosition(
                accountMappings,
                contractSpecs,
                userNetPosition,
                userAddress,
                qty,
                price
            );
        } else {  // opposite side from open position, reduce, flattened, or flipped.
            if (userNetPosition.netPosition >= qty * -1) { // pos is reduced or flattened
                reduceUserNetPosition(
                    accountMappings,
                    contractSpecs,
                    userNetPosition,
                    userAddress,
                    qty,
                    price
                );
            } else {    // pos is flipped, reduce and then create new open pos!
                reduceUserNetPosition(
                    accountMappings,
                    contractSpecs,
                    userNetPosition,
                    userAddress,
                    userNetPosition.netPosition * -1,
                    price
                ); // flatten completely
                int newNetPos = userNetPosition.netPosition + qty;            // the portion remaining after flattening
                addUserNetPosition(
                    accountMappings,
                    contractSpecs,
                    userNetPosition,
                    userAddress,
                    newNetPos,
                    price
                );
            }
        }
        userNetPosition.netPosition = userNetPosition.netPosition.add(qty);   // keep track of total net pos across all prices for user.
    }
}
