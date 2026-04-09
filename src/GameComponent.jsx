import React, { useEffect, useRef } from 'react';
import startGame from './PhaserGame';

const GameComponent = () => {
  const gameContainerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = startGame(gameContainerRef.current);
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
      <div ref={gameContainerRef} style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }} />
    </div>
  );
};

export default GameComponent;
