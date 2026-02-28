'use client';

import { useRef, useEffect, useCallback } from 'react';
import { textToBinary, createChunks, COLORS, getColorBits, binaryToASCII } from '@/lib/protocol';
import { useStore } from '@/store/useStore';

export default function PhotonInterface() {
  const store = useStore();

  // TX State
  const canvasRef = useRef(null);

  // RX State
  const videoRef = useRef(null);

  // Perspective Scanner State
  const processingCanvasRef = useRef(null);
  const displayCanvasRef = useRef(null); // Overlay for drawing quad and dots

  const requestRef = useRef();
  const lastLogTime = useRef(0);

  // Constants
  const COLS = 14;
  const ROWS = 14;
  // CELL_SIZE is now a state
  const CANVAS_SIZE = COLS * store.cellSize;
  const PROBE_SIZE = 20;
  const GRID_COUNT = 14;

  // --- TRANSMITTER LOGIC ---
  useEffect(() => {
    if (store.mode !== 'TX') return;
    if (!store.inputText) {
      store.setEncodedChunks([]);
      return;
    }
    const binary = textToBinary(store.inputText);
    const chunks = createChunks(binary);
    store.setEncodedChunks(chunks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.inputText, store.mode]);

  useEffect(() => {
    if (store.mode !== 'TX') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalCells = COLS * ROWS;

    for (let i = 0; i < totalCells; i++) {
      let colorCode;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      // 1. ANCHOR LOGIC (2x2 Corners of 14x14)
      const isTL = (col < 2 && row < 2);
      const isTR = (col > 11 && row < 2);
      const isBL = (col < 2 && row > 11);
      const isBR = (col > 11 && row > 11);

      if (isTL || isTR || isBL || isBR) {
        colorCode = "101"; // Magenta
      }
      // 2. QUIET ZONE LOGIC
      // Data core is central 10x10 -> col: 2..11, row: 2..11
      // Everything else that is not an anchor is Quiet Zone (Black)
      else if (col < 2 || col > 11 || row < 2 || row > 11) {
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
          const x = col * store.cellSize;
          const y = row * store.cellSize;
          ctx.fillStyle = color;
          ctx.fillRect(x, y, store.cellSize, store.cellSize);
      }
    }

    // 2nd Pass: Fill Data (Central 10x10)
    let dataIndex = 0;
    for (let i = 0; i < totalCells; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        const isDataCore = (col >= 2 && col <= 11 && row >= 2 && row <= 11);

        if (isDataCore) {
            if (dataIndex < store.encodedChunks.length) {
                const chunk = store.encodedChunks[dataIndex];
                const color = COLORS[chunk] || "#000000";
                const x = col * store.cellSize;
                const y = row * store.cellSize;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, store.cellSize, store.cellSize);
            } else {
                // Out of data, fill black
                const x = col * store.cellSize;
                const y = row * store.cellSize;
                ctx.fillStyle = "#000000";
                ctx.fillRect(x, y, store.cellSize, store.cellSize);
            }
            dataIndex++;
        }
    }

  }, [store.encodedChunks, store.mode, store.cellSize]);

  // --- RECEIVER LOGIC ---
  const startCamera = async () => {
    try {
      store.setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', zoom: true }
      });

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities();

      if (capabilities && 'zoom' in capabilities) {
        store.setZoomCapabilities({
          min: capabilities.zoom.min,
          max: capabilities.zoom.max,
          step: capabilities.zoom.step
        });
        store.setZoomLevel(capabilities.zoom.min);
      } else {
          store.setZoomCapabilities(null);
      }

      store.setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      store.setIsScanning(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      store.setCameraError("Camera access denied. Please check permissions.");
    }
  };

  const handleZoomChange = (event) => {
    const newZoom = Number(event.target.value);
    store.setZoomLevel(newZoom);

    if (store.cameraStream) {
      const videoTrack = store.cameraStream.getVideoTracks()[0];
      videoTrack.applyConstraints({
        advanced: [{ zoom: newZoom }]
      });
    }
  };

  const handleCellSizeChange = (delta) => {
      store.setCellSize(Math.max(5, store.cellSize + delta));
  };

  const stopCamera = () => {
    if (store.cameraStream) {
      store.cameraStream.getTracks().forEach(track => track.stop());
      store.setCameraStream(null);
    }
    store.setIsScanning(false);
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (store.cameraStream) {
        store.cameraStream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [store.cameraStream]);

  // --- PERSPECTIVE SCANNER LOGIC ---
  const processFrame = useCallback(function processFrameFunc() {
    if (!videoRef.current || !processingCanvasRef.current || !displayCanvasRef.current || !store.isScanning) return;

    const video = videoRef.current;
    const canvas = processingCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const displayCanvas = displayCanvasRef.current;
    const displayCtx = displayCanvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        displayCanvas.width = video.videoWidth;
        displayCanvas.height = video.videoHeight;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

        const step = 4;
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frameData.data;

        // Find 4 extreme points
        let tl = null, tr = null, bl = null, br = null;
        let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
        let magentaCount = 0;

        for (let y = 0; y < canvas.height; y += step) {
            for (let x = 0; x < canvas.width; x += step) {
                const i = (y * canvas.width + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                // High Confidence Magenta (R>220, G<80, B>220)
                if (r > 220 && g < 80 && b > 220) {
                    magentaCount++;
                    const sum = x + y;
                    const diff = x - y;

                    if (sum < minSum) { minSum = sum; tl = {x, y}; }
                    if (sum > maxSum) { maxSum = sum; br = {x, y}; }
                    if (diff > maxDiff) { maxDiff = diff; tr = {x, y}; }
                    if (diff < minDiff) { minDiff = diff; bl = {x, y}; }
                }
            }
        }

        const now = new Date().getTime();

        if (magentaCount > 20 && tl && tr && bl && br) {
            // Check if quadrilateral is "tiny"
            const diagonalSq = Math.pow(br.x - tl.x, 2) + Math.pow(br.y - tl.y, 2);
            if (diagonalSq < 2500) { // roughly 50px diagonal
                store.setIsLocked(false);
                if (now - lastLogTime.current > 1000) {
                    console.log('Searching for Anchors... (Box too tiny)');
                    lastLogTime.current = now;
                }
            } else {
                store.setIsLocked(true);

                // Draw Quadrilateral Outline
                displayCtx.strokeStyle = '#4ade80'; // Green
                displayCtx.lineWidth = 3;
                displayCtx.beginPath();
                displayCtx.moveTo(tl.x, tl.y);
                displayCtx.lineTo(tr.x, tr.y);
                displayCtx.lineTo(br.x, br.y);
                displayCtx.lineTo(bl.x, bl.y);
                displayCtx.closePath();
                displayCtx.stroke();

                // Bilinear Interpolation for 10x10 Grid (indices 2 to 11 of 14x14)
                displayCtx.fillStyle = '#ffffff'; // White dots
                let bitstream = "";
                let debugBits = "";

                for (let row = 2; row < 12; row++) {
                    for (let col = 2; col < 12; col++) {
                        const u = (col + 0.5) / 14;
                        const v = (row + 0.5) / 14;

                        // P(u,v) = (1-u)(1-v)TL + u(1-v)TR + (1-u)vBL + uvBR
                        const x = Math.floor(
                            (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + (1-u)*v*bl.x + u*v*br.x
                        );
                        const y = Math.floor(
                            (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + (1-u)*v*bl.y + u*v*br.y
                        );

                        // Draw White Dot
                        displayCtx.beginPath();
                        displayCtx.arc(x, y, 2, 0, 2 * Math.PI);
                        displayCtx.fill();

                        // Sample RGB
                        if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                            const i = (y * canvas.width + x) * 4;
                            const r = data[i];
                            const g = data[i + 1];
                            const b = data[i + 2];

                            // "If center pixel is White (R,G,B > 200), log '1'... Black log '0'"
                            // For actual decoding we still use getColorBits
                            const isWhite = (r > 200 && g > 200 && b > 200);
                            debugBits += isWhite ? '1' : '0';

                            const bits = getColorBits(r, g, b);
                            bitstream += bits;
                        } else {
                            bitstream += "000";
                            debugBits += '0';
                        }
                    }
                }

                // Log Human Readable Test
                if (now - lastLogTime.current > 500) {
                    console.log(`Grid Bits: ${debugBits.substring(0, 30)}...`); // snippet
                    lastLogTime.current = now;
                }

                const text = binaryToASCII(bitstream);
                if (text !== store.decodedMessage) {
                    store.setDecodedMessage(text);
                }
            }
        } else {
            store.setIsLocked(false);
            if (now - lastLogTime.current > 1000) {
                console.log('Searching for Anchors...');
                lastLogTime.current = now;
            }
        }
    }

    requestRef.current = requestAnimationFrame(processFrameFunc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isScanning, store.decodedMessage]);

  useEffect(() => {
    if (store.isScanning) {
        requestRef.current = requestAnimationFrame(processFrame);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [store.isScanning, processFrame]);


  // --- RENDER ---
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">

      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="bg-zinc-900/50 p-1 rounded-full border border-zinc-800 backdrop-blur-md flex shadow-lg">
          <button
            onClick={() => { store.setMode('TX'); stopCamera(); }}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              store.mode === 'TX'
                ? 'bg-zinc-800 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Transmitter
          </button>
          <button
            onClick={() => { store.setMode('RX'); }}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              store.mode === 'RX'
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
        {store.mode === 'TX' && (
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
                  <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${store.encodedChunks.length > 0 ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`}></div>
                  <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase">
                      {store.encodedChunks.length > 0 ? 'Transmitting' : 'Standby'}
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
                          value={store.inputText}
                          onChange={(e) => store.setInputText(e.target.value)}
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
                              {String(store.encodedChunks.length).padStart(2, '0')}
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
                          <span>{Math.round((store.encodedChunks.length / 94) * 100)}%</span>
                      </div>
                      <div className="w-full bg-zinc-800/30 rounded-full h-1 overflow-hidden">
                          <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${store.encodedChunks.length > 90 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                              style={{ width: `${Math.min((store.encodedChunks.length / 94) * 100, 100)}%` }}
                          ></div>
                      </div>
                  </div>
              </div>
            </div>
          </div>
        )}

        {/* RECEIVER UI */}
        {store.mode === 'RX' && (
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
                className={`w-full h-full object-cover transition-opacity duration-500 ${store.isScanning ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* Hidden Processing Canvas & Visible Display Canvas */}
              <canvas ref={processingCanvasRef} className="hidden" />
              <canvas
                ref={displayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${store.isScanning ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* Not Scanning State */}
              {!store.isScanning && !store.cameraError && (
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
              {store.cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-zinc-900/90 p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <p className="text-red-400 font-medium">{store.cameraError}</p>
                    <button
                        onClick={startCamera}
                        className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
                    >
                        Retry
                    </button>
                </div>
              )}

              {/* Scanning Line */}
              {store.isScanning && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-scan"></div>
                  </div>
              )}
            </div>

            {/* Controls & Output */}
            {store.isScanning && (
              <div className="w-full flex flex-col gap-4 max-w-md mt-4">
                  {/* Decoded Output */}
                  <div className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 min-h-[100px] flex flex-col">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2 flex justify-between">
                          <span>Decoded Message</span>
                          {store.isLocked && <span className="text-green-500 animate-pulse">Receiving...</span>}
                      </span>
                      <p className="text-white font-mono text-sm break-all leading-relaxed flex-1">
                          {store.decodedMessage || <span className="text-zinc-700">Waiting for lock...</span>}
                      </p>
                  </div>

                  {/* Zoom Slider (Conditional) */}
                  {store.zoomCapabilities && (
                    <div className="w-full flex items-center gap-3 px-4 py-2 bg-zinc-900/80 rounded-full border border-zinc-800">
                        <span className="text-xs text-zinc-500 font-mono">ZOOM</span>
                        <input
                        type="range"
                        min={store.zoomCapabilities.min}
                        max={store.zoomCapabilities.max}
                        step={store.zoomCapabilities.step}
                        value={store.zoomLevel}
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
