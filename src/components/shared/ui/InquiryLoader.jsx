import React from 'react';
// CSS is now handled in src/index.css

const InquiryLoader = () => {
  const text = 'HIDDEN PARTNER CLOUD';

  return (
    <div 
      className="loader-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B1121', // Matches your dark theme background
        zIndex: 99999 // Guarantees it sits on top of navbars and other layouts
      }}
    >
      <div className="loader-content" style={{ width: '100%', maxWidth: '800px', textAlign: 'center' }}>
        <svg 
          viewBox="0 0 1000 200" 
          className="svg-text" 
          style={{ width: '100%', height: '100%' }} // Safe fallback to prevent "auto" height crashes
        >
          {text.split('').map((char, i) => (
            <text
              key={i}
              x={40 + i * 45}
              y={100}
              className="letter"
              style={{ 
                animationDelay: `${i * 0.1}s` 
              }}
            >
              {char}
            </text>
          ))}
        </svg>
        <div className="progress-bar-container">
          <div className="progress-bar-glow"></div>
        </div>
        <p className="loader-subtitle" style={{ marginTop: '1rem', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '2px' }}>
          SYSTEM INITIALIZING...
        </p>
      </div>
    </div>
  );
};

export default InquiryLoader;