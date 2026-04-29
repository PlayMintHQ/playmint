import React, { useEffect, useRef } from 'react';
import startGame from './game';

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
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'block' }}>
      <div
        ref={gameContainerRef}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          boxShadow: isFullscreen ? 'none' : '0 4px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      />
    </div>
  );
};

export default GameComponent;
