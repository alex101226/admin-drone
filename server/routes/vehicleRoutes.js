import { dispatchSingleVehicle } from '../utils/vehicleDispatch.js'

async function vehicleRoutes(fastify)  {

  //  车辆信息查询
  fastify.get('/getVehicle', async (request, reply) => {
    try {
      // 获取分页参数
      const { page = 1, pageSize = 10 } = request.query;

      const offset = (page - 1) * pageSize;

      // 查询总数
      const [countRows] = await fastify.db.execute(`SELECT COUNT(*) AS total FROM zn_vehicles v LEFT JOIN zn_users u ON v.owner_id = u.id`);

      const total = countRows[0].total;

      // 查询分页数据
      const [rows] = await fastify.db.query(
          `SELECT 
           v.id,
           v.plate_number,
           v.vehicle_alias,
           v.vehicle_photo,
           v.brand,
           v.manufacture_year,
           v.series_number,
           v.vin_code,
           v.mileage,
           v.fuel_type,
           v.engine_number,
           v.insurance_expiry,
           v.current_location_id,
           v.department,
           v.purchase_date,
           v.status,
           v.remark,
           v.created_at,
           v.updated_at,
           v.owner_id,
           u.username AS operator_account,
           u.nickname AS operator_nickname
         FROM zn_vehicles v
         LEFT JOIN zn_users u ON v.owner_id = u.id
         ORDER BY v.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`);

      // 查询每辆车对应的司机信息
      const vehicleIds = rows.map(r => r.id);
      let driverMap = {};
      if (vehicleIds.length > 0) {
        const [driverRows] = await fastify.db.query(
            `SELECT vehicle_id, driver_id, d.name 
         FROM zn_vehicle_drivers vd
         JOIN zn_drivers d ON vd.driver_id = d.id
         WHERE vehicle_id IN (${vehicleIds.map(() => '?').join(',')})`,
            vehicleIds
        );
        // 构建 vehicle_id -> { ids: [], names: [] } 映射
        driverMap = driverRows.reduce((acc, cur) => {
          if (!acc[cur.vehicle_id]) {
            acc[cur.vehicle_id] = { driver_ids: [], driver_names: [] };
          }
          acc[cur.vehicle_id].driver_ids.push(cur.driver_id);
          acc[cur.vehicle_id].driver_names.push(cur.name);
          return acc;
        }, {});
      }

      // 给每辆车加上司机信息
      const dataWithDrivers = rows.map(r => ({
        ...r,
        driver_ids: driverMap[r.id]?.driver_ids || [],
        driver_names: driverMap[r.id]?.driver_names || []
      }));

      reply.send({
        data: {
          data: dataWithDrivers,
          total,
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
        }
      });
    } catch(err) {
      fastify.log.error('车辆数查询----catch捕捉', err);
      // reply.status(500).send({ error: '服务器错误' });
      throw err;
    }
  })

  //  车辆添加
  fastify.post('/addVehicle', async (request, reply) => {
    try {
      const {
        vehicle_alias, vehicle_photo, brand, manufacture_year, department, current_location_id,
        series_number, vin_code, mileage, fuel_type, engine_number, insurance_expiry,
        purchase_date, remark, status, owner_id, plate_number, driver_ids,
      } = request.body;

      const [rows] = await fastify.db.execute(`SELECT vin_code FROM zn_vehicles WHERE vin_code = '${vin_code}'`)
      if (rows.length > 0) {
        return reply.send({ message: 'vin码不能不能重复', code: 400 })
      }

      const sql = `INSERT INTO zn_vehicles (
          plate_number, vehicle_alias, vehicle_photo, brand, manufacture_year, department,
          current_location_id, series_number, vin_code, mileage, fuel_type, engine_number,
          insurance_expiry, purchase_date, remark, owner_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

      //  汽油','柴油','新能源','混合动力','其他'
      const params = [plate_number, vehicle_alias, vehicle_photo, brand, manufacture_year, department, current_location_id,
        series_number, vin_code, mileage, fuel_type, engine_number, insurance_expiry,
        purchase_date, remark, owner_id, status]

      const [result] = await fastify.db.execute(sql, params)
      const vehicleId = result.insertId;

      // 处理司机关联
      if (Array.isArray(driver_ids) && driver_ids.length > 0) {
        const insertDriversSQL = `
        INSERT INTO zn_vehicle_drivers (vehicle_id, driver_id, assigned_date, created_at, updated_at)
        VALUES ${driver_ids.map(() => '(?, ?, NOW(), NOW(), NOW())').join(', ')}
      `;
        // 拼接参数，重复 vehicleId 对应每个 driver_id
        const driverParams = driver_ids.flatMap(driverId => [vehicleId, driverId]);
        await fastify.db.execute(insertDriversSQL, driverParams);
      }

      return reply.send({
        message: '添加成功',
        data: {
          id: vehicleId,
        }
      })
    } catch(err) {
      fastify.log.error(`添加用户车辆的catch捕捉错误 >>>>>>>>>>>>>>>>>>>>>${err}`);
      throw err;
    }
  })

  //  车辆修改
  fastify.post('/updateVehicle', async (request, reply) => {
    const {
      plate_number, vehicle_id, vehicle_alias, vehicle_photo, brand, manufacture_year, department,
      current_location_id, series_number, vin_code, mileage, fuel_type, engine_number, insurance_expiry,
      purchase_date, status, remark, owner_id, driver_ids,
    } = request.body;
    try {
      if (!vehicle_id) {
        return reply.send({ message: '车辆id不能为空' });
      }
      if (!owner_id) {
        return reply.send({ message: '负责人不能为空' });
      }
      const params = [
        plate_number, vehicle_alias, vehicle_photo, brand, manufacture_year, department, current_location_id,
        series_number, vin_code, mileage, fuel_type, engine_number, insurance_expiry,
        purchase_date, status, remark, owner_id, vehicle_id,];
      const sql = `
      UPDATE zn_vehicles
      SET plate_number = ?,
          vehicle_alias = ?,
          vehicle_photo = ?,
          brand = ?,
          manufacture_year = ?,
          department = ?,
          current_location_id = ?,
          series_number = ?,
          vin_code = ?,
          mileage = ?,
          fuel_type = ?,
          engine_number = ?,
          insurance_expiry = ?,
          purchase_date = ?,
          status = ?,
          remark = ?,
          owner_id = ?,
          updated_at = NOW()
      WHERE id = ?
      `;
      const [result] = await fastify.db.execute(sql, params);

      if (result.affectedRows > 0) {
        // 1. 删除原来的司机关联
        await fastify.db.execute(`DELETE FROM zn_vehicle_drivers WHERE vehicle_id = ${vehicle_id}`);
        // 2. 插入新的司机关联
        if (Array.isArray(driver_ids) && driver_ids.length > 0) {
          const insertDriversSQL = `
          INSERT INTO zn_vehicle_drivers (vehicle_id, driver_id, assigned_date, created_at, updated_at)
          VALUES ${driver_ids.map(() => '(?, ?, NOW(), NOW(), NOW())').join(', ')}
        `;
          const driverParams = driver_ids.flatMap(driverId => [vehicle_id, driverId]);
          await fastify.db.execute(insertDriversSQL, driverParams);
        }

        return reply.send({
          message: '车辆修改成功',
          data: null,
        });
      } else {
        return reply.send({
          code: 400,
          message: '车辆修改失败',
          data: null,
        });
      }
    } catch(err) {
      fastify.log.error('修改车辆报错---------', err);
      throw err;
    }
  })

  //  调度车辆查询
  fastify.get('/getVehicleControl', async (request, reply) => {
    try {
      // 获取分页参数
      const { page = 1, pageSize = 10, status } = request.query;

      const offset = (page - 1) * pageSize;

      const [num1, num2] = status.split(',').map(s => parseInt(s.trim(), 10));

      // 查询总数
      const [countRows] = await fastify.db.execute(`SELECT COUNT(*) AS total FROM zn_vehicles WHERE status IN (?, ?)`, [num1, num2]);
      const total = countRows[0].total;


      // 查询分页数据
      const [rows] = await fastify.db.execute(
          `SELECT  v.id,
                   v.vehicle_alias,
                   v.control_status,
                   v.current_location_id,
                   v.assigned_route_id,
                   CASE WHEN v.control_status = '1' THEN r.distance_km END AS distance_km,
                   CASE WHEN v.control_status = '1' THEN r.estimated_time END AS estimated_time,
                   CASE WHEN v.control_status = '1' THEN r.route_name END AS route_name,
                   l.address AS current_location,
                   CASE WHEN v.control_status = '1' THEN sl.address END AS route_start,
                   CASE WHEN v.control_status = '1' THEN el.address END AS route_end,
                   vd.transport_status,
                   vd.start_time,
                   vd.expected_end_time,
                   vd.end_time,
                   vd.id as dispatch_id,
                   vd.batch_id,
                   COALESCE(vd.dispatch_status, '2') AS dispatch_status
           FROM zn_vehicles v
                    LEFT JOIN zn_locations l ON v.current_location_id = l.id
                    LEFT JOIN (
               SELECT vd.*
               FROM zn_vehicle_dispatches vd
                        INNER JOIN (
                   SELECT vehicle_id, MAX(id) AS max_id
                   FROM zn_vehicle_dispatches
                   WHERE dispatch_status != '3'   -- 排除已完成
                   GROUP BY vehicle_id
               ) t ON vd.id = t.max_id
           ) vd ON vd.vehicle_id = v.id
                    LEFT JOIN zn_logistics_routes r ON vd.route_id = r.id
                    LEFT JOIN zn_locations sl ON r.start_station_id = sl.id
                    LEFT JOIN zn_locations el ON r.end_station_id = el.id
           WHERE v.status IN (?, ?)
           ORDER BY v.created_at DESC
               LIMIT ${pageSize} OFFSET ${offset}`, [num1, num2]);

      // 查询每辆车对应的司机信息
      const vehicleIds = rows.map(r => r.id);
      let driverMap = {};
      if (vehicleIds.length > 0) {
        const [driverRows] = await fastify.db.query(
            `SELECT vd.vehicle_id, d.name, d.phone
             FROM zn_vehicle_drivers vd
                      JOIN zn_drivers d ON vd.driver_id = d.id
             WHERE vd.vehicle_id IN (${vehicleIds.map(() => '?').join(',')})`,
            vehicleIds
        );
        // 构建 vehicle_id -> [{ name, phone }, ...]
        driverMap = driverRows.reduce((acc, cur) => {
          if (!acc[cur.vehicle_id]) acc[cur.vehicle_id] = [];
          acc[cur.vehicle_id].push({ name: cur.name, phone: cur.phone });
          return acc;
        }, {});
      }

      // 给每辆车加上司机信息
      const dataWithDrivers = rows.map(v => ({
        ...v,
        drivers: driverMap[v.id] || []
      }));

      reply.send({
        data: {
          data: dataWithDrivers,
          total,
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
        }
      });
    } catch(err) {
      fastify.log.error('车辆数查询----catch捕捉', err);
      // reply.status(500).send({ error: '服务器错误' });
      throw err;
    }
  })

  // 单个车辆调度
  fastify.post('/dispatchVehicle', async (request, reply) => {
    try {
      const { vehicle_id } = request.body;
      if (!vehicle_id) {
        return reply.send({ code: 400, message: '车辆id不能为空' });
      }
      const [rows] = await fastify.db.execute(`SELECT * FROM zn_vehicles WHERE id = ?`, [vehicle_id]);
      if (rows.length === 0) {
        return reply.send({ code: 400, message: '车辆不存在或状态不允许调度' });
      }
      if (rows[0].control_status === '1') {
        return reply.send({ message: '车辆已调度', code: 400 })
      }

      const ok = await dispatchSingleVehicle(fastify, vehicle_id);
      if (ok) {
        return reply.send({ message: '车辆调度成功' });
      }
      return reply.send({ code: 400, message: '车辆调度失败，车辆可能不在空闲状态' });
    } catch (err) {
      fastify.log.error('单个车辆调度报错', err);
      throw err;
    }
  });

  // 一键调度所有空闲车辆
  fastify.post('/dispatchAllVehicles', async (request, reply) => {
    try {
      const { vehicle_ids } = request.body; // 前端传一组车辆 id
      if (!vehicle_ids || vehicle_ids.length === 0) {
        return reply.send({ code: 400, message: '车辆列表不能为空' });
      }

      let successCount = 0;
      for (const vehicle_id of vehicle_ids) {
        const ok = await dispatchSingleVehicle(fastify, vehicle_id);
        if (ok) successCount++;
      }
      return reply.send({
        message: `批量调度完成，成功 ${successCount} 辆, 失败 ${vehicle_ids.length - successCount} 辆`,
      });
    } catch (err) {
      fastify.log.error('一键调度报错', err);
      throw err;
    }
  });

  //  调度历史记录
  fastify.get('/getVehicleControlHistory', async (request, reply) => {
    try {
      // 获取分页参数
      const { page = 1, pageSize = 10, vehicle_id } = request.query;

      const offset = (page - 1) * pageSize;

      // 查询总数
      const [countRows] = await fastify.db.execute(
          `
            SELECT
                COUNT(*) AS total
            FROM zn_vehicle_dispatches
            WHERE dispatch_status = 3 AND vehicle_id = ?`, [vehicle_id]);
      const total = countRows[0].total;

      // 查询分页数据
      const [rows] = await fastify.db.execute(
          `SELECT
          vd.batch_id,
          vd.dispatch_status,
          vd.start_time,
          vd.end_time,
          v.id,
          v.vehicle_alias,
          lr.route_name
          FROM zn_vehicle_dispatches vd
          LEFT JOIN zn_vehicles v ON vd.vehicle_id = v.id
          LEFT JOIN zn_logistics_routes lr ON vd.route_id = lr.id
           WHERE vd.dispatch_status = '3' AND v.id = ?
         ORDER BY v.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`, [vehicle_id]);


      // 查询每辆车对应的司机信息
      const vehicleIds = rows.map(r => r.id);
      let driverMap = {};
      if (vehicleIds.length > 0) {
        const [driverRows] = await fastify.db.query(
            `SELECT vd.vehicle_id, d.name, d.phone
             FROM zn_vehicle_drivers vd
                      JOIN zn_drivers d ON vd.driver_id = d.id
             WHERE vd.vehicle_id IN (${vehicleIds.map(() => '?').join(',')})`,
            vehicleIds
        );
        // 构建 vehicle_id -> [{ name, phone }, ...]
        driverMap = driverRows.reduce((acc, cur) => {
          if (!acc[cur.vehicle_id]) acc[cur.vehicle_id] = [];
          acc[cur.vehicle_id].push({ name: cur.name, phone: cur.phone });
          return acc;
        }, {});
      }

      // 给每辆车加上司机信息
      const dataWithDrivers = rows.map(v => ({
        ...v,
        drivers: driverMap[v.id] || []
      }));

      reply.send({
        data: {
          data: dataWithDrivers,
          total,
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
        }
      });
    } catch(err) {
      fastify.log.error('车辆数查询----catch捕捉', err);
      // reply.status(500).send({ error: '服务器错误' });
      throw err;
    }
  })

  //  运输信息查询
  fastify.get('/getTransport', async (request, reply) => {
    const sql = `
        SELECT
            vd.batch_id,
            vd.vehicle_id,
            vd.route_id,
            vd.dispatch_status,
            vd.transport_status,
            vd.start_time,
            vd.end_time,
            vd.expected_end_time,
            lr.start_station_id,
            lr.end_station_id,
            v.vehicle_alias,
            v.id,
            sl.name AS start_name,
            sl.address AS start_address,
            el.name AS end_name,
            el.address AS end_address
            FROM zn_vehicle_dispatches vd
        LEFT JOIN zn_vehicles v ON vd.vehicle_id = v.id
        LEFT JOIN zn_logistics_routes lr ON vd.route_id = lr.id
        LEFT JOIN zn_locations sl ON lr.start_station_id = sl.id
        LEFT JOIN zn_locations el ON  lr.end_station_id = el.id
        ORDER BY
            CASE vd.transport_status
                WHEN 1 THEN 1  -- 运输中
                WHEN 2 THEN 2  -- 延时
                WHEN 3 THEN 3  -- 待发车
                WHEN 4 THEN 99 -- 已完成，优先级最低
                END,
            v.created_at DESC
        `
    const [rows] = await fastify.db.execute(sql)

    // 查询每辆车对应的司机信息
    const vehicleIds = rows.map(r => r.id);
    let driverMap = {};
    if (vehicleIds.length > 0) {
      const [driverRows] = await fastify.db.query(
          `SELECT vd.vehicle_id, d.name, d.phone
             FROM zn_vehicle_drivers vd
                      JOIN zn_drivers d ON vd.driver_id = d.id
             WHERE vd.vehicle_id IN (${vehicleIds.map(() => '?').join(',')})`,
          vehicleIds
      );
      // 构建 vehicle_id -> [{ name, phone }, ...]
      driverMap = driverRows.reduce((acc, cur) => {
        if (!acc[cur.vehicle_id]) acc[cur.vehicle_id] = [];
        acc[cur.vehicle_id].push({ name: cur.name, phone: cur.phone });
        return acc;
      }, {});
    }

    // 给每辆车加上司机信息
    const dataWithDrivers = rows.map(v => ({
      ...v,
      drivers: driverMap[v.id] || []
    }));

    return reply.send({
      data: {
        data: dataWithDrivers
      }
    })
  })
}
export default vehicleRoutes;