import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapPin, Navigation, Compass, ArrowRight, Zap, EyeOff } from 'lucide-react';
import { getCurrentCoordinates } from '../services/locationService';

// Coordinates dictionary for quick navigation
const QUICK_HUBS = [
  { name: 'Surat (Smart Grid Hub)', lat: 21.1702, lng: 72.8311 },
  { name: 'Ahmedabad (Expressway)', lat: 23.0225, lng: 72.5714 },
  { name: 'Mumbai (Metropolitan)', lat: 19.0760, lng: 72.8777 },
  { name: 'Delhi NCR (Capital Corridor)', lat: 28.6139, lng: 77.2090 },
  { name: 'Bengaluru (Tech Corridor)', lat: 12.9716, lng: 77.5946 },
];

/**
 * Procedural Earth Texture Generator
 * Creates a beautiful dark-mode continents & ocean texture with city lights
 * without requiring multi-megabyte external image downloads.
 */
function createEarthCanvas() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deep obsidian oceanic base
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#061325');
  oceanGrad.addColorStop(0.5, '#0b1d3a');
  oceanGrad.addColorStop(1, '#061325');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Lat/Long subtle grid lines
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.07)';
  ctx.lineWidth = 1;
  for (let lat = 0; lat <= height; lat += height / 12) {
    ctx.beginPath();
    ctx.moveTo(0, lat);
    ctx.lineTo(width, lat);
    ctx.stroke();
  }
  for (let lng = 0; lng <= width; lng += width / 24) {
    ctx.beginPath();
    ctx.moveTo(lng, 0);
    ctx.lineTo(lng, height);
    ctx.stroke();
  }

  // Draw procedural continental landmasses
  ctx.fillStyle = '#0f2942';
  ctx.strokeStyle = '#1e405f';
  ctx.lineWidth = 2;

  // Approximate continents via smooth bezier polygons
  const drawContinent = (points) => {
    ctx.beginPath();
    points.forEach(([xPct, yPct], i) => {
      const x = xPct * width;
      const y = yPct * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Eurasia & India
  drawContinent([
    [0.45, 0.20], [0.55, 0.18], [0.70, 0.20], [0.82, 0.24], [0.85, 0.38],
    [0.78, 0.45], [0.72, 0.48], [0.68, 0.58], [0.66, 0.54], [0.62, 0.46],
    [0.55, 0.40], [0.50, 0.36], [0.45, 0.32]
  ]);
  // India Subcontinent Highlight
  ctx.fillStyle = '#143854';
  drawContinent([
    [0.68, 0.38], [0.73, 0.38], [0.74, 0.46], [0.71, 0.54], [0.68, 0.48]
  ]);

  // Africa
  ctx.fillStyle = '#0f2942';
  drawContinent([
    [0.48, 0.38], [0.56, 0.40], [0.58, 0.50], [0.55, 0.68], [0.50, 0.76],
    [0.47, 0.62], [0.44, 0.48]
  ]);

  // North America
  drawContinent([
    [0.10, 0.20], [0.22, 0.18], [0.28, 0.25], [0.26, 0.42], [0.20, 0.46],
    [0.14, 0.42], [0.08, 0.32]
  ]);

  // South America
  drawContinent([
    [0.22, 0.50], [0.28, 0.52], [0.32, 0.62], [0.28, 0.82], [0.24, 0.78],
    [0.20, 0.60]
  ]);

  // Australia
  drawContinent([
    [0.82, 0.62], [0.90, 0.62], [0.92, 0.74], [0.84, 0.78], [0.80, 0.70]
  ]);

  // Add twinkling EV city hubs (Indian subcontinent & global networks)
  const cities = [
    // India EV hubs
    [0.702, 0.442], // Surat / Gujarat
    [0.701, 0.435], // Ahmedabad
    [0.702, 0.448], // Mumbai
    [0.715, 0.421], // Delhi
    [0.715, 0.464], // Bengaluru
    [0.718, 0.451], // Hyderabad
    // Global references
    [0.500, 0.270], // London
    [0.240, 0.350], // New York
    [0.120, 0.380], // San Francisco
    [0.840, 0.380], // Tokyo
    [0.580, 0.420], // Dubai
  ];

  cities.forEach(([xPct, yPct], index) => {
    const x = xPct * width;
    const y = yPct * height;
    const isIndiaHub = index < 6;

    // Outer glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, isIndiaHub ? 12 : 6);
    glow.addColorStop(0, isIndiaHub ? 'rgba(16, 185, 129, 0.9)' : 'rgba(56, 189, 248, 0.6)');
    glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, isIndiaHub ? 12 : 6, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.fillStyle = isIndiaHub ? '#10b981' : '#e0f2fe';
    ctx.beginPath();
    ctx.arc(x, y, isIndiaHub ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas;
}

/**
 * Convert lat/lng to 3D Sphere coordinates
 */
function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export default function GlobeIntro({ onSelectLocation, onSkip }) {
  const containerRef = useRef(null);
  const [selectedHub, setSelectedHub] = useState(QUICK_HUBS[0]);
  const [isLocating, setIsLocating] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomStage, setZoomStage] = useState('global'); // 'global' -> 'region' -> 'city' -> 'ready'
  const [webGLError, setWebGLError] = useState(false);

  // Check reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isZoomingRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Respect user's accessibility setting: Skip 3D animation immediately
      onSelectLocation(QUICK_HUBS[0].lat, QUICK_HUBS[0].lng, QUICK_HUBS[0].name);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('WebGL initialization failed, falling back:', e);
      setWebGLError(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 5.8);

    // Subtle atmospheric ambient & directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x10b981, 1.4);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x0284c7, 1.2);
    rimLight.position.set(-5, -2, -4);
    scene.add(rimLight);

    // Create Earth sphere
    const earthRadius = 2.0;
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthCanvas = createEarthCanvas();
    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.65,
      metalness: 0.25,
      emissive: new THREE.Color(0x041b12),
      emissiveIntensity: 0.35,
    });

    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    // Outer subtle atmospheric glow sphere
    const atmosGeometry = new THREE.SphereGeometry(earthRadius * 1.035, 48, 48);
    const atmosMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    });
    const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
    scene.add(atmosMesh);

    // Create pulse markers for charging hubs
    const markerGroup = new THREE.Group();
    QUICK_HUBS.forEach((hub) => {
      const pos = latLngToVector3(hub.lat, hub.lng, earthRadius * 1.01);
      const markerGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(pos);
      markerGroup.add(marker);

      // Outer beacon ring
      const ringGeo = new THREE.RingGeometry(0.05, 0.08, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().multiplyScalar(1.002));
      ring.lookAt(pos.clone().multiplyScalar(2));
      markerGroup.add(ring);
    });
    earthMesh.add(markerGroup);

    // Initial orientation: Rotate Earth so India is facing the camera
    earthMesh.rotation.y = -Math.PI * 0.45;
    earthMesh.rotation.x = 0.25;

    let animationFrameId;
    let isDisposed = false;
    let targetCameraDistance = 5.8;
    let targetCameraLookAt = new THREE.Vector3(0, 0, 0);
    let targetEarthRotationY = earthMesh.rotation.y;
    let targetEarthRotationX = earthMesh.rotation.x;

    // Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();

      // Slow passive idle rotation when not zooming
      if (!isZoomingRef.current) {
        earthMesh.rotation.y += delta * 0.04;
      } else {
        // Interpolate smooth camera glide towards target hub
        earthMesh.rotation.y += (targetEarthRotationY - earthMesh.rotation.y) * 0.06;
        earthMesh.rotation.x += (targetEarthRotationX - earthMesh.rotation.x) * 0.06;

        camera.position.z += (targetCameraDistance - camera.position.z) * 0.07;
        camera.position.y += (0.1 - camera.position.y) * 0.07;
        camera.lookAt(targetCameraLookAt);
      }

      // Marker beacon pulse
      const time = clock.getElapsedTime();
      markerGroup.children.forEach((child, i) => {
        if (child.isMesh && child.geometry.type === 'RingGeometry') {
          const scale = 1 + Math.sin(time * 3 + i) * 0.25;
          child.scale.set(scale, scale, scale);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || isDisposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Save controller for zoom action
    container._zoomToLocation = (lat, lng, name) => {
      isZoomingRef.current = true;
      setIsZooming(true);
      setZoomStage('region');


      // Calculate required Earth rotation so target lat/lng aligns with camera at (0, 0, Z)
      const targetPhi = (90 - lat) * (Math.PI / 180);
      const targetTheta = (lng + 180) * (Math.PI / 180);

      // Adjust rotation targets
      targetEarthRotationY = -targetTheta + Math.PI * 1.5;
      targetEarthRotationX = targetPhi - Math.PI * 0.5;

      // Stage 1: Zoom to country region (1.2s)
      setTimeout(() => {
        if (isDisposed) return;
        targetCameraDistance = 3.6;
        setZoomStage('city');
      }, 700);

      // Stage 2: Zoom close to city hub (2.1s)
      setTimeout(() => {
        if (isDisposed) return;
        targetCameraDistance = 2.45;
        setZoomStage('ready');
      }, 1600);

      // Stage 3: Finish and handover coordinates to app (2.7s)
      setTimeout(() => {
        if (isDisposed) return;
        onSelectLocation(lat, lng, name);
      }, 2500);
    };

    // Cleanup & WebGL Disposal
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);

      // Cleanly dispose Three.js geometries and textures
      earthGeometry.dispose();
      earthMaterial.dispose();
      earthTexture.dispose();
      atmosGeometry.dispose();
      atmosMaterial.dispose();
      markerGroup.children.forEach((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [prefersReducedMotion, onSelectLocation]);

  const handleStartZoom = (hub) => {
    setSelectedHub(hub);
    if (containerRef.current?._zoomToLocation) {
      containerRef.current._zoomToLocation(hub.lat, hub.lng, hub.name);
    } else {
      onSelectLocation(hub.lat, hub.lng, hub.name);
    }
  };

  const handleDetectGPS = async () => {
    setIsLocating(true);
    try {
      const coords = await getCurrentCoordinates({ enableHighAccuracy: true });
      const customHub = {
        name: `Live Location (${coords.lat.toFixed(2)}°, ${coords.lng.toFixed(2)}°)`,
        lat: coords.lat,
        lng: coords.lng
      };
      handleStartZoom(customHub);
    } catch (err) {
      console.warn('GPS detection failed, falling back to Surat hub:', err);
      handleStartZoom(QUICK_HUBS[0]);
    } finally {
      setIsLocating(false);
    }
  };

  // WebGL Fallback interface
  if (webGLError) {
    return (
      <div className="globe-fallback-screen" style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #061325 0%, #0b1d3a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid #10b981',
          padding: '12px 20px',
          borderRadius: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px'
        }}>
          <Zap size={18} color="#10b981" />
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#10b981' }}>VoltSync EV Station Network</span>
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 12px 0' }}>Select Your Charging Region</h1>
        <p style={{ color: '#94a3b8', maxWidth: '480px', marginBottom: '28px', fontSize: '15px' }}>
          Connect to verified high-speed EV chargers with real-time slot holds and instant FastPass booking.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxWidth: '540px' }}>
          {QUICK_HUBS.map((hub) => (
            <button
              key={hub.name}
              onClick={() => onSelectLocation(hub.lat, hub.lng, hub.name)}
              className="action-btn"
              style={{ padding: '12px 20px', fontSize: '14px', borderRadius: '12px' }}
            >
              <MapPin size={15} /> {hub.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="globe-intro-container" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'radial-gradient(ellipse at center, #0b1d3a 0%, #050d1a 100%)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '24px',
      color: '#ffffff'
    }}>
      {/* Three.js Canvas Container */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* Top Header Controls */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            padding: '8px',
            borderRadius: '12px',
            display: 'flex',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
          }}>
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>VoltSync</div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>3D Global Grid Telemetry</div>
          </div>
        </div>

        <button
          onClick={onSkip}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#e2e8f0',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
          title="Skip 3D Earth intro and go straight to map"
        >
          <EyeOff size={14} /> Skip Intro
        </button>
      </div>

      {/* Center Zoom Stage Indicator (During flight) */}
      {isZooming && (
        <div style={{
          position: 'relative',
          zIndex: 10,
          margin: 'auto',
          textAlign: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'rgba(11, 29, 58, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            padding: '16px 28px',
            borderRadius: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, fontSize: '14px' }}>
              <Compass size={18} className="spin-animation" />
              <span>
                {zoomStage === 'region' && 'Aligning Continental Orbit...'}
                {zoomStage === 'city' && `Approaching ${selectedHub?.name}...`}
                {zoomStage === 'ready' && 'Loading Local Fast Chargers...'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Descending into high-voltage charging corridor
            </div>
          </div>
        </div>
      )}

      {/* Bottom Hub Selector & Geolocation Card */}
      {!isZooming && (
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '820px',
          margin: '0 auto',
          background: 'rgba(11, 29, 58, 0.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '20px 24px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Discover Smart EV Charging Corridors
              </h2>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Select a network region or detect your live GPS position to explore available chargers.
              </div>
            </div>

            <button
              onClick={handleDetectGPS}
              disabled={isLocating}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                minHeight: '44px'
              }}
            >
              <Navigation size={16} />
              <span>{isLocating ? 'Detecting GPS...' : 'Use My Location'}</span>
            </button>
          </div>

          {/* Quick Hub Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '10px'
          }}>
            {QUICK_HUBS.map((hub) => (
              <button
                key={hub.name}
                onClick={() => handleStartZoom(hub)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '10px 14px',
                  color: '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minHeight: '52px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#10b981';
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{hub.name.split(' ')[0]}</span>
                  <ArrowRight size={13} color="#10b981" />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {hub.name.includes('Hub') ? 'Primary Grid' : 'Fast Corridor'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
