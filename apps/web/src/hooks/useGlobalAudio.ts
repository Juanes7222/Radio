import { useContext } from 'react';
import { AudioPlayerContext } from '../contexts/AudioPlayerContext';
import type { AudioPlayerContextType } from '../contexts/AudioPlayerContext';

export function useGlobalAudio(): AudioPlayerContextType {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useGlobalAudio must be used within an AudioPlayerProvider');
  }
  return context;
}
