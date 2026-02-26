function transmitter(chunks) {
    const colors = {
        "000": "#000000", "001": "#FF0000", "010": "#00FF00", "011": "#0000FF",
        "100": "#00FFFF", "101": "#FF00FF", "110": "#FFFF00", "111": "#FFFFFF"
    };

    const canvas = document.getElementById('transmitterCanvas');
    const ctx = canvas.getContext('2d');
    
    // First Principles: Hardcode the grid geometry
    const cols = 10;
    const rows = 10;
    const cellSize = 30; 
    const totalCells = cols * rows; // 100 cells

    // Set canvas size dynamically to fit the grid
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < totalCells; i++) {
        let colorCode;

        // 1. ANCHOR LOGIC: Magenta corners (Top-L, Top-R, Bot-L, Bot-R)
        if (i === 0 || i === 9 || i === 90 || i === 99) {
            colorCode = "101"; 
        } 
        // 2. DATA LOGIC: Offset by 2 (Skip index 0 and 1 for Anchor/Sync)
        // Only draw data if we haven't run out of chunks
        else if (i >= 2 && i < chunks.length + 2) {
            colorCode = chunks[i - 2];
        } 
        // 3. FILLER LOGIC: Fill the rest with Black (000)
        else {
            colorCode = "000";
        }

        // Coordinate Math: Flattened index to 2D grid
        const x = (i % cols) * cellSize;
        const y = Math.floor(i / cols) * cellSize;
        
        ctx.fillStyle = colors[colorCode];
        ctx.fillRect(x, y, cellSize, cellSize);
    }
}

function createChunks(binaryString){
    const chunks = [];
    for (let i = 0; i < binaryString.length; i += 3) {
        let chunk = binaryString.substring(i, i + 3);
        
        if (chunk.length < 3) {
            chunk = chunk.padEnd(3, '0');
        }
        
        chunks.push(chunk);
    }
    return chunks;
}

function convertToBinary(encodedArr){
    let result = "";
    for(let i = 0; i < encodedArr.length; i++){
        result += encodedArr[i].toString(2).padStart(8, '0')
    }
    return result;
}

function handleClick(){
    const input = document.querySelector('input').value
    const encoder = new TextEncoder();
    const encodedValues = encoder.encode(input);
    const a = convertToBinary(encodedValues);
    const b = createChunks(a);
    transmitter(b)
    console.log(input, encodedValues, a, b);
}

