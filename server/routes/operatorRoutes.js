async function operatorRoutes(fastify) {
  //  操控员查询
  fastify.get('/getOperators', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;
      const offset = (page - 1) * pageSize;

      // 统计总数
      const [[{ total }]] = await fastify.db.execute(
          `SELECT COUNT(*) AS total FROM {{operator}}`
      );

      // 主查询
      const [rows] = await fastify.db.execute(
          `
              SELECT
                  o.*,
                  d.dict_label AS status_label
              FROM {{operator}} o
  LEFT JOIN {{dict}} d
              ON d.dict_type = 'operator_status'
                  AND d.sort = o.status
              ORDER BY o.created_at DESC
        LIMIT ${offset}, ${pageSize}
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
      fastify.log.error('查询操控员捕捉报错', err);
      throw err;
    }
  })
  //  新增操控员
  fastify.post('/addOperator', async (request, reply) => {
    try {
      const { operator_name, phone, license_no, license_photo, status } = request.body;

      const params = [operator_name, phone, license_no, license_photo, status]
      const sql = `INSERT INTO {{operator}}
    (
        operator_name,
        phone,
        license_no,
        license_photo,
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
  })
  //  修改操控员
  fastify.post('/updateOperator', async (request, reply) => {
    const { operator_name, phone, license_no, license_photo, status, operator_id } = request.body;
    if (!operator_id) {
      return reply.send({code: 400, message: '参数错误'})
    }
    const [result] = await fastify.db.execute(`
      UPDATE {{operator}} SET
          operator_name = ?,
          phone = ?,
          license_no = ?,
          license_photo = ?,
          status = ?,
          updated_at = NOW()
          WHERE id = ?
    `, [operator_name, phone, license_no, license_photo, status, operator_id])

    if (result.affectedRows > 0) {
      return reply.send({ code: 0, message: '修改成功' })
    }
    return reply.send({ code: 400, message: '修改失败' })
  })
}
export default operatorRoutes;