// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PayloadEncoder
/// @notice Canonical encoder for solver execution payloads.
library PayloadEncoder {
    struct ExecutionStep {
        address target;
        bytes callData;
        uint256 value;
    }

    struct Payload {
        bytes32 intentId;
        uint256 deadline;
        ExecutionStep[] steps;
    }

    /// @notice Encode execution steps into canonical bytes.
    function encodeSteps(ExecutionStep[] memory steps) internal pure returns (bytes memory) {
        bytes memory encoded;
        uint256 length = steps.length;
        encoded = abi.encodePacked(uint32(length));
        for (uint256 i = 0; i < length; i++) {
            encoded = abi.encodePacked(
                encoded,
                steps[i].target,
                uint32(steps[i].callData.length),
                steps[i].callData,
                steps[i].value
            );
        }
        return encoded;
    }

    /// @notice Encode full payload.
    function encode(Payload memory payload) internal pure returns (bytes memory) {
        return abi.encodePacked(payload.intentId, payload.deadline, encodeSteps(payload.steps));
    }

    /// @notice Hash payload for commitment.
    function hash(Payload memory payload) internal pure returns (bytes32) {
        return keccak256(encode(payload));
    }
}

