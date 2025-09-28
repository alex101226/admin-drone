import { createKnexQuery } from '../utils/knexHelper.js'

export default async function logisticsRoutes(fastify) {

  //  线路选择查询
  fastify.get('/getLocations', async (request, reply) => {
    try {
      const query = await createKnexQuery(fastify, 'route', '')
          .select('*')
          .where('is_delete', '0')

      return reply.send({
        data: query
      });
    } catch (err) {
      fastify.log.error('查询路线捕捉报错', err);
      throw err;
    }
  });

  //  查询路线数据
  fastify.get('/getLogistics', async (request, reply) => {
    try {
      const { page = 1, pageSize = 10, route_id } = request.query;

      // 统计总数
      const [{ total }] = await createKnexQuery(fastify, 'route', 'dr')
          .count({ total: '*' })
          .where('is_delete', '0')

      const query = await createKnexQuery(fastify, 'route', 'r')
          .select(
              'r.*',
              fastify.knex.raw(`
                JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'point_index', rp.point_index,
                    'lng', rp.lng,
                    'lat', rp.lat,
                    'name', IFNULL(rp.name, ''),
                    'address', IFNULL(rp.address, '')
                  )
                ) as points
              `)
          )
          .addJoin('route_points', 'rp', function() {
            this.on('rp.route_id', '=', 'r.id')
          })
          .addCondition('r.is_delete', '0')
          .addCondition('r.id', route_id)
          .groupBy('r.id')
          .addOrder('r.created_at', 'desc')
          .addPagination(page, pageSize);

        return reply.send({
          data: {
            data: query,
            page: Number(page),
            pageSize: Number(pageSize),
            totalPages: Math.ceil(total / pageSize),
            total,
          },
        });
    } catch (err) {
      fastify.log.error('查询路线捕捉报错', err);
      throw err;
    }
  });

  //  添加路线
  fastify.post('/postLogistics', async (request, reply) => {
    const trx = await fastify.knex.transaction();
    try {
      const { route_name, status = '1', remark, points, expect_complete_time, area } = request.body

      if (points.length === 0) {
        return reply.send({
          code: 400,
          message: '路线不存在'
        })
      }


      const [routeId] = await createKnexQuery(fastify, 'route', '', trx)
          .insert({route_name, remark, status, is_delete: '0', expect_complete_time, area
          });

      if (!routeId) {
        return reply.send({
          code: 400,
          message: '添加失败'
        })
      }
      const pointsData = points.map((p, idx) => ({
        route_id: routeId,
        point_index: idx,
        lng: p.lng,
        lat: p.lat,
        name: p.name || null,
        address: p.address || null,
      }));

      await createKnexQuery(fastify, 'route_points', '', trx).insert(pointsData);
      await trx.commit();
      return reply.send({
        code: 0,
        message: '添加成功'
      })

    } catch(err) {
      await trx.rollback();
      fastify.log.error('添加路线捕捉报错', err);
      throw err;
    }
  })

  //  路线修改
  fastify.post('/updateLogistics', async (request, reply) => {
    const trx = await fastify.knex.transaction();
    try {
      const { routeId, route_name, remark, status = '1', points, expect_complete_time, area } = request.body
      if (!routeId) {
        return reply.send({
          code: 400,
          message: '参数错误'
        })
      }

      if (!points.length) {
        return reply.send({
          code: 400,
          message: '路线不能为空'
        })
      }

      // 更新路线基本信息
      await createKnexQuery(fastify, 'route', 'dr', trx)
          .where({ id: routeId, is_delete: '0' })
          .update({
            route_name,
            remark,
            status,
            expect_complete_time,
            area,
            updated_at: fastify.knex.fn.now()
          });

      // 删除旧的路线点
      await createKnexQuery(fastify, 'route_points', 'dr', trx)
          .where({ route_id: routeId }).del();

      // 新增新的路线点
      const pointsData = points.map((p, idx) => ({
        route_id: routeId,
        point_index: idx,
        lng: p.lng,
        lat: p.lat,
        name: p.name || null,
        address: p.address || null,
      }));

      await createKnexQuery(fastify, 'route_points', '', trx).insert(pointsData);

      await trx.commit();
      return reply.send({
        code: 0,
        message: '修改成功'
      })
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  })

  //  获取可选区域  available
  fastify.get('/availableArea', async (request, reply) => {
    const { page = 1, pageSize = 10 } = request.query;
    const [{ total }] = await createKnexQuery(fastify, 'area', '')
        .count({ total: '*' })

    const query = await createKnexQuery(fastify, 'area', '')
        .select('*')
        .addPagination(page, pageSize)

    return reply.send({
      data: {
        data: query,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / pageSize),
        total,
      }
    })
  })

  //  区域添加
  fastify.post('/addArea', async (request, reply) => {
    try {
      const { zone_name, center_lng, center_lat, radius } = request.body;

      const [areaId] = await createKnexQuery(fastify, 'area')
          .insert({
            zone_name,
            center_lng,
            center_lat,
            radius,
            created_at: fastify.knex.fn.now(),
            updated_at: fastify.knex.fn.now(),
          })

      if (!areaId) {
        return reply.send({
          code: 400,
          message: '添加失败'
        })
      }
      return reply.send({
        code: 0,
        message: '添加成功'
      })

    } catch (e) {

    }

  })
}
