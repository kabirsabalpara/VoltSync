import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * Real Scannable SVG QR Code Component
 * Generates an authentic ISO/IEC 18004 compliant QR code scannable by any mobile camera or QR reader.
 */
export const QRCodeView = ({ value, size = 160 }) => {
  const [svgString, setSvgString] = useState('');

  useEffect(() => {
    const rawVal = String(value || 'VOLTSYNC-PASS');
    QRCode.toString(rawVal, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((svg) => {
        setSvgString(svg);
      })
      .catch((err) => {
        console.error('Real QR Code generation error:', err);
      });
  }, [value, size]);

  if (!svgString) {
    return (
      <div 
        style={{ 
          width: size, 
          height: size, 
          background: '#ffffff', 
          borderRadius: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)' 
        }}
      >
        <span style={{ fontSize: '11px', color: '#64748b' }}>Generating QR...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#ffffff',
        borderRadius: '8px',
        padding: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
};

export default QRCodeView;
