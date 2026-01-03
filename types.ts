
export interface TranscriptionEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export enum ConnectionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}
