//  生产环境
export default {
  port: 3000,
  host: '0.0.0.0',
  db: {
    port: 3306,
    user: 'znrycl',
    password: 'Root@2025', //  Root@2025
    host: '127.0.0.1',
    database: 'znrycl',
  },
  jwt: {
    secret: 'o2v9WqV3hM8u7zYfHcPqR1s5lTgBj9DkXxN4d0K2SxA=',
    expiresIn: '7d'
  },
}

