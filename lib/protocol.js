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

/**
 * Maps an RGB value to the closest 3-bit color code.
 * Uses a simple thresholding logic since our palette is extreme (0 or 255).
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} - The 3-bit binary string (e.g., "001").
 */
export function getColorBits(r, g, b) {
    // Threshold at 128 to decide if a channel is "on" (1) or "off" (0)
    const bitR = r > 128 ? "1" : "0";
    const bitG = g > 128 ? "1" : "0";
    const bitB = b > 128 ? "1" : "0";

    // Our palette maps:
    // 000: Black (0,0,0)
    // 001: Red (255,0,0)  -> Wait, let's check COLORS map above!
    // "001": "#FF0000" -> R is 1, G is 0, B is 0.
    // "010": "#00FF00" -> R is 0, G is 1, B is 0.
    // "011": "#0000FF" -> R is 0, G is 0, B is 1. (Wait, hex is RRGGBB. #0000FF is Blue. So bit 3 is Blue? No, keys are bit strings).
    // Let's look at the mapping:
    // "000": Black
    // "001": Red (#FF0000)   -> Bit 3 is R? Wait. 001 -> index 2 is 1.
    // "010": Green (#00FF00) -> Bit 2 is G.
    // "011": Blue (#0000FF)  -> Wait, 011 has two bits set but Blue is just B. Let's look at the actual map carefully.

    // Original map:
    // "000": "#000000", // Black
    // "001": "#FF0000", // Red
    // "010": "#00FF00", // Green
    // "011": "#0000FF", // Blue
    // "100": "#00FFFF", // Cyan
    // "101": "#FF00FF", // Magenta
    // "110": "#FFFF00", // Yellow
    // "111": "#FFFFFF", // White

    // Let's just find the closest color using Euclidean distance to be safe,
    // because the keys don't perfectly map to RGB bits (e.g., "011" is pure Blue, but has two 1s).

    const hexToRgb = (hex) => {
        const bigint = parseInt(hex.slice(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    };

    let closestCode = "000";
    let minDistance = Infinity;

    for (const [code, hex] of Object.entries(COLORS)) {
        const target = hexToRgb(hex);
        const dist = Math.sqrt(
            Math.pow(r - target.r, 2) +
            Math.pow(g - target.g, 2) +
            Math.pow(b - target.b, 2)
        );
        if (dist < minDistance) {
            minDistance = dist;
            closestCode = code;
        }
    }

    return closestCode;
}

/**
 * Converts a binary string back to an ASCII text string.
 * @param {string} binaryString - The continuous bitstream.
 * @returns {string} - The decoded text.
 */
export function binaryToASCII(binaryString) {
    let text = "";
    // Process in chunks of 8 bits
    for (let i = 0; i < binaryString.length; i += 8) {
        const byteStr = binaryString.substring(i, i + 8);
        if (byteStr.length === 8) {
            const charCode = parseInt(byteStr, 2);
            // Basic filtering for printable ASCII to avoid rendering garbage
            if (charCode >= 32 && charCode <= 126) {
                text += String.fromCharCode(charCode);
            }
        }
    }
    return text;
}
