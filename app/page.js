import Transmitter from '../components/Transmitter';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">

      {/* Background with slight gradient, very subtle */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950"></div>

      {/* Subtle grid lines, very faint */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

      <div className="z-10 w-full max-w-6xl mx-auto flex flex-col items-center gap-16 py-12">
        <header className="text-center space-y-2">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Photon Power
          </h1>
          <p className="text-lg md:text-xl text-zinc-500 font-light tracking-wide">
            Optical Data Transfer Protocol <span className="text-zinc-700 text-sm align-super">BETA</span>
          </p>
        </header>

        <Transmitter />

        <footer className="w-full text-center border-t border-zinc-900 pt-8 mt-12">
            <p className="text-xs text-zinc-600 uppercase tracking-widest font-mono">
                System Online &bull; Secure Connection &bull; v1.0.0
            </p>
        </footer>
      </div>
    </main>
  );
}
