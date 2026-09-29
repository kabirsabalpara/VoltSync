/**
 * VoltSync Station Dataset & Client-Side Fallback Engine
 * Ensures 100% resilient station discovery on localhost, Vercel, or offline.
 */

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const RAW_STATIONS_DATA = [
  // --- KATARGAM / SUMUL DAIRY / VED ROAD / GOTALAWADI (User Maps Link) ---
  {
    _id: 'st_kat_1',
    name: 'Tata Power EZ Charge - Sumul Dairy Road, Katargam',
    location: { type: 'Point', coordinates: [72.8378, 21.2268] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'SM1', status: 'free' },
      { id: 'SM2', status: 'free' },
      { id: 'SM3', status: 'free' },
      { id: 'SM4', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_kat_2',
    name: 'EVRE Ultra Charging - Katargam GIDC Hub',
    location: { type: 'Point', coordinates: [72.8250, 21.2320] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'KG1', status: 'free' },
      { id: 'KG2', status: 'free' },
      { id: 'KG3', status: 'free' },
      { id: 'KG4', status: 'free' },
      { id: 'KG5', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_kat_3',
    name: 'Statiq EV Supercharge - Katargam Main Darwaja',
    location: { type: 'Point', coordinates: [72.8358, 21.2285] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'KD1', status: 'free' },
      { id: 'KD2', status: 'free' },
      { id: 'KD3', status: 'free' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_kat_4',
    name: 'Zeon Fast Charging - Ved Road Causeway Link',
    location: { type: 'Point', coordinates: [72.8340, 21.2312] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'VRD1', status: 'free' },
      { id: 'VRD2', status: 'free' },
      { id: 'VRD3', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_kat_5',
    name: 'Jio-bp Pulse HyperCharge - Gotalawadi Industrial Area',
    location: { type: 'Point', coordinates: [72.8392, 21.2255] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 240,
    pricingPerKwh: 19,
    chargers: [
      { id: 'GT1', status: 'free' },
      { id: 'GT2', status: 'free' },
      { id: 'GT3', status: 'free' },
      { id: 'GT4', status: 'free' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_kat_6',
    name: 'Ather Grid Hub - Gotalawadi Textile Complex',
    location: { type: 'Point', coordinates: [72.8405, 21.2272] },
    connectorTypes: ['Type 2', 'CCS'],
    chargingSpeedKw: 22,
    pricingPerKwh: 11,
    chargers: [
      { id: 'AG1', status: 'free' },
      { id: 'AG2', status: 'free' },
      { id: 'AG3', status: 'free' }
    ],
    liveQueueLength: 0
  },

  // --- SURAT CITY HUBS ---
  {
    _id: 'st_sur_1',
    name: 'Relux Electric Hub - Surat Railway Station Plaza',
    location: { type: 'Point', coordinates: [72.8415, 21.2052] },
    connectorTypes: ['CCS', 'CHAdeMO', 'Type 2'],
    chargingSpeedKw: 50,
    pricingPerKwh: 13,
    chargers: [
      { id: 'ST1', status: 'free' },
      { id: 'ST2', status: 'free' },
      { id: 'ST3', status: 'free' },
      { id: 'ST4', status: 'free' },
      { id: 'ST5', status: 'free' },
      { id: 'ST6', status: 'free' },
      { id: 'ST7', status: 'free' },
      { id: 'ST8', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_2',
    name: 'Jio-bp Pulse Fast Charge - Adajan Junction',
    location: { type: 'Point', coordinates: [72.7985, 21.1952] },
    connectorTypes: ['CCS', 'CHAdeMO', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'AD1', status: 'free' },
      { id: 'AD2', status: 'free' },
      { id: 'AD3', status: 'free' },
      { id: 'AD4', status: 'free' },
      { id: 'AD5', status: 'free' },
      { id: 'AD6', status: 'free' },
      { id: 'AD7', status: 'occupied' },
      { id: 'AD8', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_3',
    name: 'Statiq EV Station - Ring Road Textile Market',
    location: { type: 'Point', coordinates: [72.8312, 21.1890] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'RR1', status: 'free' },
      { id: 'RR2', status: 'free' },
      { id: 'RR3', status: 'free' },
      { id: 'RR4', status: 'free' },
      { id: 'RR5', status: 'occupied' },
      { id: 'RR6', status: 'occupied' }
    ],
    liveQueueLength: 1
  },
  {
    _id: 'st_sur_4',
    name: 'Tata Power EZ Charge - VR Surat Mall',
    location: { type: 'Point', coordinates: [72.7712, 21.1445] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'VR1', status: 'free' },
      { id: 'VR2', status: 'free' },
      { id: 'VR3', status: 'free' },
      { id: 'VR4', status: 'free' },
      { id: 'VR5', status: 'occupied' },
      { id: 'VR6', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_5',
    name: 'Zeon Charging Superfast - Vesu VIP Road',
    location: { type: 'Point', coordinates: [72.7745, 21.1350] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 240,
    pricingPerKwh: 20,
    chargers: [
      { id: 'VS1', status: 'free' },
      { id: 'VS2', status: 'free' },
      { id: 'VS3', status: 'free' },
      { id: 'VS4', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_6',
    name: 'Ather Grid & FastCharge - Ghod Dod Road',
    location: { type: 'Point', coordinates: [72.8095, 21.1765] },
    connectorTypes: ['Type 2', 'CCS'],
    chargingSpeedKw: 22,
    pricingPerKwh: 11,
    chargers: [
      { id: 'GD1', status: 'free' },
      { id: 'GD2', status: 'free' },
      { id: 'GD3', status: 'free' },
      { id: 'GD4', status: 'free' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_7',
    name: 'Shell Recharge Hub - Piplod Main Road',
    location: { type: 'Point', coordinates: [72.7820, 21.1530] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'PL1', status: 'free' },
      { id: 'PL2', status: 'free' },
      { id: 'PL3', status: 'free' },
      { id: 'PL4', status: 'free' },
      { id: 'PL5', status: 'free' },
      { id: 'PL6', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_8',
    name: 'Kazam EV Station - Varachha Diamond Hub',
    location: { type: 'Point', coordinates: [72.8610, 21.2180] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'VR1', status: 'free' },
      { id: 'VR2', status: 'free' },
      { id: 'VR3', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_9',
    name: 'Exicom Fast Hub - Pal RTO / Gaurav Path',
    location: { type: 'Point', coordinates: [72.7780, 21.2080] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'PL1', status: 'free' },
      { id: 'PL2', status: 'free' },
      { id: 'PL3', status: 'free' },
      { id: 'PL4', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_10',
    name: 'Tata Power EZ Charge - Surat International Airport',
    location: { type: 'Point', coordinates: [72.7420, 21.1150] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 17,
    chargers: [
      { id: 'AP1', status: 'free' },
      { id: 'AP2', status: 'free' },
      { id: 'AP3', status: 'free' },
      { id: 'AP4', status: 'free' },
      { id: 'AP5', status: 'occupied' },
      { id: 'AP6', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_11',
    name: 'BPCL e-Drive - Hazira Industrial Expressway',
    location: { type: 'Point', coordinates: [72.6320, 21.1080] },
    connectorTypes: ['CCS'],
    chargingSpeedKw: 350,
    pricingPerKwh: 22,
    chargers: [
      { id: 'HZ1', status: 'free' },
      { id: 'HZ2', status: 'free' },
      { id: 'HZ3', status: 'occupied' },
      { id: 'HZ4', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_sur_12',
    name: 'ChargeZone Express - Kamrej Highway Rest Stop (NH 48)',
    location: { type: 'Point', coordinates: [72.9550, 21.2680] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 240,
    pricingPerKwh: 21,
    chargers: [
      { id: 'KM1', status: 'free' },
      { id: 'KM2', status: 'free' },
      { id: 'KM3', status: 'free' },
      { id: 'KM4', status: 'free' }
    ],
    liveQueueLength: 0
  },

  // --- BANGALORE CORRIDOR (Fallback reference) ---
  {
    _id: 'st_blr_1',
    name: 'Station A (Mall of Asia)',
    location: { type: 'Point', coordinates: [77.5976, 12.9736] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 15,
    chargers: [
      { id: 'A1', status: 'free' },
      { id: 'A2', status: 'free' },
      { id: 'A3', status: 'occupied' }
    ],
    liveQueueLength: 0
  },
  {
    _id: 'st_blr_2',
    name: 'Station B (Indiranagar Residential)',
    location: { type: 'Point', coordinates: [77.6186, 12.9816] },
    connectorTypes: ['Type 2', 'CHAdeMO'],
    chargingSpeedKw: 50,
    pricingPerKwh: 12,
    chargers: [
      { id: 'B1', status: 'free' },
      { id: 'B2', status: 'free' }
    ],
    liveQueueLength: 0
  }
];

/**
 * Filter and sort stations locally based on user coordinates and options.
 */
export const getProcessedFallbackStations = ({
  userLat = 21.1702,
  userLng = 72.8311,
  radius = '15',
  connectorType = '',
  speedMin = '',
  priceMax = '',
  sortBy = 'distance'
} = {}) => {
  const uLat = Number(userLat);
  const uLng = Number(userLng);
  const maxRadiusKm = radius === 'all' ? 100 : Number(radius) || 15;

  let processed = RAW_STATIONS_DATA.map((station) => {
    const sLat = station.location.coordinates[1];
    const sLng = station.location.coordinates[0];
    const dist = calculateDistance(uLat, uLng, sLat, sLng);
    const drivingMinutes = Math.max(1, Math.round((dist / 25) * 60));
    const realTimeFreeCount = station.chargers.filter((c) => c.status === 'free').length;
    const totalChargers = station.chargers.length;
    const isHighDemand = realTimeFreeCount <= 1;

    return {
      ...station,
      distance: Number(dist.toFixed(2)),
      drivingMinutes,
      realTimeFreeCount,
      totalChargers,
      isHighDemand,
      slotAvailableChargers: realTimeFreeCount,
      slotOccupiedCount: totalChargers - realTimeFreeCount
    };
  });

  // Apply filters
  if (connectorType) {
    processed = processed.filter((s) => s.connectorTypes.includes(connectorType));
  }
  if (speedMin) {
    processed = processed.filter((s) => s.chargingSpeedKw >= Number(speedMin));
  }
  if (priceMax) {
    processed = processed.filter((s) => s.pricingPerKwh <= Number(priceMax));
  }

  // Sort by distance first
  processed.sort((a, b) => a.distance - b.distance);

  // Filter within radius, with guaranteed minimum 4 closest stations so screen is never blank
  const withinRadius = processed.filter((s) => s.distance <= maxRadiusKm);
  let result = withinRadius.length >= 3 ? withinRadius : processed.slice(0, 8);

  // Sorting
  if (sortBy === 'price') {
    result.sort((a, b) => a.pricingPerKwh - b.pricingPerKwh);
  } else if (sortBy === 'availability') {
    result.sort((a, b) => b.realTimeFreeCount - a.realTimeFreeCount);
  } else {
    result.sort((a, b) => a.distance - b.distance);
  }

  return result;
};
