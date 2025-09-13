import mysql from 'mysql2/promise';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
dayjs.extend(duration);

import config from '../server/config/index.js';
import { randomDate } from '../server/utils/date.js'

// 生成带随机偏差的实际运行时间
function getRealRunningTime(planTimeStr, deviationSeconds = 120) {
  const [h, m, s] = planTimeStr.split(':').map(Number);
  const planSeconds = h * 3600 + m * 60 + s;
  const deviation = Math.floor(Math.random() * (deviationSeconds * 2 + 1)) - deviationSeconds;
  const realSeconds = Math.max(0, planSeconds + deviation);

  const hours = String(Math.floor(realSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((realSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(realSeconds % 60).padStart(2, '0');
  return { realTimeStr: `${hours}:${minutes}:${seconds}`, realSeconds };
}

const taskNames = ['车辆路线', '车辆负载'];
const userIds = [1, 4, 7];
const NUM_TASKS = 20;

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

async function generateTasks() {
  try {
    for (let i = 0; i < NUM_TASKS; i++) {
      const createdAt = randomDate(new Date('2025-05-01'), new Date('2025-06-30'));
      const planMinutes = randomInt(10, 60);
      const planTimeStr = dayjs().startOf('day').add(planMinutes, 'minute').format('HH:mm:ss');
      const { realTimeStr } = getRealRunningTime(planTimeStr, 120);

      const taskName = `${taskNames[Math.floor(Math.random() * taskNames.length)]}-${dayjs(createdAt).format('YYYYMMDD-HHmm')}`;
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const area = Math.random() > 0.5 ? 'computed' : 'gpu';
      const qosOptions = ['normal', 'low', 'high'];
      const qos = qosOptions[Math.floor(Math.random() * qosOptions.length)];
      const statusOptions = ['1', '3', '4']
      const status = statusOptions[Math.floor(Math.random() * statusOptions.length)];
      let nodes = randomInt(1, 3);
      let gpu_number = randomInt(0, 2);
      let cpu_number = randomInt(1, 8);
      if (area === 'gpu') {
        nodes = 1;
        gpu_number = randomInt(1, 2);
        cpu_number = null;
      } else {
        nodes = randomInt(1, 3);
        gpu_number = null;
        cpu_number = randomInt(1, 8);
      }

      const startTime = dayjs(createdAt).add(randomInt(0, 10), 'minute').format('YYYY-MM-DD HH:mm:ss');
      const endTime = dayjs(startTime).add(planMinutes, 'minute').format('YYYY-MM-DD HH:mm:ss');

      await conn.execute(
          `INSERT INTO zn_tasks 
      (task_name, area, qos, nodes, gpu_number, cpu_number, plan_running_time, real_running_time, start_time, end_time, remark, status, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskName, area, qos, nodes, gpu_number, cpu_number, planTimeStr, realTimeStr, startTime, endTime, '任务', status, userId, dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')]
      );
    }

    console.log(`✅ 成功插入 ${NUM_TASKS} 条任务数据`);

  } catch (err) {
    console.error('❌ 插入数据失败', err);
  }finally {
    await conn.end();
    console.log('生成完成！');
  }
}

generateTasks().catch(console.error);
