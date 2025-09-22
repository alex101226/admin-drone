import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import { pumpStreamToFile } from '../utils/pumpStreamToFile.js'
import {createKnexQuery} from "../utils/knexHelper.js";
import config from '../config/index.js'

//  站内信
async function checkWeatherAndNotify(fastify, weather) {
  const alerts = []

  // 风力检查
  const windLevel = Number((weather.wind_class || '').match(/\d+/)?.[0] || NaN)

  if (!isNaN(windLevel) && windLevel >= 6) {
    alerts.push(`当前风力为 ${weather.wind_class}，超过无人机安全飞行等级。`)
  }

  // 天气现象检查
  if (weather.weather_text && /(雨|雪|冰雹|雷)/.test(weather.weather_text)) {
    alerts.push(`当前天气为 ${weather.weather_text}，不适合无人机执行巡航任务。`)
  }

  // 能见度检查
  if (weather.vis && weather.vis < 2000) {
    alerts.push(`当前能见度仅 ${weather.vis} 米，低于安全飞行要求。`)
  }

  // 温度检查
  if (weather.temperature && (weather.temperature > 40 || weather.temperature < -10)) {
    alerts.push(`当前温度为 ${weather.temperature}℃，超出无人机工作温度范围。`)
  }

  // 空气质量检查
  if (weather.aqi && weather.aqi >= 200) {
    alerts.push(`当前空气质量指数为 ${weather.aqi}，空气污染严重，建议暂停任务。`)
  }


  // 如果有告警，插入站内信
  if (alerts.length > 0) {
    const content = alerts.join('\n')

    const latest = await createKnexQuery(fastify, 'message')
        .where({ type: 'weather' })
        .andWhere('content', content)
        .orderBy('created_at', 'desc')
        .first()

    if (!latest || (Date.now() - new Date(latest.created_at).getTime()) > 30 * 60 * 1000) {
      await createKnexQuery(fastify, 'message').insert({
        title: '天气预警：无人机任务暂停',
        content,
        type: 'weather',
      })
    }
  }
}

async function commonRoutes(fastify) {
  //  上传接口
  fastify.post('/upload', async (request, reply) => {
    try {
      const data = await request.file() // 获取单个文件
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' })
      }

      // 这里能拿到额外字段
      const { fields } = data;
      const extraName = fields?.name?.value;  // 这就是前端 append 的 name

      // 按日期创建目录，比如 2025/08/23
      const today = dayjs().format('YYYY/MM/DD')
      const uploadDir = path.join(process.cwd(), 'uploads', extraName, today)

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
          url: `/uploads/${extraName}/${today}/${newFilename}`, // 可作为访问路径
        },
      })

    } catch(err) {
      fastify.log.error('上传报错================》〉》', err);
      // reply.status(500).send({ error: '服务器错误' });
      throw err;
    }
  })

  //  查找所有的角色
  fastify.get('/getRoles', async (request, reply) => {
    const [rows] = await fastify.db.execute('SELECT * FROM {{role}}')
    return reply.send({
      data: rows
    })
  })

  //  查字典
  fastify.get('/getDict', async (request, reply) => {
    const {type} = request.query
    if (!type) {
      return reply.send({message: '参数错误', code: 400})
    }
    const [rows] = await fastify.db.execute('SELECT * FROM {{dict}} WHERE dict_type = ?', [type])
    return reply.send({
      code: 0,
      data: rows
    })
  })

  //  气象
  fastify.get('/getWeather', async (request, reply) => {
    const {city = '110100'} = request.query

    const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
    // 查询今天的调用次数
    const [stat] = await createKnexQuery(fastify, 'weather_call_stats', '')
        .select('call_count')
        .where('call_date', today)
        .limit(1);
    let callCount = stat ? stat.call_count : 0;

    // ✅ 如果没超过 5000，就去调用 API
    if (callCount < 5000) {
      try {
        const url = `https://api.map.baidu.com/weather/v1/?district_id=${city}&data_type=all&ak=${config.map_ak}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== 0) {
          return reply.send({
            code: 400,
            message: `天气 API 调用失败: ${JSON.stringify(data)}`
          });
        }

        const { location, now, forecasts, forecast_hours, indexes } = data.result;
        const record = {
          city_name: `${location.city}/${location.name}`,
          district_id: location.id,
          weather_text: now.text,
          temperature: now.temp,
          feels_like: now.feels_like,
          humidity: now.rh,
          wind_dir: now.wind_dir,
          wind_class: now.wind_class,
          aqi: now.aqi,
          pm25: now.pm25,
          pm10: now.pm10,
          no2: now.no2,
          so2: now.so2,
          o3: now.o3,
          co: now.co,
          uptime: now.uptime,
          pressure: now.pressure,
          wind_angle: now.wind_angle,
          uvi: now.uvi,
          level: now.level,
          title: now.title,
          desc: now.desc,
          vis: now.vis,
          clouds: now.clouds,
          forecast: JSON.stringify(forecasts),
          forecast_hours: JSON.stringify(forecast_hours),
          indexes: JSON.stringify(indexes),
        };

        // 存到 weather_history
        await createKnexQuery(fastify, 'weather_history').insert(record);

        // 调用检查函数
        await checkWeatherAndNotify(fastify, record)

        // 更新调用次数表
        await createKnexQuery(fastify, 'weather_call_stats')
            .insert({
              call_date: today,
              call_count: 1,
              updated_at: new Date()
            })
            .onConflict('call_date')
            .merge({
              call_count: fastify.knex.raw('call_count + 1'),
              updated_at: new Date()
            });

        return reply.send({
          code: 0,
          data: record
        });
      } catch (err) {
        console.error('请求失败:', err);
        return reply.send({
          code: 500,
          message: '天气数据获取异常'
        });
      }
    }

    // 🚫 超过 5000 次，就返回数据库里最新的一条
    const history = await createKnexQuery(fastify, 'weather_history', 'wh')
        .select('wh.*')
        .where('district_id', city)
        .addOrder('updated_at', 'desc')
        .limit(1);

    if (history.length > 0) {
      // 调用检查函数
      await checkWeatherAndNotify(fastify, history[0])
      return reply.send({
        code: 0,
        data: history[0],
      });
    }

    return reply.send({
      code: 500,
      message: '没有可用的天气数据'
    });
  })

  //  站内信
  fastify.get('/getMessage', async (request, reply) => {
    const [{total}] = await createKnexQuery(fastify, 'message')
        .count({total: '*'})
        .where('status', 0)

    const query = await createKnexQuery(fastify, 'message')
        .select('*')
        .where('status', 0)

    return reply.send({
      data: {
        total,
        data: query
      }
    })
  })

  //  站内信已读
  fastify.post('/readMessage', async (request, reply) => {
    const { message_id } = request.body;
    if (!message_id) {
      return reply.send({ code: 400, message: '参数错误' })
    }
    const result = await createKnexQuery(fastify, 'message')
        .update({ 'status': 1 })
        .where('id', message_id)

    if (result) {
      return reply.send({
        code: 0,
        message: '操作成功'
      })
    }
    return reply.send({
      code: 400,
      message: '操作失败'
    })
  })

  //  无人机巡航区域
  fastify.get('/getRegion', async (request, reply) => {
    const query = await createKnexQuery(fastify, 'region')
        .select('*')
    return reply.send({
      data: query
    })
  })
}
export default commonRoutes;