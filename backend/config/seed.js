const Station = require('../models/Station');
const Booking = require('../models/Booking');

const seedData = async () => {
  try {
    // Clear existing data
    await Station.deleteMany({});
    await Booking.deleteMany({});

    console.log('Cleared existing stations and bookings.');

    const stations = [
      // ================= SURAT STATIONS =================
      // --- AHMEDABAD / GUJARAT STATIONS ---
      {
        name: 'Tata Power EZ Charge - SG Highway, Bodakdev',
        location: {
          type: 'Point',
          coordinates: [72.5078, 23.0416] // Bodakdev, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 150,
        pricingPerKwh: 16,
        chargers: [
          { id: 'TP_A1', status: 'free' },
          { id: 'TP_A2', status: 'free' },
          { id: 'TP_A3', status: 'free' },
          { id: 'TP_A4', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Jio-bp Pulse HyperCharge - Prahlad Nagar Hub',
        location: {
          type: 'Point',
          coordinates: [72.5074, 23.0125] // Prahlad Nagar, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS', 'CHAdeMO'],
        chargingSpeedKw: 240,
        pricingPerKwh: 18,
        chargers: [
          { id: 'JB_A1', status: 'free' },
          { id: 'JB_A2', status: 'free' },
          { id: 'JB_A3', status: 'free' },
          { id: 'JB_A4', status: 'free' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Statiq EV Station - Riverfront West, Ashram Road',
        location: {
          type: 'Point',
          coordinates: [72.5714, 23.0300] // Ashram Road, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 120,
        pricingPerKwh: 14,
        chargers: [
          { id: 'ST_A1', status: 'free' },
          { id: 'ST_A2', status: 'free' },
          { id: 'ST_A3', status: 'occupied' }
        ],
        liveQueueLength: 1
      },
      {
        name: 'Zeon Superfast Charging - Sindhu Bhavan Road (SBR)',
        location: {
          type: 'Point',
          coordinates: [72.4965, 23.0440] // SBR, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS'],
        chargingSpeedKw: 240,
        pricingPerKwh: 19,
        chargers: [
          { id: 'ZN_A1', status: 'free' },
          { id: 'ZN_A2', status: 'free' },
          { id: 'ZN_A3', status: 'free' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Shell Recharge - Vastrapur Lake AlphaOne',
        location: {
          type: 'Point',
          coordinates: [72.5280, 23.0350] // Vastrapur, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 60,
        pricingPerKwh: 15,
        chargers: [
          { id: 'SH_A1', status: 'free' },
          { id: 'SH_A2', status: 'free' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Adani Total Gas EV - Airport Circle, Hansol',
        location: {
          type: 'Point',
          coordinates: [72.6280, 23.0730] // Airport Road, Ahmedabad, Gujarat
        },
        connectorTypes: ['CCS', 'CHAdeMO'],
        chargingSpeedKw: 150,
        pricingPerKwh: 16,
        chargers: [
          { id: 'AD_A1', status: 'free' },
          { id: 'AD_A2', status: 'free' },
          { id: 'AD_A3', status: 'free' },
          { id: 'AD_A4', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      // --- SURAT & GUJARAT REGION ---
      {
        name: 'Tata Power EZ Charge - VR Surat Mall',
        location: {
          type: 'Point',
          coordinates: [72.7712, 21.1445] // Dumas Road, Magdalla, Surat
        },
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
        name: 'Jio-bp Pulse Fast Charge - Adajan Junction',
        location: {
          type: 'Point',
          coordinates: [72.7985, 21.1952] // Adajan Gam, Surat
        },
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
        name: 'Zeon Charging Superfast - Vesu VIP Road',
        location: {
          type: 'Point',
          coordinates: [72.7745, 21.1350] // VIP Road, Vesu, Surat
        },
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
        name: 'Statiq EV Station - Ring Road Textile Market',
        location: {
          type: 'Point',
          coordinates: [72.8312, 21.1890] // Ring Road, Surat
        },
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
        name: 'Relux Electric Hub - Surat Railway Station Plaza',
        location: {
          type: 'Point',
          coordinates: [72.8415, 21.2052] // Station Road, Varachha, Surat
        },
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
        name: 'Ather Grid & FastCharge - Ghod Dod Road',
        location: {
          type: 'Point',
          coordinates: [72.8095, 21.1765] // Athwa, Ghod Dod Road, Surat
        },
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
        name: 'Shell Recharge Hub - Piplod Main Road',
        location: {
          type: 'Point',
          coordinates: [72.7820, 21.1530] // Piplod, Surat
        },
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
        name: 'BPCL e-Drive - Hazira Industrial Expressway',
        location: {
          type: 'Point',
          coordinates: [72.6320, 21.1080] // Hazira Port Road, Surat
        },
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
        name: 'EVRE Ultra Charging - Katargam GIDC Hub',
        location: {
          type: 'Point',
          coordinates: [72.8250, 21.2320] // Katargam, Surat
        },
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
        name: 'Tata Power EZ Charge - Sumul Dairy Road, Katargam',
        location: {
          type: 'Point',
          coordinates: [72.8378, 21.2268] // Exact location from Google Maps link
        },
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
        name: 'Jio-bp Pulse HyperCharge - Gotalawadi Industrial Area',
        location: {
          type: 'Point',
          coordinates: [72.8392, 21.2255] // Gotalawadi, Katargam
        },
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
        name: 'Statiq EV Supercharge - Katargam Main Darwaja',
        location: {
          type: 'Point',
          coordinates: [72.8358, 21.2285] // Katargam Main Road
        },
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
        name: 'Zeon Fast Charging - Ved Road Causeway Link',
        location: {
          type: 'Point',
          coordinates: [72.8340, 21.2312] // Ved Road, Surat
        },
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
        name: 'Ather Grid Hub - Gotalawadi Textile Complex',
        location: {
          type: 'Point',
          coordinates: [72.8405, 21.2272] // Gotalawadi, Surat
        },
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
      {
        name: 'Tata Power EZ Charge - Surat International Airport',
        location: {
          type: 'Point',
          coordinates: [72.7420, 21.1150] // Airport Terminal, Dumas, Surat
        },
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
        name: 'ChargeZone Express - Kamrej Highway Rest Stop (NH 48)',
        location: {
          type: 'Point',
          coordinates: [72.9550, 21.2680] // Kamrej NH48 Bypass, Surat
        },
        connectorTypes: ['CCS', 'CHAdeMO'],
        chargingSpeedKw: 240,
        pricingPerKwh: 21,
        chargers: [
          { id: 'KM1', status: 'free' },
          { id: 'KM2', status: 'free' },
          { id: 'KM3', status: 'free' },
          { id: 'KM4', status: 'free' },
          { id: 'KM5', status: 'free' },
          { id: 'KM6', status: 'free' },
          { id: 'KM7', status: 'occupied' },
          { id: 'KM8', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Exicom Fast Hub - Pal RTO / Gaurav Path',
        location: {
          type: 'Point',
          coordinates: [72.7780, 21.2080] // Pal Gaurav Path, Surat
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 50,
        pricingPerKwh: 13,
        chargers: [
          { id: 'PLR1', status: 'free' },
          { id: 'PLR2', status: 'free' },
          { id: 'PLR3', status: 'free' },
          { id: 'PLR4', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Hyundai Ultra Fast Charger - Bhatar City Light',
        location: {
          type: 'Point',
          coordinates: [72.8020, 21.1610] // Bhatar Road, Surat
        },
        connectorTypes: ['CCS'],
        chargingSpeedKw: 180,
        pricingPerKwh: 19,
        chargers: [
          { id: 'BH1', status: 'free' },
          { id: 'BH2', status: 'free' },
          { id: 'BH3', status: 'free' },
          { id: 'BH4', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Magenta ChargeGrid - Althan Canal Walk',
        location: {
          type: 'Point',
          coordinates: [72.8010, 21.1410] // Althan Road, Surat
        },
        connectorTypes: ['Type 2', 'CCS'],
        chargingSpeedKw: 22,
        pricingPerKwh: 10,
        chargers: [
          { id: 'AL1', status: 'free' },
          { id: 'AL2', status: 'free' },
          { id: 'AL3', status: 'free' },
          { id: 'AL4', status: 'free' },
          { id: 'AL5', status: 'free' },
          { id: 'AL6', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Kazam EV Station - Varachha Diamond Hub',
        location: {
          type: 'Point',
          coordinates: [72.8610, 21.2180] // Varachha Main Road, Surat
        },
        connectorTypes: ['CCS', 'CHAdeMO', 'Type 2'],
        chargingSpeedKw: 60,
        pricingPerKwh: 12,
        chargers: [
          { id: 'VD1', status: 'free' },
          { id: 'VD2', status: 'free' },
          { id: 'VD3', status: 'free' },
          { id: 'VD4', status: 'free' },
          { id: 'VD5', status: 'free' },
          { id: 'VD6', status: 'free' },
          { id: 'VD7', status: 'occupied' },
          { id: 'VD8', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Jio-bp Pulse - Dumas Beach Boulevard',
        location: {
          type: 'Point',
          coordinates: [72.7120, 21.0750] // Dumas Beach Road, Surat
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 120,
        pricingPerKwh: 16,
        chargers: [
          { id: 'DM1', status: 'free' },
          { id: 'DM2', status: 'free' },
          { id: 'DM3', status: 'free' },
          { id: 'DM4', status: 'free' }
        ],
        liveQueueLength: 0
      },

      // ================= BANGALORE STATIONS =================
      {
        name: 'Station A (Mall)',
        location: {
          type: 'Point',
          coordinates: [77.5976, 12.9736]
        },
        connectorTypes: ['CCS', 'Type 2'],
        chargingSpeedKw: 50,
        pricingPerKwh: 15,
        chargers: [
          { id: 'A1', status: 'occupied' },
          { id: 'A2', status: 'occupied' }
        ],
        liveQueueLength: 2
      },
      {
        name: 'Station B (Residential Area)',
        location: {
          type: 'Point',
          coordinates: [77.6186, 12.9816]
        },
        connectorTypes: ['CCS', 'CHAdeMO', 'Type 2'],
        chargingSpeedKw: 22,
        pricingPerKwh: 12,
        chargers: [
          { id: 'B1', status: 'free' },
          { id: 'B2', status: 'free' },
          { id: 'B3', status: 'free' },
          { id: 'B4', status: 'free' },
          { id: 'B5', status: 'occupied' },
          { id: 'B6', status: 'occupied' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Station C (Office Park)',
        location: {
          type: 'Point',
          coordinates: [77.5646, 12.9416]
        },
        connectorTypes: ['CCS', 'CHAdeMO'],
        chargingSpeedKw: 150,
        pricingPerKwh: 18,
        chargers: [
          { id: 'C1', status: 'free' },
          { id: 'C2', status: 'free' },
          { id: 'C3', status: 'free' }
        ],
        liveQueueLength: 0
      },
      {
        name: 'Station D (Highway Rest Stop)',
        location: {
          type: 'Point',
          coordinates: [77.4946, 12.9016]
        },
        connectorTypes: ['CCS'],
        chargingSpeedKw: 350,
        pricingPerKwh: 25,
        chargers: [
          { id: 'D1', status: 'free' },
          { id: 'D2', status: 'occupied' },
          { id: 'D3', status: 'occupied' },
          { id: 'D4', status: 'occupied' }
        ],
        liveQueueLength: 1
      }
    ];

    const createdStations = await Station.create(stations);
    console.log(`Seeded ${createdStations.length} stations successfully.`);

    // Seed bookings for Station A
    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const nextHour = new Date(currentHour.getTime() + 60 * 60 * 1000);

    // Find Bangalore Station A and Surat Station S1
    const stationA = createdStations.find(s => s.name === 'Station A (Mall)');
    const stationB = createdStations.find(s => s.name === 'Station B (Residential Area)');

    if (stationA && stationB) {
      const bookings = [
        {
          stationId: stationA._id,
          chargerId: 'A1',
          slotTime: currentHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 300,
          paymentIntentId: 'pi_mock_1',
          userEmail: 'driver1@example.com',
          active: true
        },
        {
          stationId: stationA._id,
          chargerId: 'A1',
          slotTime: nextHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 300,
          paymentIntentId: 'pi_mock_2',
          userEmail: 'driver2@example.com',
          active: true
        },
        {
          stationId: stationA._id,
          chargerId: 'A2',
          slotTime: currentHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 300,
          paymentIntentId: 'pi_mock_3',
          userEmail: 'driver3@example.com',
          active: true
        },
        {
          stationId: stationA._id,
          chargerId: 'A2',
          slotTime: nextHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 300,
          paymentIntentId: 'pi_mock_4',
          userEmail: 'driver4@example.com',
          active: true
        },
        {
          stationId: stationB._id,
          chargerId: 'B5',
          slotTime: currentHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 240,
          paymentIntentId: 'pi_mock_5',
          userEmail: 'driver5@example.com',
          active: true
        },
        {
          stationId: stationB._id,
          chargerId: 'B6',
          slotTime: currentHour,
          status: 'confirmed',
          lockedUntil: new Date(now.getTime() + 30 * 60 * 1000),
          amountPaid: 240,
          paymentIntentId: 'pi_mock_6',
          userEmail: 'driver6@example.com',
          active: true
        }
      ];
      await Booking.create(bookings);
      console.log('Seeded default bookings successfully.');
    }

  } catch (error) {
    console.error('Error seeding database:', error.message);
  }
};

module.exports = seedData;

