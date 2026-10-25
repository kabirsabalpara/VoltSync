/**
 * VoltSync Safe Station Expansion Script
 * Adds EV charging stations to existing supported cities:
 * - Ahmedabad (~19 new, reaching ~25 total)
 * - Mumbai (~30 new, reaching ~30 total)
 * - Delhi/NCR (~30 new, reaching ~30 total)
 * - Bengaluru (~26 new, reaching ~30 total)
 * 
 * Rules:
 * - ADD-ONLY (No deletes, drops, or modifications to existing records)
 * - IDEMPOTENT (Checks for existence by name and coordinates before inserting)
 * - Uses existing valid Operator ID from MongoDB
 * - Conforms strictly to existing Station Mongoose schema
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Station = require('../models/Station');
const User = require('../models/User');

const candidateStations = [
  // =========================================================================
  // AHMEDABAD (19 NEW STATIONS)
  // =========================================================================
  {
    name: 'VoltSync FastCharge – Satellite Prernatirth',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5271, 23.0285] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'AHM_SAT_1', status: 'free' },
      { id: 'AHM_SAT_2', status: 'free' },
      { id: 'AHM_SAT_3', status: 'occupied' },
      { id: 'AHM_SAT_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Charge – Thaltej Cross Road',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5042, 23.0531] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'AHM_THL_1', status: 'free' },
      { id: 'AHM_THL_2', status: 'free' },
      { id: 'AHM_THL_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Navrangpura Commerce Six',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5564, 23.0372] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'AHM_NAV_1', status: 'free' },
      { id: 'AHM_NAV_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Charge Hub – South Bopal Ring Road',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.4665, 23.0182] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 14,
    chargers: [
      { id: 'AHM_BOP_1', status: 'free' },
      { id: 'AHM_BOP_2', status: 'free' },
      { id: 'AHM_BOP_3', status: 'free' },
      { id: 'AHM_BOP_4', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Gota SG Highway Junction',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5362, 23.1094] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'AHM_GOT_1', status: 'free' },
      { id: 'AHM_GOT_2', status: 'free' },
      { id: 'AHM_GOT_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Hub – Science City Circle',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5015, 23.0812] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'AHM_SCI_1', status: 'free' },
      { id: 'AHM_SCI_2', status: 'free' },
      { id: 'AHM_SCI_3', status: 'free' },
      { id: 'AHM_SCI_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync PowerHub – Chandkheda Zundal Circle',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5852, 23.1115] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'AHM_CHK_1', status: 'free' },
      { id: 'AHM_CHK_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Motera Stadium Plaza',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5974, 23.0921] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'AHM_MOT_1', status: 'free' },
      { id: 'AHM_MOT_2', status: 'free' },
      { id: 'AHM_MOT_3', status: 'occupied' },
      { id: 'AHM_MOT_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Charge Station – Maninagar Kankaria Gate',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.6072, 22.9984] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'AHM_MAN_1', status: 'free' },
      { id: 'AHM_MAN_2', status: 'free' },
      { id: 'AHM_MAN_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Grid – Naroda GIDC Gateway',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.6582, 23.0685] },
    connectorTypes: ['CCS'],
    chargingSpeedKw: 90,
    pricingPerKwh: 14,
    chargers: [
      { id: 'AHM_NAR_1', status: 'free' },
      { id: 'AHM_NAR_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Nikol Ring Road Galleria',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.6684, 23.0421] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'AHM_NIK_1', status: 'free' },
      { id: 'AHM_NIK_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Vastral Metro Interchange',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.6561, 23.0014] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 50,
    pricingPerKwh: 12,
    chargers: [
      { id: 'AHM_VAS_1', status: 'free' },
      { id: 'AHM_VAS_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Corridor Hub – Sarkhej Highway Sanand Cross',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.4982, 22.9854] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'AHM_SKH_1', status: 'free' },
      { id: 'AHM_SKH_2', status: 'free' },
      { id: 'AHM_SKH_3', status: 'maintenance' }
    ]
  },
  {
    name: 'VoltSync TurboCharge – Bopal Ambli BRTS Link',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.4824, 23.0315] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'AHM_AMB_1', status: 'free' },
      { id: 'AHM_AMB_2', status: 'free' },
      { id: 'AHM_AMB_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Station – Ellisbridge Paldi Center',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5621, 23.0165] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'AHM_PAL_1', status: 'free' },
      { id: 'AHM_PAL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Shahibaug Circuit House',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5954, 23.0562] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'AHM_SHB_1', status: 'free' },
      { id: 'AHM_SHB_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync PowerCharge – Iscon Mega Mall SG Highway',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5124, 23.0298] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'AHM_ISC_1', status: 'free' },
      { id: 'AHM_ISC_2', status: 'free' },
      { id: 'AHM_ISC_3', status: 'free' },
      { id: 'AHM_ISC_4', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync Express Point – C.G. Road Panchvati',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.5542, 23.0241] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 50,
    pricingPerKwh: 14,
    chargers: [
      { id: 'AHM_CGR_1', status: 'free' },
      { id: 'AHM_CGR_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Airport Terminal Fast Hub',
    city: 'Ahmedabad',
    location: { type: 'Point', coordinates: [72.6315, 23.0768] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'AHM_APT_1', status: 'free' },
      { id: 'AHM_APT_2', status: 'free' },
      { id: 'AHM_APT_3', status: 'free' },
      { id: 'AHM_APT_4', status: 'free' }
    ]
  },

  // =========================================================================
  // MUMBAI / NAVI MUMBAI / THANE (30 STATIONS)
  // =========================================================================
  {
    name: 'VoltSync FastCharge – BKC G-Block Financial Hub',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8682, 19.0664] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'MUM_BKC_1', status: 'free' },
      { id: 'MUM_BKC_2', status: 'free' },
      { id: 'MUM_BKC_3', status: 'occupied' },
      { id: 'MUM_BKC_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Bandra West Carter Road',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8335, 19.0552] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_BAN_1', status: 'free' },
      { id: 'MUM_BAN_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Bandra Kurla Link Diamond Bourse',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8621, 19.0618] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 17,
    chargers: [
      { id: 'MUM_BDB_1', status: 'free' },
      { id: 'MUM_BDB_2', status: 'free' },
      { id: 'MUM_BDB_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Andheri East MIDC Central',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8694, 19.1192] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'MUM_ADE_1', status: 'free' },
      { id: 'MUM_ADE_2', status: 'free' },
      { id: 'MUM_ADE_3', status: 'free' },
      { id: 'MUM_ADE_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Hub – Andheri West Lokhandwala Market',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8272, 19.1364] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_ADW_1', status: 'free' },
      { id: 'MUM_ADW_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Charge Hub – Powai Hiranandani Galleria',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9081, 19.1172] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_POW_1', status: 'free' },
      { id: 'MUM_POW_2', status: 'free' },
      { id: 'MUM_POW_3', status: 'occupied' },
      { id: 'MUM_POW_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Goregaon East Oberoi Mall Link',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8661, 19.1672] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_GOR_1', status: 'free' },
      { id: 'MUM_GOR_2', status: 'free' },
      { id: 'MUM_GOR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Hub – Malad West Link Road Inorbit',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8354, 19.1831] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_MAL_1', status: 'free' },
      { id: 'MUM_MAL_2', status: 'free' },
      { id: 'MUM_MAL_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Kandivali East Thakur Village',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8712, 19.2065] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_KAN_1', status: 'free' },
      { id: 'MUM_KAN_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Borivali West Shimpoli Road',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8481, 19.2312] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_BOR_1', status: 'free' },
      { id: 'MUM_BOR_2', status: 'free' },
      { id: 'MUM_BOR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Worli Sea Face Atria Hub',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8184, 19.0062] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'MUM_WOR_1', status: 'free' },
      { id: 'MUM_WOR_2', status: 'free' },
      { id: 'MUM_WOR_3', status: 'free' },
      { id: 'MUM_WOR_4', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync EV Hub – Lower Parel Phoenix Palladium',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8291, 18.9951] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 17,
    chargers: [
      { id: 'MUM_LWP_1', status: 'free' },
      { id: 'MUM_LWP_2', status: 'free' },
      { id: 'MUM_LWP_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Nariman Point Express Towers',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8242, 18.9281] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_NPT_1', status: 'free' },
      { id: 'MUM_NPT_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Dadar Shivaji Park Plaza',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8315, 19.0174] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_DAD_1', status: 'free' },
      { id: 'MUM_DAD_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Charge Hub – Chembur Diamond Garden',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8992, 19.0541] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_CHM_1', status: 'free' },
      { id: 'MUM_CHM_2', status: 'free' },
      { id: 'MUM_CHM_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync TurboCharge – Ghatkopar R-City Mall West',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9165, 19.0882] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_GHT_1', status: 'free' },
      { id: 'MUM_GHT_2', status: 'free' },
      { id: 'MUM_GHT_3', status: 'free' },
      { id: 'MUM_GHT_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Mulund West LBS Marg',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9461, 19.1735] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_MUL_1', status: 'free' },
      { id: 'MUM_MUL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Thane Viviana Mall Hub',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9734, 19.2091] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_THN_1', status: 'free' },
      { id: 'MUM_THN_2', status: 'free' },
      { id: 'MUM_THN_3', status: 'occupied' },
      { id: 'MUM_THN_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Corridor Hub – Thane Ghodbunder Highway Point',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9421, 19.2612] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_GBR_1', status: 'free' },
      { id: 'MUM_GBR_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Vashi Sector 17 Plaza',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9982, 19.0764] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_VAS_1', status: 'free' },
      { id: 'MUM_VAS_2', status: 'free' },
      { id: 'MUM_VAS_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Nerul Palm Beach Galleria',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [73.0181, 19.0332] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_NER_1', status: 'free' },
      { id: 'MUM_NER_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – CBD Belapur Station Complex',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [73.0415, 19.0185] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_BEL_1', status: 'free' },
      { id: 'MUM_BEL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Kharghar Central Park Link',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [73.0682, 19.0435] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'MUM_KHG_1', status: 'free' },
      { id: 'MUM_KHG_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Airport Terminal T2 Express Hub',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8742, 19.0965] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'MUM_AP2_1', status: 'free' },
      { id: 'MUM_AP2_2', status: 'free' },
      { id: 'MUM_AP2_3', status: 'free' },
      { id: 'MUM_AP2_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Domestic Airport T1 Fast Station',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8541, 19.0912] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 17,
    chargers: [
      { id: 'MUM_AP1_1', status: 'free' },
      { id: 'MUM_AP1_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Santacruz Kalina University Road',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8634, 19.0772] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_KAL_1', status: 'free' },
      { id: 'MUM_KAL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync TurboCharge – Kurla Phoenix Marketcity',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8895, 19.0864] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_KUR_1', status: 'free' },
      { id: 'MUM_KUR_2', status: 'free' },
      { id: 'MUM_KUR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync PowerCharge – Vikhroli Godrej One Complex',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.9292, 19.1291] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'MUM_VIK_1', status: 'free' },
      { id: 'MUM_VIK_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Highway Gate – Dahisar Western Express Toll Plaza',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8715, 19.2554] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'MUM_DAH_1', status: 'free' },
      { id: 'MUM_DAH_2', status: 'free' },
      { id: 'MUM_DAH_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Central Hub – Wadala Truck Terminal Monorail',
    city: 'Mumbai',
    location: { type: 'Point', coordinates: [72.8791, 19.0294] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'MUM_WAD_1', status: 'free' },
      { id: 'MUM_WAD_2', status: 'free' }
    ]
  },

  // =========================================================================
  // DELHI / NCR (30 STATIONS)
  // =========================================================================
  {
    name: 'VoltSync FastCharge – Connaught Place Inner Circle',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2195, 28.6328] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'DEL_CP_1', status: 'free' },
      { id: 'DEL_CP_2', status: 'free' },
      { id: 'DEL_CP_3', status: 'occupied' },
      { id: 'DEL_CP_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Dwarka Sector 21 Metro Interchange',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0584, 28.5521] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'DEL_DW21_1', status: 'free' },
      { id: 'DEL_DW21_2', status: 'free' },
      { id: 'DEL_DW21_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Dwarka Sector 10 District Centre',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0562, 28.5814] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'DEL_DW10_1', status: 'free' },
      { id: 'DEL_DW10_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Rohini Sector 10 City Centre',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1142, 28.7152] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 14,
    chargers: [
      { id: 'DEL_ROH1_1', status: 'free' },
      { id: 'DEL_ROH1_2', status: 'free' },
      { id: 'DEL_ROH1_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Rohini Sector 18 West Hub',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1351, 28.7394] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'DEL_ROH2_1', status: 'free' },
      { id: 'DEL_ROH2_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Saket Select Citywalk Mall',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2191, 28.5284] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'DEL_SAK_1', status: 'free' },
      { id: 'DEL_SAK_2', status: 'free' },
      { id: 'DEL_SAK_3', status: 'occupied' },
      { id: 'DEL_SAK_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Hub – Vasant Kunj Promenade Galleria',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1554, 28.5412] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'DEL_VK_1', status: 'free' },
      { id: 'DEL_VK_2', status: 'free' },
      { id: 'DEL_VK_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync SuperCharge – Aerocity Worldmark Plaza',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1215, 28.5518] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'DEL_AER_1', status: 'free' },
      { id: 'DEL_AER_2', status: 'free' },
      { id: 'DEL_AER_3', status: 'free' },
      { id: 'DEL_AER_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Janakpuri District Centre West',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0815, 28.6294] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'DEL_JAN_1', status: 'free' },
      { id: 'DEL_JAN_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Lajpat Nagar Central Market Ring',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2412, 28.5691] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'DEL_LAJ_1', status: 'free' },
      { id: 'DEL_LAJ_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Greater Kailash II M-Block',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2425, 28.5354] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'DEL_GK2_1', status: 'free' },
      { id: 'DEL_GK2_2', status: 'free' },
      { id: 'DEL_GK2_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Nehru Place IT Business Hub',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2515, 28.5492] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'DEL_NEH_1', status: 'free' },
      { id: 'DEL_NEH_2', status: 'free' },
      { id: 'DEL_NEH_3', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync EV Station – Hauz Khas IIT Flyover Link',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1992, 28.5471] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'DEL_HK_1', status: 'free' },
      { id: 'DEL_HK_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Karol Bagh Pusa Road Corner',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1895, 28.6524] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'DEL_KB_1', status: 'free' },
      { id: 'DEL_KB_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Noida Sector 18 Mall of India',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3241, 28.5672] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'NOI_S18_1', status: 'free' },
      { id: 'NOI_S18_2', status: 'free' },
      { id: 'NOI_S18_3', status: 'free' },
      { id: 'NOI_S18_4', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Noida Sector 62 Electronic City',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3642, 28.6275] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 14,
    chargers: [
      { id: 'NOI_S62_1', status: 'free' },
      { id: 'NOI_S62_2', status: 'free' },
      { id: 'NOI_S62_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Corridor Hub – Noida Sector 137 Expressway',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.4045, 28.5081] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 15,
    chargers: [
      { id: 'NOI_S137_1', status: 'free' },
      { id: 'NOI_S137_2', status: 'free' },
      { id: 'NOI_S137_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Noida Sector 76 Amrapali Silicon',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3821, 28.5684] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'NOI_S76_1', status: 'free' },
      { id: 'NOI_S76_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Greater Noida Pari Chowk',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.5034, 28.4671] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'GNO_PC_1', status: 'free' },
      { id: 'GNO_PC_2', status: 'free' },
      { id: 'GNO_PC_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync PowerCharge – Greater Noida Knowledge Park III',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.4912, 28.4795] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 14,
    chargers: [
      { id: 'GNO_KP_1', status: 'free' },
      { id: 'GNO_KP_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Gurugram Cyber City DLF Phase 2',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0892, 28.4951] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 18,
    chargers: [
      { id: 'GUR_CYB_1', status: 'free' },
      { id: 'GUR_CYB_2', status: 'free' },
      { id: 'GUR_CYB_3', status: 'occupied' },
      { id: 'GUR_CYB_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Gurugram Golf Course Road Horizon',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.1025, 28.4614] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 17,
    chargers: [
      { id: 'GUR_GCR_1', status: 'free' },
      { id: 'GUR_GCR_2', status: 'free' },
      { id: 'GUR_GCR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Gurugram Golf Course Extension Rd',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0851, 28.4124] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'GUR_GCX_1', status: 'free' },
      { id: 'GUR_GCX_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Corridor Hub – Gurugram Sohna Road Subhash Chowk',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0394, 28.4312] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'GUR_SOH_1', status: 'free' },
      { id: 'GUR_SOH_2', status: 'free' },
      { id: 'GUR_SOH_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Hub – Gurugram MG Road Metro Mall',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0814, 28.4815] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 16,
    chargers: [
      { id: 'GUR_MGR_1', status: 'free' },
      { id: 'GUR_MGR_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Station – Gurugram Sector 29 Leisure Valley',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.0635, 28.4682] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'GUR_S29_1', status: 'free' },
      { id: 'GUR_S29_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Faridabad Sector 16 Magpie Hub',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3195, 28.4112] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'FAR_S16_1', status: 'free' },
      { id: 'FAR_S16_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Ghaziabad Indirapuram Habitat Center',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3714, 28.6442] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'GHA_IND_1', status: 'free' },
      { id: 'GHA_IND_2', status: 'free' },
      { id: 'GHA_IND_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Ghaziabad Vaishali Metro Sector 4',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.3392, 28.6471] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'GHA_VAI_1', status: 'free' },
      { id: 'GHA_VAI_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Heritage Grid – Chandni Chowk Town Hall Hub',
    city: 'Delhi',
    location: { type: 'Point', coordinates: [77.2312, 28.6564] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 50,
    pricingPerKwh: 14,
    chargers: [
      { id: 'DEL_CC_1', status: 'free' },
      { id: 'DEL_CC_2', status: 'free' }
    ]
  },

  // =========================================================================
  // BENGALURU (26 NEW STATIONS)
  // =========================================================================
  {
    name: 'VoltSync HyperCharge – Whitefield ITPL Tech Park Main',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.7495, 12.9864] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'BLR_WHT_1', status: 'free' },
      { id: 'BLR_WHT_2', status: 'free' },
      { id: 'BLR_WHT_3', status: 'occupied' },
      { id: 'BLR_WHT_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Whitefield EPIP Zone Export Park',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.7281, 12.9782] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_EPIP_1', status: 'free' },
      { id: 'BLR_EPIP_2', status: 'free' },
      { id: 'BLR_EPIP_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Electronic City Phase 1 Infosys Gate',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6685, 12.8452] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_EC1_1', status: 'free' },
      { id: 'BLR_EC1_2', status: 'free' },
      { id: 'BLR_EC1_3', status: 'free' },
      { id: 'BLR_EC1_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Electronic City Phase 2 Tech Hub',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6854, 12.8385] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_EC2_1', status: 'free' },
      { id: 'BLR_EC2_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Koramangala 5th Block Jyoti Nivas',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6214, 12.9351] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_KOR5_1', status: 'free' },
      { id: 'BLR_KOR5_2', status: 'free' },
      { id: 'BLR_KOR5_3', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Koramangala 7th Block Forum Link',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6145, 12.9324] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_KOR7_1', status: 'free' },
      { id: 'BLR_KOR7_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync EV Hub – Indiranagar 100ft Road Lifestyle Hub',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6412, 12.9715] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_IND1_1', status: 'free' },
      { id: 'BLR_IND1_2', status: 'free' },
      { id: 'BLR_IND1_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Indiranagar 12th Main Metro Point',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6445, 12.9664] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_IND2_1', status: 'free' },
      { id: 'BLR_IND2_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync TurboCharge – HSR Layout Sector 1 27th Main',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6515, 12.9124] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_HSR1_1', status: 'free' },
      { id: 'BLR_HSR1_2', status: 'free' },
      { id: 'BLR_HSR1_3', status: 'occupied' }
    ]
  },
  {
    name: 'VoltSync FastCharge – HSR Layout Sector 4 BDA Complex',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6385, 12.9085] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_HSR4_1', status: 'free' },
      { id: 'BLR_HSR4_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Corridor Hub – Marathahalli Outer Ring Bridge',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.7015, 12.9554] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_MAR_1', status: 'free' },
      { id: 'BLR_MAR_2', status: 'free' },
      { id: 'BLR_MAR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync HyperCharge – Bellandur EcoSpace Tech Corridor',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6845, 12.9261] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'BLR_BEL_1', status: 'free' },
      { id: 'BLR_BEL_2', status: 'free' },
      { id: 'BLR_BEL_3', status: 'free' },
      { id: 'BLR_BEL_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Sarjapur Road Wipro Corporate Gate',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6895, 12.9094] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_SAR_1', status: 'free' },
      { id: 'BLR_SAR_2', status: 'free' },
      { id: 'BLR_SAR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Highway Hub – Hebbal Flyover Esteem Plaza',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5924, 13.0355] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_HEB_1', status: 'free' },
      { id: 'BLR_HEB_2', status: 'free' },
      { id: 'BLR_HEB_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Yelahanka New Town NES Complex',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5965, 13.1014] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'BLR_YEL_1', status: 'free' },
      { id: 'BLR_YEL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Jayanagar 4th Block Shopping Complex',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5834, 12.9295] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_JAY_1', status: 'free' },
      { id: 'BLR_JAY_2', status: 'free' },
      { id: 'BLR_JAY_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – JP Nagar Phase 2 Ring Road',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5885, 12.9092] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_JPN_1', status: 'free' },
      { id: 'BLR_JPN_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – Bannerghatta Road Meenakshi Mall',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5975, 12.8785] },
    connectorTypes: ['CCS', 'CHAdeMO'],
    chargingSpeedKw: 120,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_BGR_1', status: 'free' },
      { id: 'BLR_BGR_2', status: 'free' },
      { id: 'BLR_BGR_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Central Hub – MG Road Metro Boulevard',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6085, 12.9745] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_MGR_1', status: 'free' },
      { id: 'BLR_MGR_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Express Point – KR Puram Hanging Bridge Link',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.7042, 13.0075] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 13,
    chargers: [
      { id: 'BLR_KRP_1', status: 'free' },
      { id: 'BLR_KRP_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync Airport Corridor – KIA Devanahalli Trumpet Hub',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.7125, 13.1994] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 17,
    chargers: [
      { id: 'BLR_APT_1', status: 'free' },
      { id: 'BLR_APT_2', status: 'free' },
      { id: 'BLR_APT_3', status: 'free' },
      { id: 'BLR_APT_4', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – Rajajinagar Brigade Gateway / Orion',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5552, 13.0115] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 90,
    pricingPerKwh: 15,
    chargers: [
      { id: 'BLR_RAJ_1', status: 'free' },
      { id: 'BLR_RAJ_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync FastCharge – Malleshwaram 8th Cross Margosa',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.5714, 13.0034] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_MAL_1', status: 'free' },
      { id: 'BLR_MAL_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync UrbanCharge – BTM Layout 2nd Stage Ring Road',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6082, 12.9142] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 60,
    pricingPerKwh: 14,
    chargers: [
      { id: 'BLR_BTM_1', status: 'free' },
      { id: 'BLR_BTM_2', status: 'free' }
    ]
  },
  {
    name: 'VoltSync TurboCharge – Mahadevapura Phoenix Marketcity Hub',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6975, 12.9962] },
    connectorTypes: ['CCS', 'Type 2', 'CHAdeMO'],
    chargingSpeedKw: 150,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_MHD_1', status: 'free' },
      { id: 'BLR_MHD_2', status: 'free' },
      { id: 'BLR_MHD_3', status: 'free' }
    ]
  },
  {
    name: 'VoltSync PowerCharge – Manyata Tech Park Outer Ring',
    city: 'Bengaluru',
    location: { type: 'Point', coordinates: [77.6215, 13.0475] },
    connectorTypes: ['CCS', 'Type 2'],
    chargingSpeedKw: 120,
    pricingPerKwh: 16,
    chargers: [
      { id: 'BLR_MAN_1', status: 'free' },
      { id: 'BLR_MAN_2', status: 'free' },
      { id: 'BLR_MAN_3', status: 'occupied' },
      { id: 'BLR_MAN_4', status: 'free' }
    ]
  }
];

function categorizeCity(coordinates) {
  const [lng, lat] = coordinates;
  if (lat >= 21.0 && lat <= 21.4 && lng >= 72.6 && lng <= 73.1) return 'Surat';
  if (lat >= 22.8 && lat <= 23.3 && lng >= 72.3 && lng <= 72.8) return 'Ahmedabad';
  if (lat >= 18.8 && lat <= 19.4 && lng >= 72.6 && lng <= 73.2) return 'Mumbai';
  if (lat >= 28.3 && lat <= 28.9 && lng >= 76.8 && lng <= 77.6) return 'Delhi/NCR';
  if (lat >= 12.7 && lat <= 13.3 && lng >= 77.3 && lng <= 77.9) return 'Bengaluru';
  return 'Other';
}

async function getCityBreakdown() {
  const stations = await Station.find({}, 'location.coordinates');
  const counts = { Surat: 0, Ahmedabad: 0, Mumbai: 0, 'Delhi/NCR': 0, Bengaluru: 0, Other: 0 };
  for (const s of stations) {
    const city = categorizeCity(s.location.coordinates);
    counts[city] = (counts[city] || 0) + 1;
  }
  return { total: stations.length, counts };
}

async function main() {
  console.log('\n=============================================================');
  console.log('       VoltSync Safe Station Network Expansion Script        ');
  console.log('=============================================================\n');

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ev_charging';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));

  // 1. Initial State Count
  const initial = await getCityBreakdown();
  console.log('\n[1/4] Existing Station Counts Before Expansion:');
  console.log(`  Total Stations : ${initial.total}`);
  console.log(`  • Surat        : ${initial.counts.Surat}`);
  console.log(`  • Ahmedabad    : ${initial.counts.Ahmedabad}`);
  console.log(`  • Mumbai       : ${initial.counts.Mumbai}`);
  console.log(`  • Delhi/NCR    : ${initial.counts['Delhi/NCR']}`);
  console.log(`  • Bengaluru    : ${initial.counts.Bengaluru}`);

  // 2. Resolve Valid Existing Operator
  const operator = await User.findOne({ email: 'operator@example.com' }) ||
                   await User.findOne({ role: 'operator' });

  if (!operator) {
    throw new Error('Fatal: No existing operator account found in database. Please run seed or create operator first.');
  }

  console.log(`\n[2/4] Resolved Existing Operator: ${operator.name} (${operator.email}) [ID: ${operator._id}]`);

  // 3. Process Candidate Stations Idempotently
  console.log(`\n[3/4] Evaluating ${candidateStations.length} Candidate Stations for Insertion...`);
  let insertedCount = 0;
  let skippedCount = 0;

  for (const item of candidateStations) {
    const [lng, lat] = item.location.coordinates;

    // Check for existing station by exact name or duplicate coordinates within ~50 meters
    const existing = await Station.findOne({
      $or: [
        { name: item.name },
        {
          'location.coordinates.0': { $gte: lng - 0.0003, $lte: lng + 0.0003 },
          'location.coordinates.1': { $gte: lat - 0.0003, $lte: lat + 0.0003 }
        }
      ]
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    // Insert new station record
    await Station.create({
      name: item.name,
      location: {
        type: 'Point',
        coordinates: item.location.coordinates
      },
      connectorTypes: item.connectorTypes,
      chargingSpeedKw: item.chargingSpeedKw,
      pricingPerKwh: item.pricingPerKwh,
      chargers: item.chargers,
      liveQueueLength: 0,
      operatorId: operator._id
    });

    insertedCount++;
  }

  console.log(`  • Newly Inserted Stations : ${insertedCount}`);
  console.log(`  • Skipped Existing / Dups : ${skippedCount}`);

  // 4. Final Verification
  const final = await getCityBreakdown();
  console.log('\n[4/4] Final Station Counts After Expansion:');
  console.log(`  Total Stations : ${final.total}`);
  console.log(`  • Surat        : ${final.counts.Surat}`);
  console.log(`  • Ahmedabad    : ${final.counts.Ahmedabad}`);
  console.log(`  • Mumbai       : ${final.counts.Mumbai}`);
  console.log(`  • Delhi/NCR    : ${final.counts['Delhi/NCR']}`);
  console.log(`  • Bengaluru    : ${final.counts.Bengaluru}`);

  console.log('\n=============================================================');
  console.log('       Station Network Expansion Completed Successfully      ');
  console.log('=============================================================\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\nStation expansion error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
