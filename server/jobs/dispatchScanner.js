import cron from 'node-cron';


/**
 * 写入无人机飞行记录
 * @param {object} trx - Knex 事务对象
 * @param {number} taskId - 任务ID
 * @param {number} droneId - 无人机ID
 * @param operatorId - 飞手id
 * @param {object} route - 路线信息（包含 expect_complete_time、distance 等）
 */
async function insertFlightLog(trx, taskId, droneId, operatorId, route) {
  // 模拟飞行高度 50~300米
  const altitude = Math.floor(Math.random() * 250 + 50);

  // 根据路线预计完成时间计算速度
  let durHours = parseFloat(route?.expect_complete_time);
  if (!isFinite(durHours) || durHours <= 0) durHours = 1; // 回退 1 小时
  const distance = route?.distance || 10; // 默认 10 km
  const speed = distance * 1000 / (durHours * 3600); // m/s

  // 事件类型随机：大部分为正常
  const eventTypeOptions = [1,1,1,1,1,1,1,1,2,3,4];
  const event_type = eventTypeOptions[Math.floor(Math.random() * eventTypeOptions.length)];

  await trx('dr_flight_log').insert({
    task_id: taskId,
    drone_id: droneId,
    altitude,
    speed,
    event_type,
    created_at: trx.fn.now()
  });
}



const MAX_RUNNING = 5;        // 并发运行上限
const QUEUE_WAIT_MIN = 1;     // 排队至少等待 5 分钟才能启动
/**
 * 无人机调度任务
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
    fastify.log.info('[无人机调度任务] 开始扫描运行中任务...');
    const trx = await fastify.knex.transaction();
    try {
      // -------------------------
      // Step 1: 完成到期的执行中任务 (status = 2)
      // 条件：dr_flight_task.end_time <= now
      // 操作：task -> status=3，释放 route.current_is_used='0'
      //      （后面统一修正 drone.status）
      // -------------------------
      const now = new Date()
      const expired = await trx('dr_flight_task')
          .where('status', 2)
          .andWhere('end_time', '<=', now)
          .select('id', 'drone_id', 'route_id');
      // console.log('查找任务', expired)
      for (const t of expired) {
        await trx('dr_flight_task').where({ id: t.id }).update({
          status: 3,
          updated_at: trx.fn.now()
        });

        await trx('dr_route').where({ id: t.route_id }).update({
          current_is_used: '0',
          updated_at: trx.fn.now()
        });
        fastify.log.info(`[taskScanner] 任务 ${t.id} 到期，标记完成并释放路线 ${t.route_id}`);


        const route = await trx('dr_route').where({ id: t.route_id }).first();
        await insertFlightLog(trx, t.id, t.drone_id, t.operator_id, route);

        fastify.log.info(`[taskScanner] 任务 ${t.id} 到期，标记完成并写入飞行记录`);
      }

      // -------------------------
      // Step 2: 统计当前正在运行的任务数 (status = 2)
      // -------------------------
      const runningCountRow = await trx('dr_flight_task').where({ status: 2 }).count({ cnt: '*' });
      const runningCount = Number(runningCountRow && runningCountRow[0] ? runningCountRow[0].cnt : 0);

      // -------------------------
      // Step 3: 尝试把待执行任务 (status = 1) 晋升为执行中 (status = 2)
      // 规则：
      //  - created_at <= now - QUEUE_WAIT_MIN
      //  - 该任务对应的无人机当前没有执行中任务（避免同一无人机同时执行多任务）
      //  - 原子性占用路线：UPDATE dr_route SET current_is_used='1' WHERE id = ? AND current_is_used='0'
      //  - 全局并发 runningCount < MAX_RUNNING
      //  - 晋升时写 start_time/end_time，并把 drone.status=2（仅在实际开始执行时设为2）
      // -------------------------
      const waitThreshold = new Date(Date.now() - QUEUE_WAIT_MIN * 60 * 1000);

      const queuedTasks = await trx('dr_flight_task')
          .where('status', 1)
          .andWhere('created_at', '<=', waitThreshold)
          .orderBy('created_at', 'asc')
          .select('id', 'drone_id', 'route_id');
      let curRunning = runningCount;
      console.log('查找代执行的任务', curRunning >= MAX_RUNNING)
      for (const q of queuedTasks) {
        if (curRunning >= MAX_RUNNING) break;

        // 如果该无人机当前已有执行中任务，跳过（不能并行同一无人机）
        const droneExec = await trx('dr_flight_task').where({ drone_id: q.drone_id, status: 2 }).first();
        if (droneExec) continue;

        // 尝试原子性占用路线：只有 current_is_used='0' 才能占用
        const updated = await trx('dr_route')
            .where({ id: q.route_id, current_is_used: '0' })
            .update({ current_is_used: '1', updated_at: trx.fn.now() });

        if (!updated) {
          // 路线无法占用（被别人抢到），下个循环重试
          continue;
        }

        // 读取 route 信息以计算预计时长（优先把 end_time 放到任务表）
        const route = await trx('dr_route').where({ id: q.route_id }).first();

        // route.expect_complete_time 可能是前端传来的小时数（字符串/数值），也有可能为空
        let durHours = parseFloat(route && route.expect_complete_time);
        if (!isFinite(durHours) || durHours <= 0) {
          // 回退到 1 小时
          durHours = 1;
        }
        const startTime = new Date();
        const endTime = new Date(Date.now() + Math.round(durHours * 3600 * 1000));

        // 将任务置为执行中
        await trx('dr_flight_task').where({ id: q.id }).update({
          status: 2,
          start_time: startTime,
          end_time: endTime,
          updated_at: trx.fn.now()
        });

        // 将无人机状态设为 执行中 (2)，但不要改禁用/维修的无人机
        await trx('dr_drone')
            .where({ id: q.drone_id })
            .whereNotIn('status', [3, 4])
            .update({ status: 2, updated_at: trx.fn.now() });

        curRunning++;
        fastify.log.info(`[taskScanner] 任务 ${q.id} (drone ${q.drone_id}) 从待执行=>执行中, start=${startTime.toISOString()}, end=${endTime.toISOString()}`);
      }

      // -------------------------
      // Step 4: 统一修正无人机状态（优先级：执行中(2) > 排队中(5) > 空闲(1)）
      // - 有执行中任务的无人机 => status = 2
      // - 仅有待执行任务的无人机 => status = 5
      // - 都没有 => status = 1
      // 不修改 status = 3/4 的无人机（禁用/维修）
      // -------------------------
      const execRows = await trx('dr_flight_task').where({ status: 2 }).distinct('drone_id');
      const queuedRows = await trx('dr_flight_task').where({ status: 1 }).distinct('drone_id');

      const execDroneIds = execRows.map(r => Number(r.drone_id));
      const queuedDroneIds = queuedRows.map(r => Number(r.drone_id));

      // 把执行中的无人机设为 2
      if (execDroneIds.length > 0) {
        await trx('dr_drone')
            .whereIn('id', execDroneIds)
            .whereNotIn('status', [3, 4])
            .update({ status: 2, updated_at: trx.fn.now() });
      }

      // 仅排队（有待执行但无执行中） -> 5
      const onlyQueued = queuedDroneIds.filter(id => !execDroneIds.includes(id));
      if (onlyQueued.length > 0) {
        await trx('dr_drone')
            .whereIn('id', onlyQueued)
            .whereNotIn('status', [3, 4])
            .update({ status: 5, updated_at: trx.fn.now() });
      }

      // 空闲（既不在执行中也没有待执行） -> 1
      const busyIds = Array.from(new Set([...execDroneIds, ...queuedDroneIds]));
      // 当 busyIds 为空时，whereNotIn([]) 可能报错或无意义，使用 [0] 做替代
      const excludeIds = busyIds.length ? busyIds : [0];
      await trx('dr_drone')
          .whereNotIn('id', excludeIds)
          .whereNotIn('status', [3, 4])
          .update({ status: 1, updated_at: trx.fn.now() });

      await trx.commit();
      fastify.log.info('[任务扫描] 本次扫描完成.');
    } catch (err) {
      fastify.log.error(`[vehicle 任务] 出错: ${err.message}`);
    }
  })
}