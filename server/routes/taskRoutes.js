async function taskRoutes(fastify)  {
  //  获取任务
  fastify.get('/getTask', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query
      const offset = (page - 1) * pageSize;

      const [countRows] = await fastify.db.execute(`SELECT COUNT(*) as total FROM zn_tasks`);
      const total = countRows[0].total;
      const [rows] = await fastify.db.execute(`
    SELECT * FROM zn_tasks
    ORDER BY created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
    `)
      return reply.send({
        code: 0,
        data: {
          page: Number(page),
          pageSize: Number(pageSize),
          totalPages: Math.ceil(total / pageSize),
          total,
          data: rows,
        },
      })
    } catch (err) {
      fastify.log.error('获取任务捕捉报错======>>>>', err)
      throw err;
    }
  })

  //  添加任务
  fastify.post('/createTask', async (request, reply) => {
    try {
      const {
        task_name, user_id, area, qos, nodes, gpu_number, cpu_number, plan_running_time,
        remark
      } = request.body;
      const params = [
        task_name, user_id, area, qos, nodes, gpu_number, cpu_number, plan_running_time,
        remark
      ]
      const sql = `INSERT INTO zn_tasks (
          task_name,
          user_id,
          area,
          qos,
          nodes,
          gpu_number,
          cpu_number,
          plan_running_time,
          remark,
          status,
          created_at,
          updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, SEC_TO_TIME(? * 60), ?, 4, NOW(), NOW())`;

      const [result] = await fastify.db.execute(sql, params);
      const taskId = result.insertId;
      return reply.send({
        code: 0,
        message: '创建成功',
        data: {
          id: taskId,
        }
      })
    } catch (err) {
      fastify.log.error('创建任务捕捉报错======>>>>', err)
      throw err;
    }
  })

  //  任务统计
  fastify.get('/taskStats', async (request, reply) => {
    try {
      const [rows] = await fastify.db.execute(`
          WITH all_resources AS (
              SELECT
                  SUM(IFNULL(nodes,0)) AS total_nodes,
                  SUM(IFNULL(nodes * IFNULL(cpu_number,0),0)) AS total_cpu,
                  SUM(IFNULL(nodes * IFNULL(gpu_number,0),0)) AS total_gpu
              FROM zn_tasks
          ),
               used_resources AS (
                   SELECT
                       SUM(IFNULL(nodes,0)) AS used_nodes,
                       SUM(IFNULL(nodes * IFNULL(cpu_number,0),0)) AS used_cpu,
                       SUM(IFNULL(nodes * IFNULL(gpu_number,0),0)) AS used_gpu
                   FROM zn_tasks
                   WHERE status = 3
               ),
               task_counts AS (
                   SELECT
                       SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) AS running_tasks,
                       SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) AS queued_tasks
                   FROM zn_tasks
               )
          SELECT
              COALESCE(a.total_nodes,0) AS total_nodes,
              COALESCE(a.total_cpu,0) AS total_cpu,
              COALESCE(a.total_gpu,0) AS total_gpu,
              COALESCE(u.used_nodes,0) AS used_nodes,
              COALESCE(u.used_cpu,0) AS used_cpu,
              COALESCE(u.used_gpu,0) AS used_gpu,
              COALESCE(a.total_nodes - u.used_nodes,0) AS free_nodes,
              COALESCE(a.total_cpu - u.used_cpu,0) AS free_cpu,
              COALESCE(a.total_gpu - u.used_gpu,0) AS free_gpu,
              COALESCE(c.running_tasks,0) AS running_tasks,
              COALESCE(c.queued_tasks,0) AS queued_tasks
          FROM all_resources a
                   CROSS JOIN used_resources u
                   CROSS JOIN task_counts c;
    `);

      return reply.send({
        data: rows[0],
      })
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, message: '统计任务信息失败' });
    }
  });

}
export default taskRoutes;