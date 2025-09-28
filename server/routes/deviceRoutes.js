import { createKnexQuery } from '../utils/knexHelper.js'

export default async function deviceRoutes(fastify) {
  //  机巢查询
  fastify.get('/getNests', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;

      const offset = (page - 1) * pageSize;
      const limit = parseInt(pageSize, 10);

      // 统计总数
      const [{ total }] = await createKnexQuery(fastify, 'nest')
          .count({total: '*'})

      // 主查询
      const query = await createKnexQuery(fastify, 'nest', 'n')
          .select(
              'n.*',
              'ar.zone_name',
              'ar.center_lng',
              'ar.center_lat',
              'ar.radius'
          )
          .addJoin('area', 'ar', function() {
            this.on('ar.id', '=', 'n.area')
          })
          .addPagination(page, pageSize)
          .addOrder('created_at', 'desc')
      return reply.send({
        data: {
          data: query,
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
      const { nest_name, latitude, longitude, capacity, status, area } = request.body;

      const [nestId] = await createKnexQuery(fastify, 'nest')
          .insert({
            nest_name,
            latitude,
            longitude,
            capacity,
            status,
            area,
            created_at: fastify.knex.fn.now(),
            updated_at: fastify.knex.fn.now(),
          })
      if (!nestId) {
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
    const { nest_name, latitude, longitude, capacity, status, nest_id, area } = request.body;
    if (!nest_id) {
      return reply.send({code: 400, message: '参数错误'})
    }

    const result = await createKnexQuery(fastify, 'nest')
        .where('id', nest_id)
        .update({
          nest_name,
          latitude,
          longitude,
          capacity,
          status,
          area,
          updated_at: fastify.knex.fn.now(),
        })

    if (result) {
      return reply.send({ code: 0, message: '修改成功' })
    }
    return reply.send({ code: 400, message: '修改失败' })
  })

  //  无人机查询
  fastify.get('/getDrones', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10, name } = request.query;

      const [{ total }] = await createKnexQuery(fastify, 'drone')
          .count({ total: '*' })
          .where('is_delete', '0')
          .addCondition('operator_id', name)

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
          .addCondition('dr.operator_id', name)
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

  //  无人机历史飞行记录员
  fastify.get('/droneHistory', async (request, reply) => {
    const {page = 1, pageSize = 10, droneId, operatorId} = request.query;

    // 1️⃣ 主查询
    const query = await createKnexQuery(fastify, 'flight_log', 'fl')
        .addJoin('flight_task', 't', function () {
          this.on('fl.task_id', '=', 't.id');
        })
        .addJoin('route', 'r', function () {
          this.on('t.route_id', '=', 'r.id');
        })
        .addJoin('operator', 'o', function () {
          this.on('t.operator_id', '=', 'o.id');
        })
        .addJoin('dict', 'd', function() {
          this.on('d.dict_type', '=', fastify.knex.raw('?', ['flight_event']))
              .andOn('d.sort', '=', 'fl.event_type');
        })
        .select(
            'fl.id as flight_log_id',
            'fl.altitude',
            'fl.speed',
            'd.dict_label as event_label',
            't.id as task_id',
            't.start_time',
            't.end_time',
            'r.route_name',
            'o.id as operator_id',
            'o.operator_name'
        )
        .modify((qb) => {
          if (droneId) qb.where('fl.drone_id', droneId);
          if (operatorId) qb.where('t.operator_id', operatorId);
        })
        .addOrder('t.start_time', 'desc')
        .addPagination(Number(page), Number(pageSize));

    // 2️⃣ 统计总数
    const [{ total }] = await createKnexQuery(fastify, 'flight_log', 'fl')
        .addJoin('flight_task', 't', function () {
          this.on('fl.task_id', '=', 't.id');
        })
        .modify((qb) => {
          if (droneId) qb.where('fl.drone_id', droneId);
          if (operatorId) qb.where('t.operator_id', operatorId);
        })
        .count({ total: '*' });

    // 3️⃣ 返回结果
    return reply.send({
      data: {
        data: query,
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });

}