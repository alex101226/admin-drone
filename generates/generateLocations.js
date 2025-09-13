import mysql from "mysql2/promise";
import config from '../server/config/index.js';


//  数据库连接
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

// 城市列表（可以继续加）
const cities = [
  { name: '广州', district: '白云区', lng: 113.2644, lat: 23.1291 },
  { name: '深圳', district: '南山区', lng: 113.9305, lat: 22.5333 },
  { name: '长沙', district: '雨花区', lng: 112.9388, lat: 28.2282 },
  { name: '武汉', district: '东西湖区', lng: 114.3054, lat: 30.5931 },
  { name: '南京', district: '江宁区', lng: 118.7969, lat: 32.0603 },
  { name: '上海', district: '浦东新区', lng: 121.4737, lat: 31.2304 },
  { name: '成都', district: '青白江区', lng: 104.0665, lat: 30.5723 },
  { name: '西安', district: '雁塔区', lng: 108.9398, lat: 34.3416 },
  { name: '兰州', district: '七里河区', lng: 103.8343, lat: 36.0611 },
  { name: '昆明', district: '官渡区', lng: 102.8332, lat: 24.8801 }
];

// 地点类型
const types = {
  factory: ['产业园', '工厂', '化工厂', '制造厂'],
  transit: ['仓库', '物流园', '物流中心', '中转站', '服务区']
};

// 随机函数
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 经纬度微调
function randomCoord(base, delta = 0.5) {
  return (base + (Math.random() - 0.5) * delta).toFixed(6);
}

async function generateLocations(count = 50) {
  try {
    for (let i = 0; i < count; i++) {
      const city = randomChoice(cities);

      // 50% 概率是工厂，50% 概率是途径点
      const isFactory = Math.random() > 0.5;
      const type = isFactory ? randomChoice(types.factory) : randomChoice(types.transit);

      const name = `${city.name}${type}`;
      const address = `${city.name}市${city.district}${type}`;

      const lng = randomCoord(city.lng, 0.3);
      const lat = randomCoord(city.lat, 0.3);

      await conn.execute(
          `INSERT INTO zn_locations (name, address, lng, lat) VALUES (?, ?, ?, ?)`,
          [name, address, lng, lat]
      );
    }

    console.log(`✅ 成功插入 ${count} 条地点数据`);
  } catch (err) {
    console.error('❌ 插入数据失败', err);
  } finally {
    await conn.end();
  }
}
generateLocations().catch(console.error);