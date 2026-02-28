import { create } from 'zustand';

// We implement a robust, initial setup for our global state management using Zustand.
// Following SOLID principles, we keep the store modular by separating the initial state
// from the actions, even though they currently reside in the same file.

// 1. Define the Initial State
const initialState = {
  isAppReady: false,
  userPreferences: {
    theme: 'dark',
    // additional preferences can be added here
  },
};

// 2. Define the Store using create
export const useStore = create((set, get) => ({
  ...initialState,

  // Actions
  // A simple action to toggle application readiness
  setAppReady: (status) => set({ isAppReady: status }),

  // An action to update user preferences, demonstrating merging of nested objects
  updateUserPreferences: (newPreferences) => set((state) => ({
    userPreferences: {
      ...state.userPreferences,
      ...newPreferences,
    }
  })),

  // An action to reset the entire store back to its initial state
  resetStore: () => set(initialState),
}));

export default useStore;
