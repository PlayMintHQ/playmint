import React, { useState, useRef, useEffect } from 'react';
import GameComponent from './GameComponent';
import { GAME_PRESETS } from './gameConfig';

function App() {
  const [presetKey, setPresetKey] = useState('standard');
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const fullscreenContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleFullscreen = () => {
    if (fullscreenContainerRef.current && !document.fullscreenElement) {
      fullscreenContainerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    }
  };

  const handleExitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };
  
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
    setShowCustomPanel(false);
  };

  return (
    <div style={{ textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#e2e8f0', minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 20px 0', color: '#1a202c', fontFamily: '"Arial Black", Impact, sans-serif', fontSize: '3.5rem', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', textShadow: '2px 4px 6px rgba(0,0,0,0.1)' }}>Runner MVP</h1>
      
      <div style={{ position: 'relative', marginBottom: '20px', zIndex: 10 }}>
        <div>
        <span style={{ marginRight: '10px', fontWeight: 'bold' }}>Game Rules:</span>
        {Object.keys(GAME_PRESETS).map((key) => (
          <button
            key={key}
            onClick={() => {
              setPresetKey(key);
              setShowCustomPanel(false);
            }}
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
          onClick={() => {
            setPresetKey('custom');
            setShowCustomPanel(true);
          }}
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
        <button
          onClick={handleFullscreen}
          style={{
            margin: '0 5px 0 15px',
            padding: '10px 20px',
            backgroundColor: '#48bb78',
            color: '#ffffff',
            border: '2px solid #48bb78',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 6px rgba(72, 187, 120, 0.2)',
            transition: 'all 0.2s ease'
          }}
        >
          Go Fullscreen ⛶
        </button>
        </div>

        {isCustom && showCustomPanel && (
          <div style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.6)', 
            zIndex: 2000, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}>
            <div style={{
              backgroundColor: '#fff', 
              padding: '30px', 
              borderRadius: '12px', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#1a202c' }}>Custom Parameters</h3>
                <button onClick={() => setShowCustomPanel(false)} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✖</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label style={{ fontSize: '14px' }}>Run Speed:<br/><input type="number" name="runSpeed" value={customParams.runSpeed} onChange={handleCustomChange} style={{ width: '120px', marginTop: '6px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }} /></label>
                <label style={{ fontSize: '14px' }}>Jump Force:<br/><input type="number" name="jumpForce" value={customParams.jumpForce} onChange={handleCustomChange} style={{ width: '120px', marginTop: '6px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}/></label>
                <label style={{ fontSize: '14px' }}>Gravity:<br/><input type="number" name="gravity" value={customParams.gravity} onChange={handleCustomChange} style={{ width: '120px', marginTop: '6px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}/></label>
                <label style={{ fontSize: '14px' }}>Obstacle Delay (ms):<br/><input type="number" name="obstacleDelay" value={customParams.obstacleDelay} onChange={handleCustomChange} style={{ width: '120px', marginTop: '6px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}/></label>
                <label style={{ fontSize: '14px' }}>Speed Increment:<br/><input type="number" name="speedIncrement" step="0.01" value={customParams.speedIncrement} onChange={handleCustomChange} style={{ width: '120px', marginTop: '6px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e0' }}/></label>
              </div>
              <div style={{ textAlign: 'center', marginTop: '25px' }}>
                <button onClick={applyCustom} style={{ padding: '10px 20px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>Apply & Restart Game</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div 
        ref={fullscreenContainerRef} 
        style={{ 
          position: 'relative', 
          backgroundColor: isFullscreen ? '#000' : 'transparent',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: isFullscreen ? '100vw' : '100%',
          height: isFullscreen ? '100vh' : '600px',
          maxWidth: isFullscreen ? 'none' : '800px',
          margin: '0 auto'
        }}
      >
        <GameComponent options={currentPreset} isFullscreen={isFullscreen} />
        {isFullscreen && (
          <button
            onClick={handleExitFullscreen}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              padding: '10px 15px',
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              zIndex: 100
            }}
          >
            ✖ Exit Fullscreen
          </button>
        )}
      </div>
      <p style={{ color: '#4a5568', marginTop: '20px', fontSize: '1.2rem', fontWeight: '500' }}>
        Click or press <kbd style={{background: '#edf2f7', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e0', boxShadow: '0 2px 0 #cbd5e0', color: '#1a202c', fontFamily: 'monospace', fontWeight: 'bold'}}>SPACE</kbd> to jump
      </p>
    </div>
  );
}

export default App;
