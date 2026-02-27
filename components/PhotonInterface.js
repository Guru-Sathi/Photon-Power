'use client';

import { useState, useRef, useEffect } from 'react';
import { textToBinary, createChunks, COLORS } from '@/lib/protocol';

export default function PhotonInterface() {
  const [mode, setMode] = useState('TX');

  // TX State
  const [inputText, setInputText] = useState("");
  const [encodedChunks, setEncodedChunks] = useState([]);
  const canvasRef = useRef(null);

  // RX State
  const videoRef = useRef(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState(null);

  // Single-Anchor Projection State
  const processingCanvasRef = useRef(null);
  const [cellSize, setCellSize] = useState(40); // User adjustable
  const [isOriginLocked, setIsOriginLocked] = useState(false);

  const requestRef = useRef();
  const lastLogTime = useRef(0);
  const lockLatch = useRef(0); // For single anchor latch

  // Constants
  const COLS = 10;
  const ROWS = 10;
  const CELL_SIZE = 30; // For Transmitter rendering
  const CANVAS_SIZE = COLS * CELL_SIZE;
  const PROBE_SIZE = 20;
  const GRID_COUNT = 10;

  // --- TRANSMITTER LOGIC ---
  useEffect(() => {
    if (mode !== 'TX') return;
    if (!inputText) {
      setEncodedChunks([]);
      return;
    }
    const binary = textToBinary(inputText);
    const chunks = createChunks(binary);
    setEncodedChunks(chunks);
  }, [inputText, mode]);

  useEffect(() => {
    if (mode !== 'TX') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalCells = COLS * ROWS;

    for (let i = 0; i < totalCells; i++) {
      let colorCode;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      // 1. ANCHOR LOGIC (2x2 Corners)
      // TL: (0,0), (0,1), (1,0), (1,1)
      // TR: (10,0), (11,0), (10,1), (11,1) (Indices 10,11)
      // BL: (0,10), (0,11), (1,10), (1,11)
      // BR: (10,10), (11,10), (10,11), (11,11)
      const isTL = (col < 2 && row < 2);
      const isTR = (col > 9 && row < 2);
      const isBL = (col < 2 && row > 9);
      const isBR = (col > 9 && row > 9);

      if (isTL || isTR || isBL || isBR) {
        colorCode = "101"; // Magenta
      }
      // 2. QUIET ZONE LOGIC (1-cell buffer around anchors)
      // TL Buffer: (col<3, row<3) AND not anchor
      // TR Buffer: (col>8, row<3) AND not anchor
      // BL Buffer: (col<3, row>8) AND not anchor
      // BR Buffer: (col>8, row>8) AND not anchor
      else if (
          (col < 3 && row < 3) ||
          (col > 8 && row < 3) ||
          (col < 3 && row > 8) ||
          (col > 8 && row > 8)
      ) {
          colorCode = "000"; // Black Buffer
      }
      // 3. DATA LOGIC
      // Map linear index to available cells.
      // We iterate row by row. If a cell is NOT reserved, it takes the next chunk.
      // However, calculating "nth available cell" in a loop is expensive if we do it every frame.
      // Instead, let's just pre-calculate if a cell is data capable.
      // For this simple loop, we can just maintain a counter outside?
      // No, React's `useEffect` runs once per render.
      // Better: Just check if it's a data cell, then map to chunk index.
      // But we need a continuous index.
      // Let's do a 2-pass or just logic.
      // Since `i` is linear 0..143.
      // We can't easily know "this is the 5th data cell" without counting previous data cells.
      else {
          // It's a data cell.
          // We need to know which chunk index maps here.
          // Let's count how many valid data cells existed before index `i`.
          // This is inefficient O(N^2) if done inside loop for every cell.
          // Better approach: Generate a map of valid indices first.
          colorCode = "000"; // Placeholder, handled in logic below
      }

      // Temporary fill for non-data logic parts
      if (colorCode !== "000" && colorCode !== undefined) {
          const color = COLORS[colorCode] || "#000000";
          const x = col * CELL_SIZE;
          const y = row * CELL_SIZE;
          ctx.fillStyle = color;
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }

    // 2nd Pass: Fill Data
    let dataIndex = 0;
    for (let i = 0; i < totalCells; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        // Skip Reserved Zones (Anchor + Buffer) -> (col < 3 or > 8) AND (row < 3 or > 8)
        // Wait, (col < 3 && row < 3) is TL zone.
        const isReserved =
            (col < 3 && row < 3) ||
            (col > 8 && row < 3) ||
            (col < 3 && row > 8) ||
            (col > 8 && row > 8);

        if (!isReserved) {
            if (dataIndex < encodedChunks.length) {
                const chunk = encodedChunks[dataIndex];
                const color = COLORS[chunk] || "#000000";
                const x = col * CELL_SIZE;
                const y = row * CELL_SIZE;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            } else {
                // Out of data, fill black
                const x = col * CELL_SIZE;
                const y = row * CELL_SIZE;
                ctx.fillStyle = "#000000";
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            }
            dataIndex++;
        }
    }

  }, [encodedChunks, mode]);

  // --- RECEIVER LOGIC ---
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', zoom: true }
      });

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities();

      if (capabilities && 'zoom' in capabilities) {
        setZoomCapabilities({
          min: capabilities.zoom.min,
          max: capabilities.zoom.max,
          step: capabilities.zoom.step
        });
        setZoomLevel(capabilities.zoom.min);
      } else {
          setZoomCapabilities(null);
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScanning(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      setCameraError("Camera access denied. Please check permissions.");
    }
  };

  const handleZoomChange = (event) => {
    const newZoom = Number(event.target.value);
    setZoomLevel(newZoom);

    if (cameraStream) {
      const videoTrack = cameraStream.getVideoTracks()[0];
      videoTrack.applyConstraints({
        advanced: [{ zoom: newZoom }]
      });
    }
  };

  const handleCellSizeChange = (delta) => {
      setCellSize(prev => Math.max(5, prev + delta));
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsScanning(false);
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [cameraStream]);

  // --- PIXEL PROBE LOGIC (SINGLE ANCHOR) ---
  const getAverageRGB = (ctx, x, y, size) => {
    const frameData = ctx.getImageData(x - size / 2, y - size / 2, size, size);
    const data = frameData.data;
    let r = 0, g = 0, b = 0;
    const count = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count)
    };
  };

  const processFrame = () => {
    if (!videoRef.current || !processingCanvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = processingCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Center of the screen is our "Origin Anchor" (Top-Left of Grid)
        const originX = Math.floor(canvas.width / 2);
        const originY = Math.floor(canvas.height / 2);

        // Sample Origin
        const originRGB = getAverageRGB(ctx, originX, originY, PROBE_SIZE);

        // Handshake: Magenta (R>180, G<120, B>180)
        const isLocked = (originRGB.r > 180 && originRGB.g < 120 && originRGB.b > 180);

        const now = Date.now();
        if (isLocked) {
            lockLatch.current = now;
        }

        // Latch logic (500ms)
        const latchedLock = (now - lockLatch.current) < 500;
        setIsOriginLocked(latchedLock);

        // Debug Log
        const debugNow = Date.now();
        if (debugNow - lastLogTime.current > 500) {
            if (latchedLock) {
                console.log(`LOCKED ORIGIN. Projecting ${GRID_COUNT}x${GRID_COUNT} grid with cell size ${cellSize}px.`);
            }
            lastLogTime.current = debugNow;
        }
    }

    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    if (isScanning) {
        requestRef.current = requestAnimationFrame(processFrame);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [isScanning, cellSize]); // Re-run if cellSize changes? Actually RAF loop uses state closure issue if not careful.
  // BUT: `cellSize` is used inside `processFrame`.
  // Since `processFrame` is defined inside the component, it captures `cellSize`.
  // However, `requestAnimationFrame` recursion uses the *captured* `processFrame` closure.
  // We need to use a ref for `cellSize` if we don't want to re-bind the loop constantly,
  // OR just let the effect restart the loop when `cellSize` changes.
  // The simplest reliable way in React hooks with RAF is to use a Ref for mutable values accessed in loop, OR let the dependency array handle restart.
  // Restarting loop on `cellSize` change is fine.


  // --- RENDER ---
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">

      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="bg-zinc-900/50 p-1 rounded-full border border-zinc-800 backdrop-blur-md flex shadow-lg">
          <button
            onClick={() => { setMode('TX'); stopCamera(); }}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              mode === 'TX'
                ? 'bg-zinc-800 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Transmitter
          </button>
          <button
            onClick={() => { setMode('RX'); }}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              mode === 'RX'
                ? 'bg-zinc-800 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Receiver
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl transition-all duration-500 min-h-[500px] flex items-center">

        {/* TRANSMITTER UI */}
        {mode === 'TX' && (
          <div className="flex flex-col md:flex-row gap-12 items-center justify-between w-full animate-in fade-in duration-500">
             {/* Left: Canvas */}
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

            {/* Right: Controls */}
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
              </div>
            </div>
          </div>
        )}

        {/* RECEIVER UI */}
        {mode === 'RX' && (
          <div className="flex flex-col items-center justify-center w-full animate-in fade-in duration-500 space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-white tracking-tight">Optical Receiver</h2>
                <p className="text-zinc-400 text-sm max-w-md">
                    Align the crosshair with the Top-Left Magenta Anchor. Use [+] and [-] to match grid size.
                </p>
            </div>

            <div className="relative w-full max-w-md aspect-square bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 group">
              {/* Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-500 ${isScanning ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* Hidden Processing Canvas */}
              <canvas ref={processingCanvasRef} className="hidden" />

              {/* Not Scanning State */}
              {!isScanning && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-zinc-900/90">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                         <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.818v6.364a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </div>
                    <button
                        onClick={startCamera}
                        className="px-6 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-colors shadow-lg hover:shadow-white/20"
                    >
                        Activate Camera
                    </button>
                </div>
              )}

              {/* Error State */}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-zinc-900/90 p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <p className="text-red-400 font-medium">{cameraError}</p>
                    <button
                        onClick={startCamera}
                        className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
                    >
                        Retry
                    </button>
                </div>
              )}

              {/* Scanning Overlay (Single Anchor Projection) */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {/* ORIGIN PROBE (Center of Screen) */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                         <div className={`w-full h-full border-2 transition-colors duration-200 ${isOriginLocked ? 'border-green-400 shadow-[0_0_10px_#4ade80]' : 'border-white/30'}`}></div>
                         {/* Crosshair */}
                         <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/50"></div>
                         <div className="absolute top-0 left-1/2 h-full w-[1px] bg-white/50"></div>
                    </div>

                    {/* PROJECTED PORTAL */}
                    {isOriginLocked && (
                        <div
                            className="absolute border-4 border-green-500/80 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                            style={{
                                top: '50%',
                                left: '50%',
                                width: `${cellSize * (GRID_COUNT - 1)}px`, // Spanning from center of TL to center of BR?
                                // If anchors are at (0,0), (11,0), etc.
                                // The distance is 11 cells.
                                // Wait, the previous logic was 9 for 10x10.
                                // Now 12x12. Distance is 11?
                                // Let's try matching the grid visually.
                                // If 12x12 grid, and we render cells of size X.
                                // Total width is 12*X.
                                // But "Origin" is the center of the TL anchor (which is 2x2).
                                // This gets complicated.
                                // Let's stick to simple projection:
                                // "Top-Right = OriginX + (CELL_SIZE * 9)" was the prompt.
                                // Now grid is 12x12.
                                // Let's use `cellSize * 11` as a safe bet for 12 cells (0..11).
                                height: `${cellSize * (GRID_COUNT - 1)}px`,
                                transformOrigin: 'top left'
                            }}
                        >
                            {/* Grid Hints (Corners) */}
                            <div className="absolute top-0 right-0 w-2 h-2 bg-green-400"></div>
                            <div className="absolute bottom-0 left-0 w-2 h-2 bg-green-400"></div>
                            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-400"></div>

                            {/* Grid Overlay Hint */}
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.2)_1px,transparent_1px)]"
                                style={{ backgroundSize: `${cellSize}px ${cellSize}px` }}
                            ></div>
                        </div>
                    )}
                </div>
              )}
            </div>

            {/* Manual Controls */}
            {isScanning && (
              <div className="w-full flex flex-col gap-4 max-w-xs">
                  {/* Cell Size Controls */}
                  <div className="flex items-center justify-between bg-zinc-900/80 px-6 py-3 rounded-xl border border-zinc-800">
                      <span className="text-xs font-mono text-zinc-400 uppercase">Grid Scale</span>
                      <div className="flex items-center gap-4">
                          <button
                            onClick={() => handleCellSizeChange(-1)}
                            className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors text-white font-mono"
                          >
                              -
                          </button>
                          <span className="font-mono text-white min-w-[3ch] text-center">{cellSize}</span>
                          <button
                            onClick={() => handleCellSizeChange(1)}
                            className="w-8 h-8 flex items-center justify-center bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors text-white font-mono"
                          >
                              +
                          </button>
                      </div>
                  </div>

                  {/* Zoom Slider (Conditional) */}
                  {zoomCapabilities && (
                    <div className="w-full flex items-center gap-3 px-4 py-2 bg-zinc-900/80 rounded-full border border-zinc-800">
                        <span className="text-xs text-zinc-500 font-mono">ZOOM</span>
                        <input
                        type="range"
                        min={zoomCapabilities.min}
                        max={zoomCapabilities.max}
                        step={zoomCapabilities.step}
                        value={zoomLevel}
                        onChange={handleZoomChange}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                    </div>
                  )}

                  <button
                      onClick={stopCamera}
                      className="px-6 py-2 text-zinc-500 hover:text-white transition-colors text-sm uppercase tracking-widest font-mono text-center"
                  >
                      Stop Feed
                  </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
