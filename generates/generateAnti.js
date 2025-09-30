//  生成反制预警数据
import knex from "knex";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
dayjs.extend(duration);

import config from '../server/config/index.js';
import {randomDate} from "../server/utils/date.js";

const NUM_FENCES = 20;

// 初始化 knex
const conn = knex({
  client: 'mysql2',
  useNullAsDefault: true, // 避免一些 warning
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  }
});

async function generateAnti() {
  try {
    for (let i = 0; i < NUM_FENCES; i++) {
      const createdAt = randomDate(new Date('2025-05-01'), new Date('2025-06-30'));

      const [region] = await conn('dr_region')
          .select('*')
          .orderByRaw('RAND()')
          .limit(1)
      const sig = `DRONE-${Math.random().toString(36).substring(2, 10)}`
      const message = `检测到未授权无人机 ${sig} 闯入 ${region.name} 区域，已识别并阻止。`;
      await conn('dr_anti')
          .insert({
            sig,
            message,
            lat: region.lat,
            lng: region.lng,
            area: region.name,
            altitude: Math.floor(Math.random() * 300 + 50),
            created_at: dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
          })
    }
    console.log(`✅ 成功插入 ${NUM_FENCES} 条无人机反制数据`);
  } catch (err) {
    console.error('反制数据插入失败', err);
  } finally {
    await conn.destroy();
    console.log('生成完成！');
  }
}
generateAnti().catch(console.error);