import { createKnexQuery } from '../utils/knexHelper.js'
import { haversineDistance } from '../utils/haversine.js'

//  查找无人机当前位置
async function getDroneCurrentPosition(trx, drone) {
  if (drone.status === 1) {
    // 空闲无人机：机巢位置
    return { lat: parseFloat(drone.latitude), lng: parseFloat(drone.longitude) }
  } else if (drone.status === 2) {
    // 执行中无人机：取当前执行任务的终点
    const runningTask = await trx('dr_flight_task')
        .where({ drone_id: drone.id, status: 2 })
        .first()

    if (!runningTask) return null

    const endpoint = await trx('dr_route_points')
        .where('route_id', runningTask.route_id)
        .orderBy('point_index', 'desc')
        .first()

    if (endpoint) {
      return { lat: parseFloat(endpoint.lat), lng: parseFloat(endpoint.lng) }
    }
  }
  return null
}

//  匹配路线
async function pickRouteForDrone(trx, drone, dronePos) {
  // 1. 空闲路线优先
  const freeRoutes = await trx('dr_route')
      .where({ current_is_used: '0', is_delete: '0', status: '1' })
      .select('*')
      .forUpdate()

  if (freeRoutes.length > 0) {
    const startPoints = await trx('dr_route_points')
        .whereIn('route_id', freeRoutes.map(r => r.id))
        .where('point_index', 0)
        .select('route_id', 'lng', 'lat')

    let best = null
    for (const sp of startPoints) {
      const dist = haversineDistance(
          dronePos.lat, dronePos.lng,
          parseFloat(sp.lat), parseFloat(sp.lng)
      )
      if (!best || dist < best.dist) {
        best = { routeId: sp.route_id, dist }
      }
    }
    return { routeId: best.routeId, taskStatus: 1 } // 执行中
  }

  // 2. 没有空闲路线
  if (drone.status === 2) {
    // 已执行：排队在自己当前路线
    const runningTask = await trx('dr_flight_task')
        .where({ drone_id: drone.id, status: 2 })
        .first()
    return { routeId: runningTask.route_id, taskStatus: 1 }
  } else {
    // 空闲无人机：排队到最近执行中路线的终点
    const runningTasks = await trx('dr_flight_task')
        .where({ status: 2 })
        .select('route_id')

    if (runningTasks.length === 0) return null

    const routeIds = runningTasks.map(t => t.route_id)
    const endPoints = await trx('dr_route_points')
        .whereIn('route_id', routeIds)
        .select('route_id', 'point_index', 'lng', 'lat')

    // 每个 route 取最大 point_index
    const lastPoints = {}
    for (const ep of endPoints) {
      const rid = ep.route_id
      if (!lastPoints[rid] || ep.point_index > lastPoints[rid].point_index) {
        lastPoints[rid] = ep
      }
    }

    let best = null
    for (const rid in lastPoints) {
      const ep = lastPoints[rid]
      const dist = haversineDistance(
          dronePos.lat, dronePos.lng,
          parseFloat(ep.lat), parseFloat(ep.lng)
      )
      if (!best || dist < best.dist) {
        best = { routeId: rid, dist }
      }
    }
    return { routeId: best.routeId, taskStatus: 1 }
  }
}

// 单无人机调度
async function dispatchSingle(fastify, id, trx) {
  const drone = await trx('dr_drone').where({ id, is_delete: '0' }).first()
  if (!drone) throw new Error('无人机不存在')
  if ([3, 4, 5].includes(drone.status)) throw new Error('无人机状态不可调度')

  const dronePos = await getDroneCurrentPosition(trx, drone)
  if (!dronePos) throw new Error('无法获取无人机当前位置')

  const match = await pickRouteForDrone(trx, drone, dronePos)
  if (!match) throw new Error('没有可用的路线')

  // 更新路线状态（只有执行中才要更新）
  if (match.taskStatus === 2) {
    await trx('dr_route')
        .where({ id: match.routeId })
        .update({ current_is_used: '1', updated_at: trx.fn.now() })
    await trx('dr_drone')
        .where({ id: drone.id })
        .update({ status: 2, updated_at: trx.fn.now() })
  }


  // 创建任务
  const taskName = `无人机调度任务-${drone.drone_name}-${Date.now()}`
  const [taskId] = await trx('dr_flight_task').insert({
    task_name: taskName,
    drone_id: drone.id,
    operator_id: drone.operator_id,
    route_id: match.routeId,
    start_time: trx.fn.now(),
    status: match.taskStatus, // 1=执行中，4=排队中
    created_at: trx.fn.now(),
    updated_at: trx.fn.now()
  })

  return {
    taskId,
    taskName,
    droneId: drone.id,
    routeId: match.routeId,
    taskStatus: match.taskStatus
  }
}

export default async function controlRoutes(fastify)  {

  //  无人机单个调度
  fastify.post('/dispatch', async (request, reply) => {

    const { id } = request.body;
    if (!id) {
      return reply.send({ code: 400, message: '参数错误' });
    }

    const trx = await fastify.knex.transaction()
    try {
      const result = await dispatchSingle(fastify, id, trx)
      await trx.commit()
      return reply.send({ code: 0, message: '调度成功', data: result })
    } catch (err) {
      await trx.rollback()
      fastify.log.error(err)
      return reply.send({ message: err.message, code: 400 })
    }
  })

  //  无人机多个调度
  fastify.post('/dispatchBatch', async (request, reply) => {
    const { ids } = request.body

    if (!ids || ids.length === 0) {
      return reply.send({ code: 400, message: '参数错误，缺少无人机id' })
    }

    const trx = await fastify.knex.transaction()
    const results = []
    try {
      for (const id of ids) {
        try {
          const r = await dispatchSingle(fastify, id, trx)
          results.push({ id, success: true, data: r })
        } catch (err) {
          results.push({ id, success: false, message: err.message })
        }
      }
      await trx.commit()
      return reply.send({ code: 0, message: '批量调度完成', results })
    } catch (err) {
      await trx.rollback()
      fastify.log.error(err)
      return reply.send({ message: '批量调度失败', error: err.message, code: 500 })
    }
  })

  //  调度记录
  fastify.get('/getDispatch', async (request, reply) => {
    const { page, pageSize, status } = request.query;
    const [{ total }] = await createKnexQuery(fastify, 'flight_task', 'ft')
        .count({ total: '*' })

    const query = await createKnexQuery(fastify, 'flight_task', 'ft')
        .select(
            'ft.*',
            'd.drone_name',
            'r.route_name',
            'r.expect_complete_time',
            'o.operator_name'
        )
        .addJoin('drone', 'd', function () {
          this.on('ft.drone_id', '=', 'd.id')
        })
        .addJoin('route', 'r', function () {
          this.on('ft.route_id', '=', 'r.id')
        })
        .addJoin('operator', 'o', function () {
          this.on('ft.operator_id', '=', 'o.id')
        })
        .addCondition('ft.status', status)
        .addOrder('ft.created_at', 'desc')
        .addPagination(page, pageSize);

    return reply.send({
      data: {
        data: query,
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  })
}