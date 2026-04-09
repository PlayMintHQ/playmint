import React from 'react';
import GameComponent from './GameComponent';

function App() {
  return (
    <div style={{ textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#f0f0f0', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ margin: 0, color: '#333' }}>Runner MVP</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>Click or press SPACE to jump</p>
      <GameComponent />
    </div>
  );
}

export default App;
