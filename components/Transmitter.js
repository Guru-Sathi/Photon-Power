'use client';
import { useState, useRef, useEffect } from 'react';
import { textToBinary, createChunks, COLORS } from '@/lib/protocol';

export default function Transmitter() {
  const [inputText, setInputText] = useState("");
  const [encodedChunks, setEncodedChunks] = useState([]);
  const canvasRef = useRef(null);

  // Constants for the grid
  const COLS = 10;
  const ROWS = 10;
  const CELL_SIZE = 30; // Internal resolution size
  const CANVAS_SIZE = COLS * CELL_SIZE;

  // Update chunks when input changes
  useEffect(() => {
    if (!inputText) {
      setEncodedChunks([]);
      return;
    }
    const binary = textToBinary(inputText);
    const chunks = createChunks(binary);
    setEncodedChunks(chunks);
  }, [inputText]);

  // Draw to canvas when chunks update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalCells = COLS * ROWS;

    for (let i = 0; i < totalCells; i++) {
      let colorCode;

      // 1. ANCHOR LOGIC: Magenta corners (Top-L, Top-R, Bot-L, Bot-R)
      // i=0, i=9, i=90, i=99
      if (i === 0 || i === 9 || i === 90 || i === 99) {
        colorCode = "101"; // Magenta (#FF00FF)
      }
      // 2. CLOCK LOGIC: Index 1 is Sync Heartbeat (Black)
      else if (i === 1) {
        colorCode = "000"; // Black
      }
      // 3. DATA LOGIC: Start at index 2
      // We need to map grid index `i` to chunk index `chunkIndex`.
      // Since data starts at i=2, chunkIndex = i - 2.
      else {
          const chunkIndex = i - 2;
          if (chunkIndex >= 0 && chunkIndex < encodedChunks.length) {
               colorCode = encodedChunks[chunkIndex];
          } else {
              // 4. FILLER LOGIC: Black
              colorCode = "000";
          }
      }

      const color = COLORS[colorCode] || "#000000";

      // Calculate coordinates
      const x = (i % COLS) * CELL_SIZE;
      const y = Math.floor(i / COLS) * CELL_SIZE;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }, [encodedChunks]);


  return (
    <div className="flex flex-col items-center gap-6 p-8 rounded-xl bg-gray-900/80 backdrop-blur-sm shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-gray-800 w-full max-w-lg mx-auto transform transition-all hover:scale-[1.01]">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-tighter font-mono filter drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
            PHOTON POWER
        </h2>
        <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>
      </div>

      <div className="relative group w-full flex justify-center py-4">
        {/* Glow effect container */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/30 to-blue-600/30 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>

        {/* Canvas container with specific styling */}
        <div className="relative p-1 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg shadow-2xl">
            <canvas
                ref={canvasRef}
                width={300} // Hardcoded 10 cols * 30px
                height={300} // Hardcoded 10 rows * 30px
                className="block bg-black shadow-[0_0_15px_rgba(0,0,0,1)] rounded-sm"
                style={{
                    imageRendering: 'pixelated',
                    width: '100%',
                    maxWidth: '300px',
                    height: 'auto',
                    aspectRatio: '1/1'
                }}
            />
        </div>
      </div>

      <div className="w-full space-y-1">
        <label htmlFor="input-text" className="flex justify-between items-end text-[10px] font-bold text-gray-500 font-mono uppercase tracking-widest px-1">
            <span>Payload Stream</span>
            <span className={encodedChunks.length > 94 ? "text-red-500 animate-pulse" : "text-gray-600"}>
                {encodedChunks.length} / 94 CHUNKS
            </span>
        </label>
        <div className="relative">
            <input
            id="input-text"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="INITIATE SEQUENCE..."
            className="w-full bg-black/50 border border-gray-700 text-cyan-400 px-4 py-4 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm tracking-wider placeholder-gray-800 transition-all shadow-inner"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_#06b6d4] animate-pulse"></div>
        </div>
      </div>

      <div className="text-[10px] text-gray-600 font-mono text-center w-full border-t border-gray-800 pt-4 mt-2">
        <p>SYSTEM STATUS: <span className="text-green-500">ONLINE</span></p>
        <p className="opacity-50">ANCHORS: LOCKED // SYNC: ACTIVE</p>
      </div>
    </div>
  );
}
