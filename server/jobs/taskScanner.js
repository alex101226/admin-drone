import cron from 'node-cron';
import { getRealRunningTime } from '../utils/date.js'

const MAX_RUNNING = 5;        // 并发运行上限
const QUEUE_WAIT_MIN = 5;     // 排队至少等待 5 分钟才能启动

/**
 * 注册任务扫描定时器
 * @param {object} fastify - Fastify 实例 (包含 db 插件)
 * (* * * * * → 每分钟执行一次)
 * (*\/5 * * * * → 每 5 分钟执行一次)
 * (0 * * * * → 每小时的第 0 分钟执行一次（整点跑）)
 * (0 9 * * * → 每天早上 9 点执行)
 * (0 0 * * 0 → 每周日 0 点执行)
 */

export function registerTaskScanner(fastify) {
  // 每分钟跑一次
  cron.schedule('* * * * *', async () => {
    fastify.log.info('[任务扫描] 开始扫描运行中任务...', getRealRunningTime('00:15:00'));
    try {
      // 1. 自动结束超时的运行中任务
      const [runningTasks] = await fastify.db.execute(`
          SELECT
              id,
              start_time,
              plan_running_time,
             (NOW() >= start_time + INTERVAL TIME_TO_SEC(plan_running_time) SECOND) AS shouldEnd
          FROM zn_tasks
          WHERE status = 3
      `);
      for (const task of runningTasks) {
        const { realTimeStr, realSeconds } = getRealRunningTime(task['plan_running_time'], 120);

        if (task.shouldEnd) {
          await fastify.db.execute(
              `UPDATE zn_tasks
               SET status = 1,
                   end_time = DATE_ADD(start_time, INTERVAL ? SECOND),
                   real_running_time = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [realSeconds, realTimeStr, task.id]
          );
          fastify.log.info(`[任务调度] 任务 ${task.id} 已完成`);
        }
      }

      // 2. 检查当前运行中的任务数量
      const [countRows] = await fastify.db.execute(`
          SELECT COUNT(*) AS running_count
          FROM zn_tasks
          WHERE status = 3
      `);
      const runningCount = countRows[0].running_count;
      fastify.log.info(`[任务调度] 当前运行任务数: ${runningCount}`);

      // 3. 如果没超过并发上限，就从排队中取任务
      if (runningCount < MAX_RUNNING) {
        const availableSlots = MAX_RUNNING - runningCount;
        const [queuedTasks] = await fastify.db.execute(
            `SELECT id
             FROM zn_tasks
             WHERE status = 4
               AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?
             ORDER BY created_at ASC
                 LIMIT ${availableSlots}`,
            [QUEUE_WAIT_MIN]
        );
        console.log('看下 queuedTasks', queuedTasks)

        if (queuedTasks.length > 0) {
          const ids = queuedTasks.map(t => t.id);
          console.log('查看ids', ids)
          if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            console.log('查看 placeholders', placeholders)
            await fastify.db.execute(
                `UPDATE zn_tasks
                 SET status = 3,
                     start_time = NOW(),
                     updated_at = NOW()
                 WHERE id IN (${placeholders})`,
                ids
            );
            fastify.log.info(`[任务调度] 启动了 ${ids.length} 个任务: ${ids.join(', ')}`);
          }
        }
      }
    } catch (err) {
      fastify.log.error(`[task任务] 出错: ${err.message}`);
    }
  });
}
