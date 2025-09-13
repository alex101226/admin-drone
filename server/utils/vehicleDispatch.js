import { v4 as uuidv4 } from 'uuid';

/**
 * 获取uuid
 * @returns {*}
 */
const getUUid = () => {
  return uuidv4();
}
/**
 * 计算两点间距离（Haversine公式，单位：米）
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // 地球半径（米）
  const toRad = (deg) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // 距离（米）
}

/**
 * 获取可调度的车辆
 *        AND control_status = '2' -- 未调度
 */
async function getAvailableVehicle(fastify, vehicle_id) {
  const [rows] = await fastify.db.execute(
      `SELECT *
     FROM zn_vehicles
     WHERE status IN ('1','4') AND id= ? -- 使用中 or 闲置
       AND control_status = '2' -- 未调度
     LIMIT 1`, [vehicle_id]
  );
  return rows[0] || null;
}

/**
 * 获取可用路线（未被占用）
 */
async function getAvailableRoute(fastify) {
  const [rows] = await fastify.db.execute(
      `SELECT r.*
     FROM zn_logistics_routes r
     WHERE r.status = '1'
       AND NOT EXISTS (
         SELECT 1 FROM zn_vehicle_dispatches d
         WHERE d.route_id = r.id
           AND d.dispatch_status = '1'
       )
     ORDER BY r.created_at ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * 根据车辆位置选择最近的路线
 */
async function getNearestRouteByLocation(fastify, vehicle) {
  if (!vehicle.current_location_id) return null;

  // 查询车辆当前位置
  const [[loc]] = await fastify.db.execute(
      `SELECT id, lng, lat
     FROM zn_locations
     WHERE id = ?`,
      [vehicle.current_location_id]
  );
  if (!loc) return null;

  // 查询所有可用路线及其起点
  const [routes] = await fastify.db.execute(
      `SELECT r.*, s.lng, s.lat
     FROM zn_logistics_routes r
     JOIN zn_locations s ON r.start_station_id = s.id
     WHERE r.status = '1'`
  );

  if (routes.length === 0) return null;

  // 计算最近路线
  routes.sort(
      (a, b) =>
          getDistance(loc.lat, loc.lng, a.lat, a.lng) -
          getDistance(loc.lat, loc.lng, b.lat, b.lng)
  );

  return routes[0];
}

/**
 * 分配路线给车辆
 */
async function assignRouteToVehicle(fastify, vehicle, route) {
  // 插入调度记录
  await fastify.db.execute(
      `INSERT INTO zn_vehicle_dispatches
      (
       vehicle_id,
       route_id,
       dispatch_status,
       transport_status,
       batch_id,
       expected_end_time,
       start_time,
       created_at
      )
     VALUES (?, ?, '1', '1', ?, DATE_ADD(NOW(), INTERVAL ? HOUR), NOW(), NOW())`,
      [vehicle.id, route.id, getUUid(), route.estimated_time]
  );

  // 更新车辆状态
  await fastify.db.execute(
      `UPDATE zn_vehicles
     SET control_status = '1',  -- 已调度
         assigned_route_id = ?,
         status = '1'            -- 使用中
     WHERE id = ?`,
      [route.id, vehicle.id]
  );

  return route.id;
}

/**
 * 🚀 主调度逻辑
 */
async function dispatchSingleVehicle(fastify, vehicle_id, batch_id) {

  // 1. 查找可调度车辆
  const vehicle = await getAvailableVehicle(fastify, vehicle_id);
  if (!vehicle) {
    fastify.log.info("没有可调度的车辆");
    return null;
  }

  // 2. 查找未占用路线
  let route = await getAvailableRoute(fastify);

  // 3. 如果没有可用路线 → 根据车辆位置找最近的
  if (!route) {
    if (vehicle.assigned_route_id) {
      // 已有路线，继续用原来的
      const [[assignedRoute]] = await fastify.db.execute(
          `SELECT * FROM zn_logistics_routes WHERE id = ?`,
          [vehicle.assigned_route_id]
      );
      route = assignedRoute;
    } else {
      // 根据 current_location_id 匹配最近路线
      route = await getNearestRouteByLocation(fastify, vehicle);
    }
  }

  console.log('看下路线信息', route)
  if (!route) {
    fastify.log.info(`车辆 ${vehicle.id} 未找到合适路线`);
    return null;
  }

  // 4. 分配路线
  const routeId = await assignRouteToVehicle(fastify, vehicle, route);

  fastify.log.info(
      `车辆 ${vehicle.id} (${vehicle.vehicle_alias}) 已调度到路线 ${routeId}`
  );

  return { vehicle_id: vehicle.id, route_id: routeId };
}

export { dispatchSingleVehicle };
