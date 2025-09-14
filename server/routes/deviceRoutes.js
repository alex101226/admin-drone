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
        SELECT *
        FROM {{nest}} n
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
}