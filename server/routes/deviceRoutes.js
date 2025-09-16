export default async function deviceRoutes(fastify) {
  //  机巢查询
  fastify.get('/getNests', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;

      const offset = (page - 1) * pageSize;
      const limit = parseInt(pageSize, 10);

      // 统计总数
      const [[{ total }]] = await fastify.db.execute(
          `SELECT COUNT(*) AS total FROM {{nest}}`
      );

      // 主查询
      const [rows] = await fastify.db.execute(
          `
              SELECT
                  n.*,
                  d.dict_label AS status_label
              FROM {{nest}} n
  LEFT JOIN {{dict}} d
              ON d.dict_type = 'nest_status'
                  AND d.sort = n.status
              ORDER BY n.created_at DESC
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
      fastify.log.error('查询机巢捕捉报错', err);
      throw err;
    }
  });

  //  机巢添加
  fastify.post('/addNest', async (request, reply) => {
    try {
      const { nest_name, latitude, longitude, capacity, status } = request.body;

      const params = [nest_name, latitude, longitude, capacity, status]
      const sql = `INSERT INTO {{nest}}
    (
        nest_name,
        latitude,
        longitude,
        capacity,
        status,
        created_at,
        updated_at
    ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`

      // 写入
      const [result] = await fastify.db.execute(sql, params);

      const fenceId = result.insertId
      if (!fenceId) {
        return reply.send({
          code: 400,
          message: '添加失败'
        });
      }
      return reply.send({
        code: 0,
        message: '添加成功'
      });
    } catch (err) {
      fastify.log.error('机巢添加捕捉报错', err);
      throw err;
    }
  });

  //  机巢修改
  fastify.post('/updateNest', async (request, reply) => {
    const { nest_name, latitude, longitude, capacity, status, nest_id } = request.body;
    if (!nest_id) {
      return reply.send({code: 400, message: '参数错误'})
    }
    const [result] = await fastify.db.execute(`
      UPDATE {{nest}} SET 
      nest_name = ?,
      latitude = ?,
      longitude = ?,
      capacity = ?,
      status = ?,
      updated_at = NOW()
      WHERE id = ?
    `, [nest_name, latitude, longitude, capacity, status, nest_id])
    console.log('看下修改', result.affectedRows)
    if (result.affectedRows > 0) {
      return reply.send({ code: 0, message: '修改成功' })
    }
    return reply.send({ code: 400, message: '修改失败' })
  })

  //  无人机查询
  fastify.get('/getDrones', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;
      const offset = (page - 1) * pageSize;

      const [[{total}]] = await fastify.db.execute(`SELECT COUNT(*) AS total FROM {{drone}}`)

      const [rows] = await fastify.db.execute(`
      SELECT dr.*,
      d1.dict_label AS status_label,
      d2.dict_label AS camera_label,
      o.id,
      o.operator_name
      FROM {{drone}} dr
      LEFT JOIN {{dict}} d1 ON d1.dict_type = 'drone_status' AND d1.sort = dr.status
      LEFT JOIN {{dict}} d2 ON d2.dict_type = 'camera_model' AND d2.sort = dr.camera_specs
      LEFT JOIN {{operator}} o ON dr.operator_id = o.id
      ORDER BY dr.updated_at DESC
      LIMIT ${offset}, ${pageSize}
       `)

      return reply.send({
        data: {
          data: rows,
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch(err) {
      fastify.log.error('无人机查询捕捉错误', err)
      throw err;
    }
  })

  //  无人机添加
  fastify.post('/addDrone', async (request, reply) => {
    try {
      const {
        drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo
      } = request.body;
      const params = [
        drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo
      ]

      const sql = `INSERT INTO {{drone}}
       (
           drone_name, drone_sn, model, status, battery_capacity,
           payload_capacity, camera_specs, operator_id, drone_photo,
           created_at, updated_at
       )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `
      const [result] = await fastify.db.execute(sql, params)

      const insertId = result.insertId
      if (!insertId) {
        return reply.send({
          code: 400,
          message: '添加失败',
          data: null
        })
      }
      return reply.send({
        code: 0,
        message: '添加成功',
        data: insertId
      })
    } catch(err) {
      fastify.log.error('无人机添加捕捉错误', err)
      throw err;
    }
  })

  //  无人机修改
  fastify.post('/updateDrone', async (request, reply) => {
    try {
      const {
        drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo,
        id
      } = request.body;

      if (!id) {
        return reply.send({message: '参数错误', code: 400})
      }

      const params = [drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo, id
      ]
      const sql = `
        UPDATE {{drone}} SET
           drone_name = ?,
           drone_sn = ?,
           model = ?,
           status = ?,
           battery_capacity = ?,
           payload_capacity = ?,
           camera_specs = ?,
           operator_id = ?,
           drone_photo = ?,
           updated_at = NOW()
        WHERE id = ?
        `

      const [result] = await fastify.db.execute(sql, params)
      if (result.affectedRows > 0) {
        return reply.send({
          code: 0,
          message: '修改成功'
        })
      }
      return reply.send({
        code: 400,
        message: '修改失败'
      })
    }catch(err) {
      fastify.log.error('无人机添加捕捉错误', err)
      throw err;
    }
  })
}