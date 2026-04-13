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
    <div style={{ textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#e2e8f0', minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxWidth: '860px', width: '100%' }}>
        <h1 style={{ margin: 0, color: '#1a202c', fontSize: '2.5rem', fontWeight: '800' }}>Runner MVP</h1>
        <p style={{ color: '#4a5568', marginBottom: '20px', fontSize: '1.1rem' }}>Click or press <kbd style={{background: '#edf2f7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e0'}}>SPACE</kbd> to jump</p>
      
      <div style={{ marginBottom: '20px' }}>
        <span style={{ marginRight: '10px', fontWeight: 'bold' }}>Game Rules:</span>
        {Object.keys(GAME_PRESETS).map((key) => (
          <button
            key={key}
            onClick={() => setPresetKey(key)}
            style={{
              margin: '0 5px',
              padding: '10px 20px',
              backgroundColor: presetKey === key ? '#3182ce' : '#ffffff',
              color: presetKey === key ? '#ffffff' : '#2d3748',
              border: presetKey === key ? '2px solid #3182ce' : '2px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              boxShadow: presetKey === key ? '0 4px 6px rgba(49, 130, 206, 0.2)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {GAME_PRESETS[key].name}
          </button>
        ))}
        <button
          onClick={() => setPresetKey('custom')}
          style={{
            margin: '0 5px',
            padding: '10px 20px',
            backgroundColor: presetKey === 'custom' ? '#dd6b20' : '#ffffff',
            color: presetKey === 'custom' ? '#ffffff' : '#2d3748',
            border: presetKey === 'custom' ? '2px solid #dd6b20' : '2px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: presetKey === 'custom' ? '0 4px 6px rgba(221, 107, 32, 0.2)' : 'none',
            transition: 'all 0.2s ease'
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
    </div>
  );
}

export default App;
