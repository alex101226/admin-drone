import cron from 'node-cron';
import {getRealRunningTime} from "../utils/date.js";


/**
 * 车辆调度任务的定时器
 * @param {object} fastify - Fastify 实例 (包含 db 插件)
 * (* * * * * → 每分钟执行一次)
 * (*\/5 * * * * → 每 5 分钟执行一次)
 * (0 * * * * → 每小时的第 0 分钟执行一次（整点跑）)
 * (0 9 * * * → 每天早上 9 点执行)
 * (0 0 * * 0 → 每周日 0 点执行)
 * (0 *\/12 * * *, 12小时执行一次)
 */
export function dispatchScanner(fastify)  {
  cron.schedule('* * * * *', async () => {
    fastify.log.info('[车辆调度任务] 开始扫描运行中任务...');
    try {
      // 查出调度表中 dispatch_status = 1 的记录
      const [dispatches] = await fastify.db.execute(
          `SELECT id, expected_end_time FROM zn_vehicle_dispatches WHERE dispatch_status = 1`
      )

      for (const dispatch of dispatches) {
        await fastify.db.execute(
            `UPDATE zn_vehicle_dispatches
             SET dispatch_status = '3',
                 transport_status = '4',
                 end_time =  DATE_ADD(
                         expected_end_time,
                         INTERVAL FLOOR(RAND() * 1201 - 600) SECOND
                )
             WHERE id = ?`,
            [dispatch.id]
        )
      }

      // 查出车辆表中 control_status = 1 的记录
      const [vehicles] = await fastify.db.execute(
          `SELECT id FROM zn_vehicles WHERE control_status = 1`
      )

      if (vehicles.length > 0) {
        const [updateVehicles] = await fastify.db.execute(
            `UPDATE zn_vehicles
         SET control_status = 2,
             status = 4,
             assigned_route_id = NULL
         WHERE control_status = 1`
        )
        console.log(`车辆表更新 ${updateVehicles.affectedRows} 条记录`)
      } else {
        console.log('车辆表没有需要更新的记录')
      }
    } catch (err) {
      fastify.log.error(`[vehicle 任务] 出错: ${err.message}`);
    }
  })
}