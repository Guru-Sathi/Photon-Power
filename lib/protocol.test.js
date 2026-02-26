// Simple test script to verify protocol logic
import { textToBinary, createChunks } from './protocol.js';

const testInput = "GURU";
console.log(`Testing with input: "${testInput}"`);

const binary = textToBinary(testInput);
console.log(`Binary: ${binary}`);

// "G" -> 71 -> 01000111
// "U" -> 85 -> 01010101
// "R" -> 82 -> 01010010
// "U" -> 85 -> 01010101
// Expected binary: 01000111010101010101001001010101

const expectedBinary = "01000111010101010101001001010101";

if (binary === expectedBinary) {
    console.log("PASS: textToBinary matches expected output.");
} else {
    console.error(`FAIL: textToBinary\nExpected: ${expectedBinary}\nGot:      ${binary}`);
}

const chunks = createChunks(binary);
console.log(`Chunks: ${JSON.stringify(chunks)}`);

// 32 bits total. 32 / 3 = 10 chunks remainder 2.
// Last chunk should be padded.
// 010 001 110 101 010 101 010 010 010 101 01(0)
const expectedChunks = ["010", "001", "110", "101", "010", "101", "010", "010", "010", "101", "010"];

if (JSON.stringify(chunks) === JSON.stringify(expectedChunks)) {
    console.log("PASS: createChunks matches expected output.");
} else {
    console.error(`FAIL: createChunks\nExpected: ${JSON.stringify(expectedChunks)}\nGot:      ${JSON.stringify(chunks)}`);
}
