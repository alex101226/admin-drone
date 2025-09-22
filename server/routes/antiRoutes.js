import {createKnexQuery} from "../utils/knexHelper.js";

async function antiRoutes(fastify) {

  //  反制数据
  fastify.get('/getAnti', async (request, reply) => {
    const { page, pageSize } = request.query;

    const [{ total }] = await createKnexQuery(fastify, 'anti')
        .count({ total: '*' })

    const query = await createKnexQuery(fastify, 'anti')
        .select('*')
        .addOrder('created_at', 'desc')
        .addPagination(page, pageSize);

    return reply.send({
      code: 0,
      data: {
        total,
        data: query,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / pageSize),
      }
    });
  })
}
export default antiRoutes;