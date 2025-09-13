import mysql from 'mysql2/promise';
import config from '../server/config/index.js';
import {randomDate} from '../server/utils/date.js'

const NUM_FENCES = 20;

// 对应数据标准，只存 value
const fenceGroupOptions = ['0', '1', '2']; // 分组
const fenceTypes = ['1']; // 类型
const groupKeys = ['1','2','3','4','5','6']; // 位置

// 告警设备名称和备注
const fenceDevices = [
  { name: '有害气体区告警', remark: '该区域有高浓度臭氧气体' },
  { name: '易燃物品区告警', remark: '该区域有爆炸风险' },
  { name: '高压电区告警', remark: '该区域有高压电流' },
];
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function generateFences() {
  try {
    for (let i = 0; i < NUM_FENCES; i++) {
      const device = fenceDevices[randomInt(0, fenceDevices.length - 1)];
      const fenceType = fenceTypes[randomInt(0, fenceTypes.length - 1)]; // '1'
      const groupKey = fenceGroupOptions[randomInt(0, fenceGroupOptions.length - 1)];
      const deviceLocationKey = groupKeys[randomInt(0, groupKeys.length - 1)]; // '1'-'6'
      const fenceName = device.name;
      const remark = device.remark;
      const createdAt = randomDate(new Date('2025-05-01'), new Date('2025-06-30'));
      await conn.execute(
          `INSERT INTO zn_electronic_fences
           (fence_name, fence_type, group_key, device_location_key, remark, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [fenceName, fenceType, groupKey, deviceLocationKey, remark, createdAt, createdAt]
      );
    }

    console.log(`✅ 成功插入 ${NUM_FENCES} 条电子围栏数据`);
  } catch (err) {
    console.error('❌ 插入电子围栏数据失败', err);
  } finally {
    await conn.end();
    console.log('生成完成！');
  }
}

generateFences().catch(console.error);
