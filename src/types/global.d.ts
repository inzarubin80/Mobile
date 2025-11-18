/// <reference types="react-native-get-random-values" />

declare global {
  interface Crypto {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  }
  
  const crypto: Crypto;
}

export {};

