import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Sound } from './audio/sound';
import { GameEngine } from './game/engine';
import './styles/global.css';

// The sound engine and the round clock live outside React so re-renders never restart a round.
const sound = new Sound();
const engine = new GameEngine(sound);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App engine={engine} sound={sound} />
  </StrictMode>,
);
