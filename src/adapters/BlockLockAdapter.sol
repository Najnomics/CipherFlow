// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AbstractBlocklockReceiver} from "blocklock-solidity/src/AbstractBlocklockReceiver.sol";
import {TypesLib} from "blocklock-solidity/src/libraries/TypesLib.sol";

/// @title BlockLockAdapter
/// @notice Shared helper for contracts that need to coordinate BlockLock requests per commitment.
/// @dev The adapter keeps a mapping from local identifiers (commitment IDs) to BlockLock request IDs
///      and exposes convenience wrappers for subscription and direct-funding flows.
abstract contract BlockLockAdapter is AbstractBlocklockReceiver {
    /// @notice Emitted when a new BlockLock request is associated with a local commitment identifier.
    event BlocklockRequestLinked(uint256 indexed commitmentId, uint256 indexed requestId);

    /// @notice Emitted when a BlockLock request reference is cleared after fulfilment or cancellation.
    event BlocklockRequestCleared(uint256 indexed commitmentId, uint256 indexed requestId);

    /// @notice Raised when attempting to create a second BlockLock request for the same commitment.
    error BlocklockRequestAlreadyRegistered(uint256 commitmentId, uint256 existingRequestId);

    /// @notice Raised when trying to access a BlockLock request that has not yet been registered.
    error BlocklockRequestUnknown(uint256 commitmentId);

    /// @dev Tracks BlockLock request identifiers per local commitment.
    mapping(uint256 => uint256) internal blocklockRequestIds;

    constructor(address blocklockSender) AbstractBlocklockReceiver(blocklockSender) {}

    /// @notice Initiate a BlockLock request using an active subscription.
    /// @param commitmentId Locally scoped identifier for the solver commitment.
    /// @param callbackGasLimit Gas forwarded to the downstream `receiveBlocklock` callback.
    /// @param condition BlockLock condition bytes (e.g., encoded block height).
    /// @param ciphertext Encrypted solver payload registered off-chain.
    function _requestBlocklockWithSubscriptionForCommitment(
        uint256 commitmentId,
        uint32 callbackGasLimit,
        bytes memory condition,
        TypesLib.Ciphertext calldata ciphertext
    ) internal returns (uint256 requestId) {
        _guardFreshRequest(commitmentId);

        requestId = _requestBlocklockWithSubscription(callbackGasLimit, condition, ciphertext);
        blocklockRequestIds[commitmentId] = requestId;
        emit BlocklockRequestLinked(commitmentId, requestId);
    }

    /// @notice Initiate a BlockLock request paying native fees upfront.
    /// @param commitmentId Locally scoped identifier for the solver commitment.
    /// @param callbackGasLimit Gas forwarded to the downstream `receiveBlocklock` callback.
    /// @param condition BlockLock condition bytes (e.g., encoded block height).
    /// @param ciphertext Encrypted solver payload registered off-chain.
    /// @return requestId Newly created BlockLock request identifier.
    /// @return requestPrice Fee paid to BlockLock in native token.
    function _requestBlocklockWithDirectFundingForCommitment(
        uint256 commitmentId,
        uint32 callbackGasLimit,
        bytes memory condition,
        TypesLib.Ciphertext calldata ciphertext
    ) internal returns (uint256 requestId, uint256 requestPrice) {
        _guardFreshRequest(commitmentId);

        (requestId, requestPrice) = _requestBlocklockPayInNative(callbackGasLimit, condition, ciphertext);
        blocklockRequestIds[commitmentId] = requestId;
        emit BlocklockRequestLinked(commitmentId, requestId);
    }

    /// @notice Retrieve the BlockLock request identifier associated with a local commitment.
    function getBlocklockRequestId(uint256 commitmentId) public view returns (uint256) {
        uint256 requestId = blocklockRequestIds[commitmentId];
        if (requestId == 0) revert BlocklockRequestUnknown(commitmentId);
        return requestId;
    }

    /// @notice Remove an existing mapping once fulfilment completes or the commitment is cancelled.
    function _clearBlocklockReference(uint256 commitmentId) internal {
        uint256 requestId = blocklockRequestIds[commitmentId];
        if (requestId == 0) return;
        delete blocklockRequestIds[commitmentId];
        emit BlocklockRequestCleared(commitmentId, requestId);
    }

    /// @dev Ensure no request is already tracked for the provided commitment identifier.
    function _guardFreshRequest(uint256 commitmentId) internal view {
        uint256 existing = blocklockRequestIds[commitmentId];
        if (existing != 0) {
            revert BlocklockRequestAlreadyRegistered(commitmentId, existing);
        }
    }

    /// @dev Derived contracts must implement how decrypted payloads are processed.
    function _onBlocklockReceived(uint256 requestId, bytes calldata decryptionKey) internal virtual override;
}

