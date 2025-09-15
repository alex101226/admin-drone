import userRoutes from './userRoutes.js'
import vehicleRoutes from './vehicleRoutes.js'
import commonRoutes from './commonRoutes.js'
import taskRoutes from './taskRoutes.js';
import logisticsRoutes from './logisticsRoutes.js'
import deviceRoutes from './deviceRoutes.js'
import operatorRoutes from './operatorRoutes.js'

//  注册路由
async function routes(fastify) {
  fastify.register(async (instance) => {
    instance.register(userRoutes)
    instance.register(vehicleRoutes)
    instance.register(commonRoutes)
    instance.register(taskRoutes)
    instance.register(logisticsRoutes)
    instance.register(deviceRoutes)
    instance.register(operatorRoutes)
  }, { prefix: '/api' })
}
export default routes;