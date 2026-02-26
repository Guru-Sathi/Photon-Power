import Transmitter from '../components/Transmitter';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-mono">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.5)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>

      {/* Ambient Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/30 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-900/30 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="z-10 w-full max-w-4xl mx-auto flex flex-col items-center gap-12">
        <header className="text-center space-y-4">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 drop-shadow-sm">
            PHOTON POWER
          </h1>
          <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto tracking-widest uppercase">
            Optical Data Transfer Protocol // v1.0.0
          </p>
        </header>

        <Transmitter />

        <footer className="text-xs text-gray-700 mt-12 tracking-wide">
          SECURE CONNECTION ESTABLISHED // ENCRYPTION: NONE
        </footer>
      </div>
    </main>
  );
}
