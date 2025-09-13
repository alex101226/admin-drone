export default async function deviceRoutes(fastify) {
  //  电子围栏查询
  fastify.get('/getFences', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;

      const offset = (page - 1) * pageSize;
      const limit = parseInt(pageSize, 10);

      // 统计总数
      const [[{ total }]] = await fastify.db.execute(
          `SELECT COUNT(*) AS total FROM zn_electronic_fences`
      );

      // 主查询
      const [rows] = await fastify.db.execute(
          `
        SELECT
            ef.id,
            ef.fence_name,
            ef.fence_type,
            ef.group_key,
            ef.device_location_key,
            ef.remark
        FROM zn_electronic_fences ef
        ORDER BY ef.created_at DESC
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
      fastify.log.error('查询电子围栏捕捉报错', err);
      throw err;
    }
  });


  //  电子围栏添加
  fastify.post('/addFence', async (request, reply) => {
    try {
      const { fence_name, fence_type, group_key, device_location_key, remark } = request.body;

      const sql = `INSERT INTO zn_electronic_fences
    (
        fence_name,
        fence_type,
        group_key,
        device_location_key,
        remark,
        created_at,
        updated_at
    ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`

      // 写入
      const [result] = await fastify.db.execute(sql, [fence_name, fence_type, group_key, device_location_key, remark]);

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
      fastify.log.error('查询电子围栏捕捉报错', err);
      throw err;
    }
  });
}