import React, { useEffect, useRef } from 'react';
import startGame from './PhaserGame';

const GameComponent = ({ isFullscreen }) => {
  const gameContainerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    // Start the game instance once. Live tuning is handled via events.
    gameRef.current = startGame(gameContainerRef.current);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', height: '100%' }}>
      <div ref={gameContainerRef} style={{ boxShadow: isFullscreen ? 'none' : '0 4px 8px rgba(0,0,0,0.1)', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
};

export default GameComponent;
