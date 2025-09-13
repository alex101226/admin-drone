import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import { pumpStreamToFile } from '../utils/pumpStreamToFile.js'

async function commonRoutes(fastify) {
  //  上传接口
  fastify.post('/upload', async (request, reply) => {
    try {
      const data = await request.file() // 获取单个文件
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' })
      }

      // 按日期创建目录，比如 2025/08/23
      const today = dayjs().format('YYYY/MM/DD')
      const uploadDir = path.join(process.cwd(), 'uploads', today)

      // 确保存储目录存在
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      // 拆分文件名和后缀
      const ext = path.extname(data.filename) // .jpeg
      const name = path.basename(data.filename, ext) // video9

      // 保留原文件名
      const timestamp = Date.now()
      const newFilename = `${name}-${timestamp}${ext}`
      const filepath = path.join(uploadDir, newFilename)

      // 将文件写入磁盘
      await pumpStreamToFile(data.file, filepath)

      return reply.send({
        message: '上传成功',
        data: {
          url: `/uploads/${today}/${newFilename}`, // 可作为访问路径
        },
      })

    } catch(err) {
      fastify.log.error('上传报错================》〉》', err);
      // reply.status(500).send({ error: '服务器错误' });
      throw err;
    }
  })

  //  查找所有的司机数据
  fastify.get('/getDriver', async (request, reply) => {
    const [rows] = await fastify.db.execute('SELECT * FROM zn_drivers');
    reply.send({
      data: {
        data: rows
      }
    });
  })

  //  查询所有的地址
  fastify.get('/getLocations', async (request, reply) => {
    const [rows] = await fastify.db.execute('SELECT * FROM zn_locations')
    const [[{ total }]] = await fastify.db.execute('SELECT COUNT(*) AS total FROM zn_locations')

    return reply.send({
      data: {
        data: rows,
        total: total
      }
    })
  })

}
export default commonRoutes;