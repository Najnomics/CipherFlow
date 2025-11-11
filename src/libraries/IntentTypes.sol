// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IntentTypes
/// @notice Shared data structures for the CipherFlow solver network.
/// @dev Splitting these definitions out keeps `IntentHub` lean and enables reuse across mocks/tests.
library IntentTypes {
    /// @notice Lifecycle for a solver commitment against a specific trader intent.
    enum CommitmentState {
        None,
        PendingReveal,
        RevealReady,
        Executed,
        Cancelled,
        Expired
    }

    /// @notice High-level lifecycle for an intent auction.
    enum AuctionState {
        Uninitialized,
        Open,
        Revealed,
        Settled,
        Cancelled,
        Expired
    }

    /// @notice Trader-authored definition of an intent that solvers compete over.
    struct Intent {
        address trader; // originator that receives any residual value or refunds
        address settlementAsset; // ERC20 or zero address for native
        address recipient; // execution output recipient (can differ from trader)
        uint256 amountIn; // amount locked for execution
        uint256 minAmountOut; // trader guaranteed minimum on settlement
        uint64 commitDeadline; // timestamp for when commitments stop being accepted
        uint64 revealDeadline; // timestamp after which reveal becomes invalid
        uint64 executionDeadline; // when the solver must finish settlement
        bytes extraData; // domain specific metadata (e.g., DEX preferences)
        AuctionState state;
    }

    /// @notice Metadata describing a solver commitment before reveal.
    struct Commitment {
        address solver;
        bytes32 payloadHash; // hash of cleartext swap instructions
        uint64 submittedAt;
        uint64 revealAvailableAt;
        uint96 collateral; // reserved as risk coverage once accounted
        CommitmentState state;
        uint256 blocklockRequestId;
    }

    /// @notice Persisted payload once BlockLock releases a decryption key.
    struct Reveal {
        bytes decryptedPayload;
        bytes solverSignature;
        bytes decryptionKey;
        uint64 revealedAt;
    }

    /// @notice Execution level accounting after the solver fulfils the intent.
    struct ExecutionReceipt {
        address executor;
        uint256 amountOut;
        uint256 solverPayout;
        bytes32 settlementTxHash;
        bool success;
        uint64 executedAt;
        bool settlementClaimed;
    }
}

