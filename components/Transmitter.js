'use client';

import { useState, useRef, useEffect } from 'react';
import { textToBinary, createChunks, COLORS } from '@/lib/protocol';

export default function Transmitter() {
  const [inputText, setInputText] = useState("");
  const [encodedChunks, setEncodedChunks] = useState([]);
  const canvasRef = useRef(null);

  const COLS = 10;
  const ROWS = 10;
  const CELL_SIZE = 30;
  const CANVAS_SIZE = COLS * CELL_SIZE;

  useEffect(() => {
    if (!inputText) {
      setEncodedChunks([]);
      return;
    }
    const binary = textToBinary(inputText);
    const chunks = createChunks(binary);
    setEncodedChunks(chunks);
  }, [inputText]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalCells = COLS * ROWS;

    for (let i = 0; i < totalCells; i++) {
      let colorCode;

      if (i === 0 || i === 9 || i === 90 || i === 99) {
        colorCode = "101"; // Magenta
      }
      else if (i === 1) {
        colorCode = "000"; // Black
      }
      else {
          const chunkIndex = i - 2;
          if (chunkIndex >= 0 && chunkIndex < encodedChunks.length) {
               colorCode = encodedChunks[chunkIndex];
          } else {
              colorCode = "000";
          }
      }

      const color = COLORS[colorCode] || "#000000";
      const x = (i % COLS) * CELL_SIZE;
      const y = Math.floor(i / COLS) * CELL_SIZE;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }, [encodedChunks]);

  const videoRef = useRef(null);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }, // Forces the back camera
      audio: false
    });
    videoRef.current.srcObject = stream;
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-12 items-center justify-between">

      {/* LEFT: Canvas Display */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 w-full order-last md:order-first">
        <div className="relative group p-1 bg-gradient-to-br from-zinc-700 to-zinc-800 rounded-xl shadow-2xl transition-all duration-500 hover:shadow-cyan-500/20">
            <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="block w-full max-w-[320px] h-auto aspect-square object-contain bg-black rounded-lg"
                style={{ imageRendering: 'pixelated' }}
            />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/50 rounded-full border border-zinc-800/50">
            <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${encodedChunks.length > 0 ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`}></div>
            <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">
                {encodedChunks.length > 0 ? 'Transmitting' : 'Standby'}
            </span>
        </div>
      </div>

      {/* RIGHT: Controls */}
      <div className="flex-1 w-full flex flex-col justify-center space-y-10">
        <div className="space-y-3 text-center md:text-left">
            <h2 className="text-3xl font-semibold text-white tracking-tight">Data Stream</h2>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto md:mx-0">
                Enter your payload to encode it into the 10x10 optical matrix. Ensure the receiver is aligned with the magenta anchors.
            </p>
        </div>

        <div className="space-y-8">
            <div className="relative group">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder=" "
                    id="floating_input"
                    className="block px-0 py-4 w-full text-lg text-white bg-transparent border-b-2 border-zinc-700 appearance-none focus:outline-none focus:ring-0 focus:border-cyan-500 peer font-mono transition-colors"
                    autoComplete="off"
                />
                <label
                    htmlFor="floating_input"
                    className="absolute text-sm text-zinc-500 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:start-0 peer-focus:text-cyan-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:top-1/2 peer-focus:top-3 peer-focus:scale-75 peer-focus:-translate-y-6 left-0 uppercase tracking-wider font-mono"
                >
                    Input Payload
                </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950/30 p-4 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                    <span className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-mono">Chunks</span>
                    <span className="text-4xl font-light text-white font-mono tracking-tighter">
                        {String(encodedChunks.length).padStart(2, '0')}
                    </span>
                </div>
                <div className="bg-zinc-950/30 p-4 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                    <span className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-mono">Capacity</span>
                    <span className="text-4xl font-light text-zinc-600 font-mono tracking-tighter">
                        94
                    </span>
                </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2 pt-2">
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                    <span>Buffer</span>
                    <span>{Math.round((encodedChunks.length / 94) * 100)}%</span>
                </div>
                <div className="w-full bg-zinc-800/30 rounded-full h-1 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${encodedChunks.length > 90 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min((encodedChunks.length / 94) * 100, 100)}%` }}
                    ></div>
                </div>
            </div>
            <div>
              <button onClick={startCamera}>Are you the receiver?</button>
              <div>
                <video ref={videoRef} autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-auto"></video>
              </div>
            </div>
        </div>
      </div>

    </div>
  );
}
