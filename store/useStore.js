import { create } from 'zustand';

// --- Shared Slice ---
const createSharedSlice = (set) => ({
  mode: 'TX',
  setMode: (mode) => set({ mode }),
});

// --- Transmitter (TX) Slice ---
const createTransmitterSlice = (set) => ({
  inputText: '',
  setInputText: (text) => set({ inputText: text }),
  encodedChunks: [],
  setEncodedChunks: (chunks) => set({ encodedChunks: chunks }),
  cellSize: 25,
  setCellSize: (size) => set({ cellSize: size }),
});

// --- Receiver (RX) Slice ---
const createReceiverSlice = (set) => ({
  cameraStream: null,
  setCameraStream: (stream) => set({ cameraStream: stream }),
  cameraError: null,
  setCameraError: (error) => set({ cameraError: error }),
  isScanning: false,
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  zoomLevel: 1,
  setZoomLevel: (level) => set({ zoomLevel: level }),
  zoomCapabilities: null,
  setZoomCapabilities: (capabilities) => set({ zoomCapabilities: capabilities }),
  isLocked: false,
  setIsLocked: (locked) => set({ isLocked: locked }),
  decodedMessage: '',
  setDecodedMessage: (message) => set({ decodedMessage: message }),
});

// --- Root Store ---
export const useStore = create((...a) => ({
  ...createSharedSlice(...a),
  ...createTransmitterSlice(...a),
  ...createReceiverSlice(...a),
}));

export default useStore;
