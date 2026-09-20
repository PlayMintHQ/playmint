import React, { useEffect, useRef } from 'react';
import startGame from './game';

const GameComponent = ({ isFullscreen }) => {
  const gameContainerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    // Synchronously blur any active element from React UI inputs/buttons before game mounts
    // to prevent browser "dead focus" states that trap keyboard spacebar inputs.
    // Exception: focus inside the sign-in dialog / account menu stays put (a
    // share-restore remount can happen while the dialog is open).
    const active = document.activeElement;
    if (active && !active.closest?.('[data-pm-modal]') && typeof active.blur === 'function') {
      active.blur();
    }

    // Start the game instance once. Live tuning is handled via events.
    gameRef.current = startGame(gameContainerRef.current);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = () => {
    const el = document.activeElement;
    if (el && el !== document.body && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      el.blur();
    }
  };

  return (
    <div 
      style={{ position: 'relative', width: '100%', height: '100%', display: 'block', overflow: 'hidden' }}
      onPointerDown={handlePointerDown}
    >
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
