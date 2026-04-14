import React, { useEffect, useRef } from 'react';
import startGame from './PhaserGame';

const GameComponent = ({ options, isFullscreen }) => {
  const gameContainerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    // If there's an existing game, destroy it to restart with new options
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    // Start a new game with the current options
    gameRef.current = startGame(gameContainerRef.current, options);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [options]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: isFullscreen ? '0' : '20px', width: '100%', height: '100%' }}>
      <div ref={gameContainerRef} style={{ boxShadow: isFullscreen ? 'none' : '0 4px 8px rgba(0,0,0,0.1)', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
};

export default GameComponent;
