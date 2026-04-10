import React, { useState } from 'react';
import GameComponent from './GameComponent';
import { GAME_PRESETS } from './gameConfig';

function App() {
  const [presetKey, setPresetKey] = useState('standard');
  
  // Custom options state
  const [customParams, setCustomParams] = useState({
    name: 'Custom',
    runSpeed: 350,
    jumpForce: 750,
    gravity: 1800,
    obstacleDelay: 1200,
    speedIncrement: 0.05
  });

  // State to hold the applied custom configuration for the game
  const [appliedCustomParams, setAppliedCustomParams] = useState(customParams);

  const isCustom = presetKey === 'custom';
  const currentPreset = isCustom ? appliedCustomParams : GAME_PRESETS[presetKey];

  const handleCustomChange = (e) => {
    const { name, value } = e.target;
    setCustomParams(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  const applyCustom = () => {
    setAppliedCustomParams(customParams);
  };

  return (
    <div style={{ textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#f0f0f0', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ margin: 0, color: '#333' }}>Runner MVP</h1>
      <p style={{ color: '#666', marginBottom: '10px' }}>Click or press SPACE to jump</p>
      
      <div style={{ marginBottom: '20px' }}>
        <span style={{ marginRight: '10px', fontWeight: 'bold' }}>Game Rules:</span>
        {Object.keys(GAME_PRESETS).map((key) => (
          <button
            key={key}
            onClick={() => setPresetKey(key)}
            style={{
              margin: '0 5px',
              padding: '8px 16px',
              backgroundColor: presetKey === key ? '#007BFF' : '#FFF',
              color: presetKey === key ? '#FFF' : '#000',
              border: '1px solid #CCC',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {GAME_PRESETS[key].name}
          </button>
        ))}
        <button
          onClick={() => setPresetKey('custom')}
          style={{
            margin: '0 5px',
            padding: '8px 16px',
            backgroundColor: presetKey === 'custom' ? '#ff9900' : '#FFF',
            color: presetKey === 'custom' ? '#FFF' : '#000',
            border: '1px solid #CCC',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Custom
        </button>
      </div>

      {isCustom && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd', display: 'inline-block', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>Custom Parameters</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '14px' }}>Run Speed:<br/><input type="number" name="runSpeed" value={customParams.runSpeed} onChange={handleCustomChange} style={{ width: '100px', marginTop: '4px' }} /></label>
            <label style={{ fontSize: '14px' }}>Jump Force:<br/><input type="number" name="jumpForce" value={customParams.jumpForce} onChange={handleCustomChange} style={{ width: '100px', marginTop: '4px' }}/></label>
            <label style={{ fontSize: '14px' }}>Gravity:<br/><input type="number" name="gravity" value={customParams.gravity} onChange={handleCustomChange} style={{ width: '100px', marginTop: '4px' }}/></label>
            <label style={{ fontSize: '14px' }}>Obstacle Delay (ms):<br/><input type="number" name="obstacleDelay" value={customParams.obstacleDelay} onChange={handleCustomChange} style={{ width: '100px', marginTop: '4px' }}/></label>
            <label style={{ fontSize: '14px' }}>Speed Increment:<br/><input type="number" name="speedIncrement" step="0.01" value={customParams.speedIncrement} onChange={handleCustomChange} style={{ width: '100px', marginTop: '4px' }}/></label>
          </div>
          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <button onClick={applyCustom} style={{ padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Apply & Restart Game</button>
          </div>
        </div>
      )}

      <GameComponent options={currentPreset} />
    </div>
  );
}

export default App;
