import userRoutes from './userRoutes.js'
import commonRoutes from './commonRoutes.js'
import taskRoutes from './taskRoutes.js';
import logisticsRoutes from './logisticsRoutes.js'
import deviceRoutes from './deviceRoutes.js'
import operatorRoutes from './operatorRoutes.js'
import controlRoutes from "./controlRoutes.js";
import antiRoutes from './antiRoutes.js'

//  注册路由
async function routes(fastify) {
  fastify.register(async (instance) => {
    instance.register(userRoutes)
    instance.register(commonRoutes)
    instance.register(taskRoutes)
    instance.register(logisticsRoutes)
    instance.register(deviceRoutes)
    instance.register(operatorRoutes)
    instance.register(controlRoutes)
    instance.register(antiRoutes)
  }, { prefix: '/api' })
}
export default routes;