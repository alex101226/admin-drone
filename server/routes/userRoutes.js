import { generateToken } from '../utils/jwt.js';

async function userRoutes(fastify) {

  // fastify.get('/', function (request, reply) {
  //   reply.send({ info: 'world' })
  // })

  //  获取所有的用户信息列表
  fastify.get('/getUser', async function (request, reply) {
    try {
      const { page = 1, pageSize = 10, role_id = 2 } = request.query;
      const offset = (page - 1) * pageSize;

      // 查询总数
      const [countRows] = await fastify.db.execute(`
            SELECT COUNT(*) as total FROM {{user}} WHERE role_id = ?
      `, [role_id]);
      const total = countRows[0].total;
      // 查询分页数据
      const [rows] = await fastify.db.execute(`
        SELECT
            u.id,
            u.username,
            u.nickname,
            u.status,
            u.position,
            u.department,
            u.created_at,
            u.role_id,
            r.id,
            r.role_name,
            r.role_description
        FROM {{user}} u
                 INNER JOIN {{role}} r ON u.role_id = r.id
                                       WHERE u.role_id = ?
        ORDER BY u.id DESC
            LIMIT ${pageSize} OFFSET ${offset}
    `, [Number(role_id)]);
      reply.send({
        data: {
          data: rows,
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (err) {
      fastify.log.error(`获取所有的用户信息列表的catch捕捉错误 >>> ${err}`);
      throw err;
    }
  })

  //  创建用户
  fastify.post('/addUser', async function (request, reply) {
    try {
      const { username, nickname, password, status, position, department, role_id } = request.body;

      // 简单校验
      if (!username || !nickname || !password) {
        return reply.send({ code: 400, message: '用户名/昵称/密码不能为空', data: null })
      }

      const rows = await fastify.db.execute(`SELECT username FROM {{user}} WHERE username = ?`, [username]);
      if (rows.username === username) {
        return reply.send({ code: 400, message: '用户已存在', data: null })
      }

      // 1. 加密密码
      const hashedPassword = await fastify.hashPassword(password);

      const sql = `INSERT INTO {{user}} (nickname, username, password, status, position, department, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
      const [result] = await fastify.db.execute(sql, [nickname, username, hashedPassword, status, position, department, role_id]);
      const userId = result.insertId;
      if (userId) {
        // 假设写数据库成功，返回结果
        return reply.send({
          message: '用户创建成功',
          data: {
            userId,
            username,
            nickname,
          },
        });
      }
      return reply.send({
        code: 400,
        message: '用户创建失败',
        data: null,
      });
    } catch(err) {
      fastify.log.error(`创建用户的catch捕捉错误 >>>>>>>>>>>>>>>>>>>>>${err}`);
      throw err;
    }
  })

  //  修改用户信息
  fastify.post('/updateUser', async function (request, reply) {
    try {
      const { id, nickname, position, status, department, role_id } = request.body;
      if (!id) {
        return reply.send({ code: 400, message: '参数错误' })
      }
      const [result] = await fastify.db.execute(
          `UPDATE {{user}}
           SET nickname = ?, \`position\` = ?, \`status\` = ?, department = ?, role_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [nickname, position, status, department, role_id, id]
      );
      if (result.affectedRows > 0) {
        return reply.send({
          message: '用户修改成功',
          data: null,
        });
      } else {
        return reply.send({
          code: 400,
          message: '用户修改失败',
          data: null,
        });
      }
    } catch(err) {
      fastify.log.error(`修改用户的catch捕捉错误 >>>>>>>>>>>>>>>>>>>>>${err}`);
      throw err
    }
  })

  //  用户登录
  fastify.post('/login', async function (request, reply) {
    try {
      const { username, password } = request.body;
      if (!username || !password) {
        return reply.send({ code: 400, message: '用户名或者密码不能为空'})
      }

      // 去 user 表查
      const [rows] = await fastify.db.execute(`SELECT id, username, password, nickname FROM {{user}} WHERE username = ?`, [username]);
      if (rows.length === 0) {
        return reply.send({ code: 400, message: '用户不存在' })
      }

      const user = rows[0];
      //  验证密码
      const isValid = await fastify.verifyPassword(password, user.password);
      if (!isValid) {
        return reply.send({ code: 400, message: '密码错误' })
      }

      //  生成token
      const token = generateToken({ userId: user.id, username: username });

      return reply.send({
        message: "登录成功",
        data: {
          token,
          username: user.username,
          nickname: user.nickname,
          id: user.id,
        }
      });
    } catch(err) {
      fastify.log.error(`用户登录catch捕捉错误-------${err}`);
      throw err;
    }
  })

  //  获取登录用户信息
  fastify.get('/getUserInfo', async function (request, reply) {
    try {
      const { userId } = request.query;
      if (!userId) {
        return reply.send({ code: 400, message: '参数错误' })
      }
      const [rows] = await fastify.db.execute(`
          SELECT
              u.id,
              u.username,
              u.nickname,
              u.department,
              u.position,
              u.status,
              r.id AS role_id,
              r.role_name,
              r.role_description
          FROM {{user}} u
                   INNER JOIN {{role}} r ON u.role_id = r.id
          WHERE u.id = ?
`, [userId]);
      const user = rows[0];
      if (!user) {
        return reply.send({ code: 400, message: '用户不存在' })
      }
      return reply.send({
        message: "success",
        data: {
          position: user.position,
          department: user.department,
          office_location: user.office_location,
          status: user.status,
          role_id: user.role_id,
          role_name: user.role_name,
          role_description: user.role_description,
        }
      })
    } catch(err) {
      fastify.log.error(` 获取登录用户信息catch捕捉错误-------${err}`);
      throw err;
    }
  })

  //  修改密码
  fastify.post('/savePassword', async function (request, reply) {
    try {
      const { userId, password } = request.body;

      const [rows] = await fastify.db.execute(`SELECT username FROM {{user}} WHERE id = ?`, [userId]);

      if (rows.length === 0) {
        return reply.send({ message: '参数错误' })
      }

      const user = rows[0];
      if (user) {
        // 1. 加密密码
        const hashedPassword = await fastify.hashPassword(password);

        const [result] = await fastify.db.execute(
            `UPDATE {{user}} SET
                    password = ?,
                    updated_at = NOW()
                WHERE id = ?`, [hashedPassword, userId]);
        if (result.affectedRows > 0) {
          //  生成token
          const token = generateToken({ userId: user.id, username: user.username });
          return reply.send({
            message: '密码修改成功',
            data: {
              token,
            }
          });
        } else {
          return reply.send({
            code: 400,
            message: '密码修改失败',
            data: null,
          });
        }
      }
    } catch(err) {
      fastify.log.error(`修改密码错误捕捉------>>>>>${err}`);
      throw err;
    }
  })
}

export default userRoutes;