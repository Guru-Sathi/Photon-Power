// Color palette mapping
export const COLORS = {
  "000": "#000000", // Black
  "001": "#FF0000", // Red
  "010": "#00FF00", // Green
  "011": "#0000FF", // Blue
  "100": "#00FFFF", // Cyan
  "101": "#FF00FF", // Magenta
  "110": "#FFFF00", // Yellow
  "111": "#FFFFFF", // White
};

/**
 * Converts a string of text to a binary string representation (8 bits per char).
 * @param {string} text - The input text to convert.
 * @returns {string} - The binary string.
 */
export function textToBinary(text) {
  const encoder = new TextEncoder();
  const encodedValues = encoder.encode(text);
  let result = "";
  for (let i = 0; i < encodedValues.length; i++) {
    result += encodedValues[i].toString(2).padStart(8, "0");
  }
  return result;
}

/**
 * Splits a binary string into 3-bit chunks.
 * Pads with '0' if the last chunk is less than 3 bits.
 * @param {string} binaryString - The binary string to split.
 * @returns {string[]} - An array of 3-bit binary strings.
 */
export function createChunks(binaryString) {
  const chunks = [];
  for (let i = 0; i < binaryString.length; i += 3) {
    let chunk = binaryString.substring(i, i + 3);
    if (chunk.length < 3) {
      chunk = chunk.padEnd(3, "0");
    }
    chunks.push(chunk);
  }
  return chunks;
}
