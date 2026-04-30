import React from 'react';
import { GAME_PRESETS } from '../gameConfig';

const COMING_SOON_MODES = [
  'Empire Builder', 'RPG Adventure', 'Fighting Arena',
  'Racing Rush', 'Shooter Arena', 'Survival Mode', 'Simulator World'
];

const GameSelectorModal = ({ isOpen, presetKey, onSelectPreset, onClose }) => {
  if (!isOpen) return null;

  const handleSelect = (key) => {
    onSelectPreset(key);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', overflowY: 'auto', background: 'rgba(11, 14, 20, 0.95)', backdropFilter: 'blur(10px)' }}>
      <img src="/assets/Logo_PlayMint_(transparent).png" alt="PlayMint" style={{ height: '40px', marginBottom: '30px' }} />
      <h2 className="pm-heading" style={{ color: '#fff', fontSize: 'clamp(24px, 5vw, 36px)', margin: '0 0 40px 0', fontFamily: 'var(--font-game)', letterSpacing: '2px' }}>SELECT MODE</h2>
      
      <div style={{ maxWidth: '1000px', width: '100%' }}>
        <h3 className="pm-heading" style={{ color: 'var(--pm-accent-teal)', marginBottom: '8px', fontSize: '20px', textAlign: 'left' }}>Available Now</h3>
        <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--pm-accent-teal) 0%, transparent 100%)', marginBottom: '30px', width: '100%' }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px', marginBottom: '50px' }}>
          
          {/* Runner */}
          <div 
            className="pm-card"
            onClick={() => handleSelect('standard')}
            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 20px', border: presetKey === 'standard' ? '2px solid var(--pm-accent-teal)' : '2px solid transparent', background: 'radial-gradient(circle at bottom left, rgba(33, 155, 134, 0.15), var(--pm-bg-panel-light) 70%)' }}
          >
            <h4 className="pm-heading" style={{ margin: '0', fontSize: '20px' }}>Runner</h4>
          </div>

          {/* Action Quest */}
          <div 
            className="pm-card"
            onClick={() => handleSelect('action_quest')}
            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 20px', border: presetKey === 'action_quest' ? '2px solid var(--pm-accent-teal)' : '2px solid transparent', background: 'radial-gradient(circle at bottom right, rgba(212, 157, 51, 0.15), var(--pm-bg-panel-light) 70%)' }}
          >
            <h4 className="pm-heading" style={{ margin: '0', fontSize: '20px' }}>Action Quest</h4>
          </div>
        </div>

        <h3 className="pm-heading" style={{ color: 'var(--pm-text-secondary)', borderBottom: '1px solid var(--pm-border)', paddingBottom: '15px', marginBottom: '30px', fontSize: '16px' }}>Coming Soon</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {COMING_SOON_MODES.map(name => (
            <div key={name} className="pm-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5 }}>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{name}</span>
              <span className="pm-badge" style={{ background: 'var(--pm-bg-main)', color: 'var(--pm-text-tertiary)' }}>LOCKED</span>
            </div>
          ))}
        </div>
      </div>
      
      <button 
        className="pm-btn pm-btn-outline"
        onClick={onClose}
        style={{ marginTop: '50px' }}
      >
        Cancel
      </button>
    </div>
  );
};

export default GameSelectorModal;
