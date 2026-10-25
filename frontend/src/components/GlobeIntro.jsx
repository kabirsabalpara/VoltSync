import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { MapPin, Navigation, Compass, ArrowRight, Zap, EyeOff, AlertCircle } from 'lucide-react';
import { getCurrentCoordinates } from '../services/locationService';

// Priority Indian Charging Hubs
const QUICK_HUBS = [
  { id: 'surat', name: 'Surat', fullName: 'Surat (Smart Grid Hub)', tag: 'Primary Grid', lat: 21.1702, lng: 72.8311 },
  { id: 'ahmedabad', name: 'Ahmedabad', fullName: 'Ahmedabad (Expressway)', tag: 'Fast Corridor', lat: 23.0225, lng: 72.5714 },
  { id: 'mumbai', name: 'Mumbai', fullName: 'Mumbai (Metropolitan)', tag: 'Fast Corridor', lat: 19.0760, lng: 72.8777 },
  { id: 'delhi', name: 'Delhi NCR', fullName: 'Delhi NCR (Capital Corridor)', tag: 'Fast Corridor', lat: 28.6139, lng: 77.2090 },
  { id: 'bengaluru', name: 'Bengaluru', fullName: 'Bengaluru (Tech Corridor)', tag: 'Fast Corridor', lat: 12.9716, lng: 77.5946 },
];

// Secondary global reference network points for visual depth
const GLOBAL_HUBS = [
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
];

// Corridor arcs between major Indian charging nodes
const NETWORK_CONNECTIONS = [
  ['surat', 'ahmedabad'],
  ['surat', 'mumbai'],
  ['mumbai', 'bengaluru'],
  ['mumbai', 'delhi'],
];

/**
 * Procedural Earth Texture Generator
 * Creates a high-fidelity dark-mode continental map with subtle oceanic depth,
 * latitude/longitude coordinate grid, and glowing electrical hubs.
 */
function createEarthCanvas() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deep obsidian & navy oceanic base
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#040d1a');
  oceanGrad.addColorStop(0.3, '#07162c');
  oceanGrad.addColorStop(0.5, '#0a1e3b');
  oceanGrad.addColorStop(0.7, '#07162c');
  oceanGrad.addColorStop(1, '#040d1a');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle coordinate grid lines
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.05)';
  ctx.lineWidth = 1;
  for (let lat = 0; lat <= height; lat += height / 18) {
    ctx.beginPath();
    ctx.moveTo(0, lat);
    ctx.lineTo(width, lat);
    ctx.stroke();
  }
  for (let lng = 0; lng <= width; lng += width / 36) {
    ctx.beginPath();
    ctx.moveTo(lng, 0);
    ctx.lineTo(lng, height);
    ctx.stroke();
  }

  // Draw procedural continental landmasses with subtle coastline strokes
  const drawContinent = (points, fill = '#0d253d', stroke = '#183b5e') => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
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

  // Eurasia & North Africa
  drawContinent([
    [0.44, 0.18], [0.55, 0.16], [0.70, 0.18], [0.83, 0.22], [0.87, 0.36],
    [0.80, 0.44], [0.74, 0.46], [0.72, 0.52], [0.66, 0.54], [0.63, 0.45],
    [0.55, 0.40], [0.49, 0.35], [0.44, 0.30]
  ]);

  // India Subcontinent (Elevated dark emerald-navy tone for telemetry focus)
  drawContinent([
    [0.678, 0.370], [0.732, 0.372], [0.745, 0.445], [0.718, 0.540], [0.676, 0.470]
  ], '#12334f', '#10b98155');

  // Africa
  drawContinent([
    [0.47, 0.36], [0.56, 0.38], [0.58, 0.48], [0.55, 0.66], [0.49, 0.75],
    [0.46, 0.62], [0.43, 0.46]
  ]);

  // North America
  drawContinent([
    [0.09, 0.18], [0.22, 0.16], [0.29, 0.24], [0.27, 0.42], [0.20, 0.45],
    [0.13, 0.40], [0.07, 0.30]
  ]);

  // South America
  drawContinent([
    [0.21, 0.48], [0.28, 0.50], [0.32, 0.60], [0.28, 0.80], [0.23, 0.76],
    [0.19, 0.58]
  ]);

  // Australia
  drawContinent([
    [0.81, 0.60], [0.89, 0.60], [0.92, 0.72], [0.84, 0.76], [0.79, 0.68]
  ]);

  // City telemetry pinpoints on map texture
  const cityDots = [
    [0.702, 0.442, true],  // Surat
    [0.701, 0.435, true],  // Ahmedabad
    [0.702, 0.448, true],  // Mumbai
    [0.715, 0.421, true],  // Delhi
    [0.715, 0.464, true],  // Bengaluru
    [0.500, 0.270, false], // London
    [0.240, 0.350, false], // New York
    [0.840, 0.380, false], // Tokyo
    [0.580, 0.420, false], // Dubai
  ];

  cityDots.forEach(([xPct, yPct, isIndia]) => {
    const x = xPct * width;
    const y = yPct * height;
    const radius = isIndia ? 8 : 4;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, isIndia ? 'rgba(16, 185, 129, 0.85)' : 'rgba(56, 189, 248, 0.5)');
    glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isIndia ? '#34d399' : '#bae6fd';
    ctx.beginPath();
    ctx.arc(x, y, isIndia ? 2 : 1, 0, Math.PI * 2);
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

/**
 * Create a curved 3D corridor arc between two coordinates on the globe
 */
function createNetworkArc(startVec, endVec, globeRadius) {
  const distance = startVec.distanceTo(endVec);
  const mid = startVec.clone().add(endVec).multiplyScalar(0.5);
  // Elevate mid-point above globe surface proportional to distance
  const altitude = globeRadius + Math.min(0.35, distance * 0.28);
  mid.normalize().multiplyScalar(altitude);

  const curve = new THREE.QuadraticBezierCurve3(startVec, mid, endVec);
  const points = curve.getPoints(24);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.38,
    linewidth: 1.5,
  });

  return new THREE.Line(geometry, material);
}

export default function GlobeIntro({ onSelectLocation, onSkip }) {
  const containerRef = useRef(null);
  const [selectedHub, setSelectedHub] = useState(QUICK_HUBS[0]);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomStage, setZoomStage] = useState('orbit'); // 'orbit' -> 'descend' -> 'ready'
  const [webGLError, setWebGLError] = useState(false);
  const isTransitioningRef = useRef(false);

  // Check reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReducedMotion) {
      onSelectLocation(QUICK_HUBS[0].lat, QUICK_HUBS[0].lng, QUICK_HUBS[0].name);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      console.warn('WebGL initialization failed, switching to static fallback:', e);
      setWebGLError(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 1.1, 5.6);

    // Cinematic Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambientLight);

    const emeraldKeyLight = new THREE.DirectionalLight(0x10b981, 1.4);
    emeraldKeyLight.position.set(4, 3, 4);
    scene.add(emeraldKeyLight);

    const cyanRimLight = new THREE.DirectionalLight(0x0284c7, 1.1);
    cyanRimLight.position.set(-5, -2, -3);
    scene.add(cyanRimLight);

    // Earth Sphere
    const earthRadius = 2.0;
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthCanvas = createEarthCanvas();
    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthTexture.wrapT = THREE.ClampToEdgeWrapping;

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.62,
      metalness: 0.22,
      emissive: new THREE.Color(0x031810),
      emissiveIntensity: 0.3,
    });

    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);

    // Atmospheric outer soft glow sphere
    const atmosGeometry = new THREE.SphereGeometry(earthRadius * 1.028, 48, 48);
    const atmosMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    });
    const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
    scene.add(atmosMesh);

    // Hub Markers Group
    const markerGroup = new THREE.Group();
    const hubPositions = {};

    // 1. Primary Indian Charging Hubs
    QUICK_HUBS.forEach((hub) => {
      const pos = latLngToVector3(hub.lat, hub.lng, earthRadius * 1.008);
      hubPositions[hub.id] = pos;

      // Solid emerald center dot
      const dotGeo = new THREE.SphereGeometry(0.038, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      markerGroup.add(dot);

      // Outer pulse ring
      const ringGeo = new THREE.RingGeometry(0.048, 0.082, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().multiplyScalar(1.002));
      ring.lookAt(pos.clone().multiplyScalar(2));
      ring.userData = { isPulseRing: true, baseScale: 1.0 };
      markerGroup.add(ring);
    });

    // 2. Subtle Global Nodes
    GLOBAL_HUBS.forEach((hub) => {
      const pos = latLngToVector3(hub.lat, hub.lng, earthRadius * 1.006);
      const dotGeo = new THREE.SphereGeometry(0.022, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      markerGroup.add(dot);
    });

    // 3. Subtle Charging Network Arcs
    NETWORK_CONNECTIONS.forEach(([startId, endId]) => {
      const startVec = hubPositions[startId];
      const endVec = hubPositions[endId];
      if (startVec && endVec) {
        const arc = createNetworkArc(startVec, endVec, earthRadius);
        markerGroup.add(arc);
      }
    });

    earthMesh.add(markerGroup);

    // Initial orientation: Indian subcontinent angled towards viewer
    earthMesh.rotation.y = -Math.PI * 0.45;
    earthMesh.rotation.x = 0.22;

    let animationFrameId;
    let isDisposed = false;
    let targetCameraDistance = 5.6;
    let targetEarthRotationY = earthMesh.rotation.y;
    let targetEarthRotationX = earthMesh.rotation.x;

    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (!isTransitioningRef.current) {
        // Continuous smooth idle rotation
        earthMesh.rotation.y += delta * 0.04;
      } else {
        // Damped interpolation towards targeted corridor
        earthMesh.rotation.y += (targetEarthRotationY - earthMesh.rotation.y) * 0.07;
        earthMesh.rotation.x += (targetEarthRotationX - earthMesh.rotation.x) * 0.07;

        camera.position.z += (targetCameraDistance - camera.position.z) * 0.08;
        camera.position.y += (0.15 - camera.position.y) * 0.08;
      }

      // Beacon ring pulsating animation
      markerGroup.children.forEach((child, i) => {
        if (child.userData?.isPulseRing) {
          const s = 1.0 + Math.sin(elapsed * 3.2 + i * 0.8) * 0.28;
          child.scale.set(s, s, s);
          child.material.opacity = 0.5 + Math.cos(elapsed * 3.2 + i * 0.8) * 0.4;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || isDisposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Zoom controller invoked on city selection or GPS detection
    container._zoomToLocation = (lat, lng, name) => {
      isTransitioningRef.current = true;
      setIsZooming(true);
      setZoomStage('descend');

      const targetPhi = (90 - lat) * (Math.PI / 180);
      const targetTheta = (lng + 180) * (Math.PI / 180);

      targetEarthRotationY = -targetTheta + Math.PI * 1.5;
      targetEarthRotationX = targetPhi - Math.PI * 0.5;

      // Phase 1: Descent glide (0.8s)
      setTimeout(() => {
        if (isDisposed) return;
        targetCameraDistance = 3.4;
        setZoomStage('descend');
      }, 700);

      // Phase 2: Close corridor entry (1.6s)
      setTimeout(() => {
        if (isDisposed) return;
        targetCameraDistance = 2.45;
        setZoomStage('ready');
      }, 1500);

      // Phase 3: Handover to local map (2.3s total)
      setTimeout(() => {
        if (isDisposed) return;
        onSelectLocation(lat, lng, name);
      }, 2300);
    };

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);

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
    setLocationError(null);
    if (containerRef.current?._zoomToLocation) {
      containerRef.current._zoomToLocation(hub.lat, hub.lng, hub.name);
    } else {
      onSelectLocation(hub.lat, hub.lng, hub.name);
    }
  };

  const handleDetectGPS = async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const coords = await getCurrentCoordinates({ enableHighAccuracy: true });
      const gpsHub = {
        id: 'gps',
        name: 'Current Location',
        fullName: `Live Position (${coords.lat.toFixed(2)}°, ${coords.lng.toFixed(2)}°)`,
        lat: coords.lat,
        lng: coords.lng,
        isGps: true
      };
      setSelectedHub(gpsHub);
      if (containerRef.current?._zoomToLocation) {
        containerRef.current._zoomToLocation(coords.lat, coords.lng, 'Live GPS Position');
      } else {
        onSelectLocation(coords.lat, coords.lng, 'Live GPS Position');
      }
    } catch (err) {
      console.warn('Location detection denied or failed:', err);
      setLocationError('Location access was not granted. Select a city instead.');
    } finally {
      setIsLocating(false);
    }
  };

  // Dynamic Loading Message based on selected hub or GPS
  const loadingStatusText = useMemo(() => {
    if (selectedHub?.isGps) {
      return {
        primary: 'Finding Chargers Near You',
        secondary: 'Locating verified fast charging hubs around your position'
      };
    }
    return {
      primary: `Connecting to ${selectedHub?.name || 'Surat'} Charging Network`,
      secondary: 'Finding available fast chargers nearby'
    };
  }, [selectedHub]);

  // Static Fallback Interface if WebGL fails
  if (webGLError) {
    return (
      <div className="globe-fallback-screen" style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #050d1a 0%, #0b1d3a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid #10b981',
          padding: '10px 18px',
          borderRadius: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <Zap size={18} color="#10b981" />
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#10b981' }}>VoltSync Fast Charging Network</span>
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0 0 10px 0' }}>Select Your Charging Region</h1>
        <p style={{ color: '#94a3b8', maxWidth: '460px', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
          Access real-time high-speed EV chargers with guaranteed 5-minute reservation locks and digital FastPass checkout.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxWidth: '520px' }}>
          {QUICK_HUBS.map((hub) => (
            <button
              key={hub.id}
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
      background: 'radial-gradient(ellipse at center, #091a32 0%, #030811 100%)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '20px 24px',
      color: '#ffffff'
    }}>
      {/* Three.js Canvas Container */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* Top Header: Brand & Skip Button */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '1280px',
        margin: '0 auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              VoltSync
            </div>
            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, letterSpacing: '0.2px' }}>
              3D Global Grid Telemetry
            </div>
          </div>
        </div>

        <button
          onClick={onSkip}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#e2e8f0',
            padding: '8px 18px',
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
          title="Skip 3D Earth intro and open charger map"
        >
          <EyeOff size={14} /> Skip Intro
        </button>
      </div>

      {/* Minimal Restrained Hero Message (Upper Third, does NOT block Earth) */}
      {!isZooming && (
        <div style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: '460px',
          margin: '12px auto 0 0',
          padding: '0 12px',
          animation: 'fadeIn 0.5s ease',
          pointerEvents: 'none'
        }}>
          <div style={{
            fontSize: 'clamp(20px, 3.2vw, 28px)',
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: '-0.5px',
            color: '#f8fafc',
            textShadow: '0 2px 10px rgba(0,0,0,0.6)'
          }}>
            From anywhere.<br />
            <span style={{ color: '#34d399' }}>To your next charge.</span>
          </div>
          <div style={{
            fontSize: '13px',
            color: '#94a3b8',
            marginTop: '6px',
            fontWeight: 500,
            textShadow: '0 1px 6px rgba(0,0,0,0.8)'
          }}>
            Discover India's smart EV charging network.
          </div>
        </div>
      )}

      {/* Zoom Flight Telemetry Indicator */}
      {isZooming && (
        <div style={{
          position: 'relative',
          zIndex: 15,
          margin: 'auto',
          textAlign: 'center',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'rgba(9, 26, 50, 0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            padding: '18px 32px',
            borderRadius: '24px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontWeight: 800, fontSize: '15px' }}>
              <Compass size={20} className="spin-animation" />
              <span>{loadingStatusText.primary}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {loadingStatusText.secondary}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Discovery Panel */}
      {!isZooming && (
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '860px',
          margin: '0 auto',
          background: 'rgba(9, 26, 50, 0.90)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '22px',
          padding: '16px 20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)'
        }}>
          {/* Header Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>
                Discover Smart EV Charging Corridors
              </h2>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Select a network corridor or detect your live location to explore high-speed chargers.
              </div>
            </div>

            <button
              onClick={handleDetectGPS}
              disabled={isLocating}
              style={{
                background: isLocating ? '#059669' : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLocating ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <Navigation size={15} />
              <span>{isLocating ? 'Detecting Location...' : 'Use My Location'}</span>
            </button>
          </div>

          {/* Location Access Error Alert (Clean & Informative) */}
          {locationError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '10px',
              padding: '8px 12px',
              marginBottom: '10px',
              fontSize: '12px',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={15} color="#f87171" />
              <span>{locationError}</span>
            </div>
          )}

          {/* City Corridor Grid Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px',
            overflowX: 'auto'
          }}>
            {QUICK_HUBS.map((hub) => {
              const isSelected = selectedHub?.id === hub.id;
              return (
                <button
                  key={hub.id}
                  onClick={() => handleStartZoom(hub)}
                  style={{
                    background: isSelected ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '2px',
                    minHeight: '48px',
                    boxShadow: isSelected ? '0 0 16px rgba(16, 185, 129, 0.25)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.6)';
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    }
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: isSelected ? '#34d399' : '#f8fafc' }}>{hub.name}</span>
                    <ArrowRight size={13} color={isSelected ? '#34d399' : '#94a3b8'} />
                  </div>
                  <div style={{ fontSize: '10px', color: isSelected ? '#a7f3d0' : '#94a3b8' }}>
                    {hub.tag}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

