import { createKnexQuery } from '../utils/knexHelper.js'

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
      const { page = 1, pageSize = 10, name } = request.query;

      const [{ total }] = await createKnexQuery(fastify, 'drone', 'dr')
          .count({ total: '*' })
          .where('is_delete', '0')
      const query = await createKnexQuery(fastify, 'drone', 'dr')
          .select(
              'dr.*',
              'd1.dict_label as status_label',
              'd2.dict_label as camera_label',
              'o.id as operator_id',
              'o.operator_name'
          )
          .addJoin('dict', 'd1', function() {
            this.on('d1.dict_type', '=', fastify.knex.raw('?', ['drone_status']))
                .andOn('d1.sort', '=', 'dr.status');
          })
          .addJoin('dict', 'd2', function() {
            this.on('d2.dict_type', '=', fastify.knex.raw('?', ['camera_model']))
                .andOn('d2.sort', '=', 'dr.camera_specs');
          })
          .addJoin('operator', 'o', function() {
            this.on('dr.operator_id', '=', 'o.id')
          })
          .addCondition('o.id', name)
          .addCondition('dr.is_delete', '0')
          .addOrder('dr.created_at', 'desc')
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
        payload_capacity, camera_specs, operator_id, drone_photo, latitude, longitude
      } = request.body;
      const params = [
        drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo, latitude, longitude
      ]

      const sql = `INSERT INTO {{drone}}
       (
           drone_name, drone_sn, model, status, battery_capacity,
           payload_capacity, camera_specs, operator_id, drone_photo,
           created_at, updated_at, latitude, longitude
       )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?)
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
        id, latitude, longitude
      } = request.body;

      if (!id) {
        return reply.send({message: '参数错误', code: 400})
      }

      const params = [drone_name, drone_sn, model, status, battery_capacity,
        payload_capacity, camera_specs, operator_id, drone_photo, latitude, longitude, id
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
           latitude = ?,
           longitude = ?,
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

  //  无人机删除
  fastify.post('/deleteDrone', async (request, reply) => {
    const { id } = request.body;
    if (!id) {
      return reply.send({
        code: 400, message: '参数错误'
      })
    }

    const [row] = await fastify.db.execute(`SELECT * FROM {{drone}} WHERE id = ?`, [id])
    const drone = row[0]
    if (!drone) {
      return reply.send({ code: 400, message: '数据不存在' })
    }
    const [result] = await fastify.db.execute(`UPDATE {{drone}} SET is_delete = '1' WHERE id = ?`, [id])
    if (result.affectedRows > 0) {
      return reply.send({code: 0, message: '删除成功'})
    }
    return reply.send({code: 400, message: '删除失败'})
  })
}