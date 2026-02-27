'use client';

import { useState, useRef, useEffect } from 'react';
import { textToBinary, createChunks, COLORS } from '@/lib/protocol';

export default function PhotonInterface() {
  const [mode, setMode] = useState('TX'); // 'TX' (Transmitter) or 'RX' (Receiver)

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

  // Probe State
  const processingCanvasRef = useRef(null);
  const [probeData, setProbeData] = useState({
      tl: { r: 0, g: 0, b: 0, locked: false }, // Top-Left
      tr: { r: 0, g: 0, b: 0, locked: false }, // Top-Right
      bl: { r: 0, g: 0, b: 0, locked: false }, // Bottom-Left
      br: { r: 0, g: 0, b: 0, locked: false }, // Bottom-Right
      center: { r: 0, g: 0, b: 0 }, // Center Data Probe
      fullLock: false,
      gridWidth: 0,
      gridHeight: 0,
      cellWidth: 0,
      cellHeight: 0
  });
  const requestRef = useRef();
  const lastLogTime = useRef(0);

  // Constants
  const COLS = 10;
  const ROWS = 10;
  const CELL_SIZE = 30;
  const CANVAS_SIZE = COLS * CELL_SIZE;
  const PROBE_SIZE = 20;

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
      if (i === 0 || i === 9 || i === 90 || i === 99) {
        colorCode = "101"; // Magenta Anchors
      } else if (i === 1) {
        colorCode = "000"; // Clock
      } else {
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

  // --- PIXEL PROBE LOGIC ---
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

        // Define 4 Anchor Probes (20% Side, 15% Top/Bottom)
        // TL: 20% W, 15% H
        // TR: 80% W, 15% H
        // BL: 20% W, 85% H
        // BR: 80% W, 85% H
        const x1 = Math.floor(canvas.width * 0.2);
        const x2 = Math.floor(canvas.width * 0.8);
        const y1 = Math.floor(canvas.height * 0.15);
        const y2 = Math.floor(canvas.height * 0.85);

        // Sample 4 Anchors
        const tlRGB = getAverageRGB(ctx, x1, y1, PROBE_SIZE);
        const trRGB = getAverageRGB(ctx, x2, y1, PROBE_SIZE);
        const blRGB = getAverageRGB(ctx, x1, y2, PROBE_SIZE);
        const brRGB = getAverageRGB(ctx, x2, y2, PROBE_SIZE);

        // Handshake Logic: Magenta (R > 200, G < 100, B > 200)
        // Relaxed threshold slightly for better real-world detection: R>180, G<120, B>180
        const checkLock = (rgb) => (rgb.r > 180 && rgb.g < 120 && rgb.b > 180);

        const tlLocked = checkLock(tlRGB);
        const trLocked = checkLock(trRGB);
        const blLocked = checkLock(blRGB);
        const brLocked = checkLock(brRGB);

        const fullLock = tlLocked && trLocked && blLocked && brLocked;

        // Debug individual probes if not locked
        const debugNow = Date.now();
        if (debugNow - lastLogTime.current > 1000) { // Log every second
             if (!fullLock) {
                 // console.log(`Probes: TL(${tlRGB.r},${tlRGB.g},${tlRGB.b}) TR(${trRGB.r},${trRGB.g},${trRGB.b}) BL(${blRGB.r},${blRGB.g},${blRGB.b}) BR(${brRGB.r},${brRGB.g},${brRGB.b})`);
             }
        }

        // Calculate Dimensions
        // Width: average of top width and bottom width
        const topWidth = x2 - x1;
        const botWidth = x2 - x1; // They are geometrically same in pixel space here, but in real world perspective might differ?
        // We are measuring pixel distance of our probes, so it's static unless we track blobs.
        // Wait, the request says "Calculate Average Cell Width ... based on the distance between these 4 points".
        // Since we are creating static probes, the distance IS static pixel distance.
        // BUT, if we were tracking the dots, it would be dynamic.
        // For this task, "Create four... Anchor Probes positioned in a square pattern... While fully mapped, calculate..."
        // This implies we assume the user aligns the camera such that the image matches our probes.
        // So the "distance" is just the distance between our probes.
        // Which is (80% - 20%) * width = 60% of width.
        const gridWidth = x2 - x1;
        const gridHeight = y2 - y1;

        // Grid is 10x10 cells.
        // The anchors are at (0,0), (9,0), (0,9), (9,9).
        // Distance covers 9 cells.
        const cellWidth = gridWidth / 9;
        const cellHeight = gridHeight / 9;

        // Center Data Probe
        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);
        const centerRGB = getAverageRGB(ctx, centerX, centerY, PROBE_SIZE);

        setProbeData({
            tl: { ...tlRGB, locked: tlLocked },
            tr: { ...trRGB, locked: trLocked },
            bl: { ...blRGB, locked: blLocked },
            br: { ...brRGB, locked: brLocked },
            center: centerRGB,
            fullLock,
            gridWidth,
            gridHeight,
            cellWidth,
            cellHeight
        });

        const now = Date.now();
        if (now - lastLogTime.current > 333) {
            if (fullLock) {
                console.log(`GRID FULLY MAPPED. Cell: ${Math.round(cellWidth)}x${Math.round(cellHeight)}px | Center RGB: ${centerRGB.r},${centerRGB.g},${centerRGB.b}`);
            }
            lastLogTime.current = now;
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
  }, [isScanning]);


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
                    Align the 4 corner anchors with the camera grid to lock the data perimeter.
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

              {/* Scanning Overlay (4 Probe Grid) */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                    {/* Scanning Line */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-scan"></div>

                    {/* TOP LEFT PROBE */}
                    <div className="absolute top-[15%] left-[20%] -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                         <div className={`w-full h-full border-2 transition-colors duration-200 ${probeData.tl.locked ? 'border-green-400 shadow-[0_0_10px_#4ade80]' : 'border-white/30'}`}></div>
                    </div>

                    {/* TOP RIGHT PROBE */}
                    <div className="absolute top-[15%] left-[80%] -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                         <div className={`w-full h-full border-2 transition-colors duration-200 ${probeData.tr.locked ? 'border-green-400 shadow-[0_0_10px_#4ade80]' : 'border-white/30'}`}></div>
                    </div>

                    {/* BOTTOM LEFT PROBE */}
                    <div className="absolute top-[85%] left-[20%] -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                         <div className={`w-full h-full border-2 transition-colors duration-200 ${probeData.bl.locked ? 'border-green-400 shadow-[0_0_10px_#4ade80]' : 'border-white/30'}`}></div>
                    </div>

                    {/* BOTTOM RIGHT PROBE */}
                    <div className="absolute top-[85%] left-[80%] -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                         <div className={`w-full h-full border-2 transition-colors duration-200 ${probeData.br.locked ? 'border-green-400 shadow-[0_0_10px_#4ade80]' : 'border-white/30'}`}></div>
                    </div>

                    {/* Full Lock Perimeter */}
                    {probeData.fullLock && (
                        <>
                             {/* Perimeter Box */}
                             <div className="absolute top-[15%] left-[20%] right-[20%] bottom-[15%] border border-green-400/50 shadow-[0_0_15px_rgba(74,222,128,0.2)]"></div>

                             {/* Center Probe Indicator */}
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-green-500/20 border border-green-400 flex items-center justify-center">
                                 <div className="w-1 h-1 bg-green-400 rounded-full animate-ping"></div>
                             </div>

                             {/* Info Overlay */}
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-8 text-[10px] font-mono font-bold text-center space-y-1">
                                <div className="text-green-400 bg-black/80 px-2 py-1 rounded border border-green-500/30 whitespace-nowrap">
                                    GRID MAPPED: {Math.round(probeData.cellWidth)}x{Math.round(probeData.cellHeight)}px
                                </div>
                                <div className="text-zinc-400 bg-black/60 px-2 py-1 rounded">
                                    CTR: {probeData.center.r},{probeData.center.g},{probeData.center.b}
                                </div>
                             </div>
                        </>
                    )}
                </div>
              )}
            </div>

            {isScanning && (
              <div className="flex flex-col items-center gap-6 w-full max-w-xs">
                {/* Zoom Slider */}
                {zoomCapabilities && (
                  <div className="w-full flex items-center gap-3 px-4 py-2 bg-zinc-900/80 rounded-full border border-zinc-800">
                    <span className="text-xs text-zinc-500 font-mono">-</span>
                    <input
                      type="range"
                      min={zoomCapabilities.min}
                      max={zoomCapabilities.max}
                      step={zoomCapabilities.step}
                      value={zoomLevel}
                      onChange={handleZoomChange}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-zinc-500 font-mono">+</span>
                  </div>
                )}

                 <button
                    onClick={stopCamera}
                    className="px-6 py-2 text-zinc-500 hover:text-white transition-colors text-sm uppercase tracking-widest font-mono"
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
