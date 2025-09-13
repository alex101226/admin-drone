import mysql from 'mysql2/promise';
import dayjs from 'dayjs';
import config from '../server/config/index.js';
import { randomDate } from '../server/utils/date.js'

const NUM_VEHICLES = 20;

const brands = ['解放', '东风', '重汽', '福田', '江淮', '奔驰', '沃尔沃', '斯堪尼亚'];
const departments = ['运输部', '物流一部', '物流二部', '车辆管理科'];
const fuelTypes = ['汽油', '柴油', '新能源', '混合动力', '电动', '其他'];
const statusOptions = ['1', '2', '3', '4']; // 使用中/异常/维修中/闲置
// const controlStatusOptions = ['1', '2']; // 调度中/未调度
const userIds = [1, 4, 7]; // 车辆归属人

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPlateNumber() {
  const provinces = ['粤', '京', '沪', '浙', '苏', '鲁', '豫', '川'];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const province = provinces[randomInt(0, provinces.length - 1)];
  const letter = letters[randomInt(0, letters.length - 1)];
  const numbers = String(randomInt(10000, 99999));
  return `${province}${letter}${numbers}`;
}

function randomVIN() {
  return 'VIN' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function randomEngineNumber() {
  return 'ENG' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

const conn = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function generateVehicles() {
  try {
    for (let i = 0; i < NUM_VEHICLES; i++) {
      const brand = brands[randomInt(0, brands.length - 1)];
      const vehicleAlias = `${brand}-车辆`;
      const plateNumber = randomPlateNumber();
      const manufactureYear = 2000 + randomInt(5, 24); // 2005-2024
      const seriesNumber = `SN${randomInt(10000, 99999)}`;
      const vinCode = randomVIN();
      const mileage = randomInt(10000, 200000);
      const fuelType = fuelTypes[randomInt(0, fuelTypes.length - 1)];
      const engineNumber = randomEngineNumber();
      const insuranceExpiry = dayjs().add(randomInt(30, 365), 'day').format('YYYY-MM-DD');
      const department = departments[randomInt(0, departments.length - 1)];
      const purchaseDate = dayjs().subtract(randomInt(1, 10), 'year').format('YYYY-MM-DD');
      const status = statusOptions[randomInt(0, statusOptions.length - 1)];
      const remark = '测试车辆';
      // const ownerId = userIds[randomInt(0, userIds.length - 1)];
      // const createdAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
      const createdAt = randomDate(new Date('2025-05-01'), new Date('2025-06-30'));
      const updatedAt = createdAt;
      const vehicleWeight = (randomInt(5000, 20000)).toFixed(2);
      const loadCapacity = (randomInt(10000, 40000)).toFixed(2);
      const controlStatus = '2';

      await conn.execute(
          `INSERT INTO zn_vehicles 
        (vehicle_alias, vehicle_photo, brand, plate_number, manufacture_year, series_number, vin_code, mileage, fuel_type, engine_number, insurance_expiry, department, purchase_date, status, remark, owner_id, created_at, updated_at, vehicle_weight, load_capacity, control_status, assigned_route_id, current_location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vehicleAlias,
            null, // vehicle_photo
            brand,
            plateNumber,
            manufactureYear,
            seriesNumber,
            vinCode,
            mileage,
            fuelType,
            engineNumber,
            insuranceExpiry,
            department,
            purchaseDate,
            status,
            remark,
            null,
            createdAt,
            updatedAt,
            vehicleWeight,
            loadCapacity,
            controlStatus,
            null, // assigned_route_id
            null  // current_location_id
          ]
      );
    }

    console.log(`✅ 成功插入 ${NUM_VEHICLES} 条车辆数据`);

  } catch (err) {
    console.error('❌ 插入车辆数据失败', err);
  } finally {
    await conn.end();
    console.log('生成完成！');
  }
}

generateVehicles().catch(console.error);
