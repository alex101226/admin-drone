
export default async function logisticsRoutes(fastify) {

  //  查询路线数据
  fastify.get('/getLogistics', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10, name } = request.query;

      const offset = (page - 1) * pageSize;
      const limit = parseInt(pageSize, 10);

      // 统计总数
      const [[{ total }]] = await fastify.db.execute(
          `SELECT COUNT(*) AS total FROM zn_logistics_routes`
      );

      // 主查询
      const [rows] = await fastify.db.execute(
          `
        SELECT 
          r.id, 
          r.route_name,
          r.status,
          r.distance_km,
          r.estimated_time,
          r.start_station_id,
          r.end_station_id,
          s1.name AS start_name,
          s1.address AS start_address,
          s1.lng AS start_lng,
          s1.lat AS start_lat,
          s2.name AS end_name,
          s2.address AS end_address,
          s2.lng AS end_lng,
          s2.lat AS end_lat,
          r.created_at,
          r.updated_at
        FROM zn_logistics_routes r
        LEFT JOIN zn_locations s1 ON r.start_station_id = s1.id
        LEFT JOIN zn_locations s2 ON r.end_station_id = s2.id
        ORDER BY r.created_at DESC
        LIMIT ${offset}, ${limit}
        `);

        return reply.send({
        data: {
          data: rows,
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      fastify.log.error('查询路线捕捉报错', err);
      throw err;
    }
  });

  //  添加路线
  fastify.post('/postLogistics', async (request, reply) => {
    try {
      const {
        route_name,
        start_station_id,
        end_station_id,
        distance_km,
        estimated_time,
        stations = [] // 途径点 ID 数组
      } = request.body;

      // 参数校验
      if (!route_name || !start_station_id || !end_station_id) {
        return reply.send({ code: 400, message: '缺少必要参数' });
      }

      // 插入路线表
      const [result] = await fastify.db.execute(
          `
        INSERT INTO zn_logistics_routes 
          (
           route_name,
           start_station_id,
           end_station_id,
           distance_km,
           estimated_time,
           status,
           created_at,
           updated_at)
        VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
        `,
          [route_name, start_station_id, end_station_id, distance_km, estimated_time]
      );

      const routeId = result.insertId;
      if (routeId) {
        // 插入途径点（如果有）
        for (let i = 0; i < stations.length; i++) {
          const stationId = stations[i];
          await fastify.db.execute(
              `
          INSERT INTO zn_route_stations (route_id, station_id, stop_order)
          VALUES (?, ?, ?)
          `,
              [routeId, stationId, i + 1] // sort_order 从 1 开始
          );
        }

        return reply.send({
          data: {
            route_id: routeId
          },
          message: '添加成功',
          code: 0
        })
      } else {
        return reply.send({
          data: null,
          message: '添加失败',
          code: 400
        })
      }

    } catch(err) {
      fastify.log.error('添加路线捕捉报错', err);
      throw err;
    }
  })

  //  路线禁用/启用
  fastify.post('/postLogisticsSetting', async (request, reply) => {
    const { logistics_id, status } = request.body;
    if (!logistics_id) {
      return reply.send({ code: 400, message: '参数错误' });
    }
    const [result] = await fastify.db.execute(`
    UPDATE zn_logistics_routes SET status = ? WHERE id = ?`, [status, logistics_id])
    if (result.affectedRows > 0) {
      return reply.send({
        code: 0,
        message: '操作成功'
      })
    }
    return reply.send({
      code: 400,
      message: '操作失败'
    })
  })

  //  查看物流位置
  fastify.get('/getCurrentTransport', async (request, reply) => {
    try {
      const { route_id } = request.query;
      if (!route_id) {
        return reply.send({code: 400, message: '参数错误'})
      }
      //  查询起点和终点
      const [rows] = await fastify.db.execute(`
        SELECT
          lr.id,
          lr.route_name,
          lr.start_station_id,
          lr.end_station_id,
          sl.name as start_name,
          sl.address as start_address,
          sl.lng as start_lng,
          sl.lat as start_lat,
          el.name as end_name,
          el.address as end_address,
          el.lng as end_lng,
          el.lat as end_lat
          FROM zn_logistics_routes lr
        LEFT JOIN zn_locations sl ON sl.id = lr.start_station_id
        LEFT JOIN zn_locations el ON el.id = lr.end_station_id
        WHERE lr.id = ?
      `, [route_id])

      const find = rows[0]
      if (!find) {
        return reply.send({code: 400, message: '数据不存在'})
      }

      // 查询途径点
      const sql = `
        SELECT
            rs.route_id,
            rs.stop_order,
            l.id AS station_id,
            l.name,
            l.address,
            l.lng,
            l.lat
        FROM zn_route_stations rs
        JOIN zn_locations l ON rs.station_id = l.id
        WHERE rs.route_id IN (?)
        ORDER BY rs.route_id, rs.stop_order ASC
      `;

      const [stationsRows] = await fastify.db.execute(sql, [route_id]);
      console.log('stationsRows', stationsRows)
      const newArr = [
        {
          id: find.start_station_id,
          name: find.start_name,
          address: find.start_address,
          lng: find.start_lng,
          lat: find.start_lat,
        },
        ...stationsRows,
        {
          id: find.end_station_id,
          name: find.end_name,
          address: find.end_address,
          lng: find.end_lng,
          lat: find.end_lat,
        }
      ]

      return reply.send({
        data: newArr
      });

    } catch (err) {
      fastify.log.error('查询路线捕捉报错', err);
      throw err;
    }
  })
}
