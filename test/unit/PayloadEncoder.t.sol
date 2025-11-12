// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {PayloadEncoder} from "../../libs/encoding/PayloadEncoder.sol";

contract PayloadEncoderTest is Test {
    using PayloadEncoder for PayloadEncoder.ExecutionStep[];
    using PayloadEncoder for PayloadEncoder.Payload;

    function testEncodeStepsDeterministic() external pure {
        PayloadEncoder.ExecutionStep[] memory steps = new PayloadEncoder.ExecutionStep[](2);
        steps[0] = PayloadEncoder.ExecutionStep({target: address(0xA1), callData: hex"1234", value: 1});
        steps[1] = PayloadEncoder.ExecutionStep({target: address(0xB2), callData: hex"", value: 2});

        bytes memory encoded = PayloadEncoder.encodeSteps(steps);

        assertEq(encoded.length, 4 + (20 + 4 + 2 + 32) + (20 + 4 + 0 + 32));
        assertEq(
            keccak256(encoded),
            keccak256(
                abi.encodePacked(
                    uint32(2),
                    address(0xA1),
                    uint32(2),
                    hex"1234",
                    uint256(1),
                    address(0xB2),
                    uint32(0),
                    bytes(""),
                    uint256(2)
                )
            )
        );
    }

    function testHashMatchesEncode() external view {
        PayloadEncoder.ExecutionStep[] memory steps = new PayloadEncoder.ExecutionStep[](1);
        steps[0] = PayloadEncoder.ExecutionStep({target: address(this), callData: hex"deadbeef", value: 0});

        PayloadEncoder.Payload memory payload =
            PayloadEncoder.Payload({intentId: bytes32("intent"), deadline: block.timestamp + 1 hours, steps: steps});

        bytes memory encoded = PayloadEncoder.encode(payload);
        bytes32 hash = PayloadEncoder.hash(payload);

        assertEq(hash, keccak256(encoded));
    }
}

