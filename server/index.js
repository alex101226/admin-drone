// 启动入口
import app from './app.js';
import config from './config/index.js';

// Run the server!
const start = async () => {
  try {
    await app.listen({ port: config.port, host: config.host }, (err, address) => {
      if (err) {
        app.log.error(`地址错误吗: ${err}`)
        process.exit(1)
      }

      app.log.info(`监听地址： ${address}`)
    })
  } catch(e) {
    app.log.error('服务器错了呢', e)
    process.exit(1)
  }
}
start()