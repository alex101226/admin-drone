import {createKnexQuery} from "../utils/knexHelper.js";

async function operatorRoutes(fastify) {
  //  操控员查询
  fastify.get('/getOperators', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10 } = request.query;
      const offset = (page - 1) * pageSize;

      const [{ total }] = await createKnexQuery(fastify, 'operator')
          .count({ total: '*' })

      // 1) 子查询：按 operator_id 汇总已完成任务的总秒数
      const ftSubQuery = function() {
        this
            .select('operator_id')
            .sum({ total_hours: fastify.knex.raw('ROUND(TIMESTAMPDIFF(SECOND, start_time, end_time) / 3600, 2)') })
            .from('dr_flight_task')
            .where('status', 3) // 已完成
            .groupBy('operator_id')
            .as('ft');
      };

      // 2) 主查询：operator 左联 字典 + 子查询
      const rows = await fastify.knex('dr_operator as o')
          .leftJoin('dr_dict as d', function() {
            this.on('d.dict_type', '=', fastify.knex.raw('?', ['operator_status']))
                .andOn('d.sort', '=', 'o.status');
          })
          .leftJoin(ftSubQuery, 'ft.operator_id', 'o.id')
          .select(
              'o.*',
              'd.dict_label as status_label',
              fastify.knex.raw('COALESCE(ft.total_hours, 0) as total_hours')
          )
          .orderBy('o.created_at', 'desc')
          .limit(pageSize)
          .offset(offset);

      // 4) 把 total_seconds 转成更友好的格式返回
      function formatSecondsToHMS(sec) {
        sec = Number(sec) || 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      const result = rows.map(r => {
        const totalSeconds = Number(r.total_seconds || 0);
        return {
          ...r,
          total_seconds: totalSeconds, // 原始秒数
          total_hours: (totalSeconds / 3600).toFixed(2), // 小时，保留 2 位小数
          total_time_hms: formatSecondsToHMS(totalSeconds) // hh:mm:ss
        }
      });

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